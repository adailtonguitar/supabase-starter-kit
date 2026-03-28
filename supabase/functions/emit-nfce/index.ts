/**
 * emit-nfce — Edge Function de emissão NFC-e via Nuvem Fiscal
 * 
 * Otimizada para Supabase Edge (Deno runtime):
 * - safeFetch com AbortController e timeout em TODOS os fetch externos
 * - Sem pós-processamento pesado (logo sync, XML download/upload removidos do fluxo emit)
 * - Try/catch global — sempre retorna JSON
 * 
 * Ações: emit, emit_from_sale, consult_status, cancel, download_pdf, download_xml, inutilize, backup_xmls
 */

import { corsHeaders, createServiceClient, jsonResponse, requireCompanyMembership, requireUser } from "../_shared/auth.ts";
import {
  getPaymentChange,
  getPrimaryPaymentMethod,
  mapPdvMethodToTPag,
  parseSalePaymentsJson,
} from "../_shared/sale-payments.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Server configuration error: Missing ${name}.`);
  }
  return value;
}

function getSupabaseRuntimeConfig() {
  return {
    supabaseUrl: getRequiredEnv("SUPABASE_URL"),
    anonKey: getRequiredEnv("SUPABASE_ANON_KEY"),
    serviceRoleKey: getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

async function parseRequestJsonSafe(req: Request): Promise<Record<string, any>> {
  const raw = await req.text().catch(() => "");
  if (!raw.trim()) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new Error("JSON inválido no corpo da requisição");
  }
}

async function parseResponseJsonSafe(resp: Response, label: string): Promise<any | null> {
  const raw = await resp.text().catch(() => "");
  if (!raw.trim()) return null;

  try {
    return JSON.parse(raw);
  } catch {
    console.error(`[emit-nfce] Resposta inválida em ${label}:`, raw.slice(0, 500));
    throw new Error(`Resposta inválida de ${label}`);
  }
}

function extractProviderErrorMessage(data: any, status: number, fallback: string): string {
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    const candidates = [data.mensagem, data.message, data.error, data.detail, data.title]
      .filter((value) => typeof value === "string" && value.trim().length > 0);
    if (candidates.length > 0) return String(candidates[0]);
  }
  return `${fallback} (status ${status})`;
}

// ─── safeFetch: AbortController + timeout (compatível com Supabase Edge Runtime) ───
async function safeFetch(url: string, options: RequestInit = {}, timeout = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === "AbortError") {
      throw new Error(`Request timeout após ${timeout}ms: ${url.split("?")[0]}`);
    }
    throw error;
  }
}

// ─── Nuvem Fiscal Auth ───
async function getNuvemFiscalToken(): Promise<string> {
  const clientId = Deno.env.get("NUVEM_FISCAL_CLIENT_ID");
  const clientSecret = Deno.env.get("NUVEM_FISCAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Credenciais da Nuvem Fiscal não configuradas");

  const resp = await safeFetch("https://auth.nuvemfiscal.com.br/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "nfce nfe empresa",
    }),
  }, 6000);

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Erro autenticação Nuvem Fiscal: ${errText}`);
  }

  const data = await parseResponseJsonSafe(resp, "auth Nuvem Fiscal");
  if (!data?.access_token) {
    throw new Error("Token da Nuvem Fiscal não retornado");
  }
  return data.access_token;
}

function getApiBaseUrl(): string {
  const isSandbox = Deno.env.get("NUVEM_FISCAL_SANDBOX") === "true";
  return isSandbox
    ? "https://api.sandbox.nuvemfiscal.com.br"
    : "https://api.nuvemfiscal.com.br";
}

function onlyDigits(v: unknown): string {
  return String(v ?? "").replace(/[^0-9]/g, "");
}

function sanitizeSefazText(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value : "";
  let s = raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/[^\x21-\xFF ]/g, "");
  if (!s) return fallback;
  return s;
}

async function resolveNuvemFiscalDocId(params: {
  token: string;
  baseUrl: string;
  endpoint: "nfce" | "nfe";
  ambiente: "homologacao" | "producao";
  cpfCnpj: string;
  chave: string;
}): Promise<string | null> {
  const url = new URL(`${params.baseUrl}/${params.endpoint}`);
  url.searchParams.set("$top", "1");
  url.searchParams.set("$skip", "0");
  url.searchParams.set("ambiente", params.ambiente);
  url.searchParams.set("cpf_cnpj", params.cpfCnpj);
  url.searchParams.set("chave", params.chave);

  const resp = await safeFetch(url.toString(), {
    headers: { Authorization: `Bearer ${params.token}` },
  }, 6000);
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null) as any;
  const first = Array.isArray(data?.data) ? data.data[0] : null;
  const id = first?.id;
  return typeof id === "string" && id ? id : null;
}

async function resolveProviderDocRef(params: {
  supabase: ReturnType<typeof createServiceClient>;
  token: string;
  baseUrl: string;
  endpoint: "nfce" | "nfe";
  companyId?: string | null;
  accessKey: string;
}): Promise<string> {
  const keyDigits = onlyDigits(params.accessKey);
  const isAccessKey = keyDigits.length === 44;
  if (!isAccessKey) return String(params.accessKey);

  if (params.companyId) {
    const { data: docRow } = await params.supabase
      .from("fiscal_documents")
      .select("nuvem_fiscal_id")
      .eq("company_id", String(params.companyId))
      .eq("access_key", keyDigits)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const docId = String((docRow as { nuvem_fiscal_id?: string | null } | null)?.nuvem_fiscal_id || "").trim();
    if (docId) return docId;

    const { data: company } = await params.supabase
      .from("companies")
      .select("cnpj")
      .eq("id", String(params.companyId))
      .maybeSingle();

    const cpfCnpj = onlyDigits(company?.cnpj);
    const ambiente: "homologacao" | "producao" = Deno.env.get("NUVEM_FISCAL_SANDBOX") === "true" ? "homologacao" : "producao";
    if (cpfCnpj.length >= 11) {
      const resolved = await resolveNuvemFiscalDocId({
        token: params.token,
        baseUrl: params.baseUrl,
        endpoint: params.endpoint,
        ambiente,
        cpfCnpj,
        chave: keyDigits,
      });
      if (resolved) return resolved;
    }
  }

  return keyDigits;
}

// ─── Numeração segura (atômica via RPC) ───
async function getNextNumberSafe(supabase: ReturnType<typeof createClient>, configId: string): Promise<number> {
  const { data, error } = await supabase.rpc("next_fiscal_number" as any, {
    p_config_id: configId,
  } as any);

  if (error) {
    console.error("[emit-nfce] Erro na numeração atômica:", error.message);
    throw new Error(`Erro ao obter próximo número fiscal: ${error.message}`);
  }

  const next = data as number;
  if (!next || next < 1) {
    throw new Error("Numeração fiscal retornou valor inválido");
  }

  return next;
}

// ─── CST/CSOSN de ST ───
const CSOSN_ST = new Set(["201", "202", "203"]);
const CST_ST = new Set(["10", "30", "70"]);

// ─── Construtor de bloco ICMS por regime ───
function buildIcmsBlock(item: any, isSimples: boolean) {
  const cst = (item.cst || "").trim();
  const origem = Number(item.origem) || 0;
  const vProd = item.qty * item.unit_price - (item.discount || 0);
  const aliqIcms = item.icms_aliquota || 0;

  if (isSimples) {
    if (CSOSN_ST.has(cst)) {
      const mva = item.mva != null && item.mva > 0 ? item.mva : 40;
      const bcST = vProd * (1 + mva / 100);
      const icmsST = bcST * (aliqIcms / 100);
      return {
        ICMSSN201: {
          orig: origem, CSOSN: cst, modBCST: 4, pMVAST: mva,
          vBCST: Math.round(bcST * 100) / 100, pICMSST: aliqIcms,
          vICMSST: Math.round(icmsST * 100) / 100,
        },
      };
    }
    if (cst === "500") {
      return { ICMSSN500: { orig: origem, CSOSN: "500" } };
    }
    return { ICMSSN102: { orig: origem, CSOSN: cst || "102" } };
  }

  if (CST_ST.has(cst)) {
    const mva = item.mva != null && item.mva > 0 ? item.mva : 40;
    const vBC = vProd;
    const vICMS = vBC * (aliqIcms / 100);
    const bcST = vProd * (1 + mva / 100);
    const icmsSTTotal = bcST * (aliqIcms / 100);
    const icmsST = Math.max(0, icmsSTTotal - vICMS);
    return {
      ICMS10: {
        orig: origem, CST: cst, modBC: 3,
        vBC: Math.round(vBC * 100) / 100, pICMS: aliqIcms, vICMS: Math.round(vICMS * 100) / 100,
        modBCST: 4, pMVAST: mva, vBCST: Math.round(bcST * 100) / 100,
        pICMSST: aliqIcms, vICMSST: Math.round(icmsST * 100) / 100,
      },
    };
  }
  if (cst === "60") {
    return { ICMS60: { orig: origem, CST: "60" } };
  }
  if (cst === "40" || cst === "41" || cst === "50") {
    return { ICMS40: { orig: origem, CST: cst } };
  }
  if (cst === "20") {
    return {
      ICMS20: {
        orig: origem, CST: "20", modBC: 3, pRedBC: 0,
        vBC: Math.round(vProd * 100) / 100, pICMS: aliqIcms,
        vICMS: Math.round(vProd * (aliqIcms / 100) * 100) / 100,
      },
    };
  }
  const vBC = vProd;
  const vICMS = vBC * (aliqIcms / 100);
  return {
    ICMS00: {
      orig: origem, CST: cst || "00", modBC: 3,
      vBC: Math.round(vBC * 100) / 100, pICMS: aliqIcms,
      vICMS: Math.round(vICMS * 100) / 100,
    },
  };
}

// ─── Construtor de PIS/COFINS ───
function buildPisCofins(pisCst: string, cofinsCst: string, vProd: number) {
  const pis: any = {};
  const cofins: any = {};
  const ntCst = new Set(["04", "05", "06", "07", "08", "09"]);

  if (["01", "02"].includes(pisCst)) {
    pis.PISAliq = { CST: pisCst, vBC: Math.round(vProd * 100) / 100, pPIS: 0.65, vPIS: Math.round(vProd * 0.0065 * 100) / 100 };
  } else if (ntCst.has(pisCst)) {
    pis.PISNT = { CST: pisCst };
  } else {
    pis.PISOutr = { CST: pisCst || "49", vBC: 0, pPIS: 0, vPIS: 0 };
  }

  if (["01", "02"].includes(cofinsCst)) {
    cofins.COFINSAliq = { CST: cofinsCst, vBC: Math.round(vProd * 100) / 100, pCOFINS: 3.0, vCOFINS: Math.round(vProd * 0.03 * 100) / 100 };
  } else if (ntCst.has(cofinsCst)) {
    cofins.COFINSNT = { CST: cofinsCst };
  } else {
    cofins.COFINSOutr = { CST: cofinsCst || "49", vBC: 0, pCOFINS: 0, vCOFINS: 0 };
  }

  return { PIS: pis, COFINS: cofins };
}

// ════════════════════════════════════════════════
// HANDLERS
// ════════════════════════════════════════════════

async function handleEmit(supabase: any, body: any) {
  const t0 = Date.now();
  const { sale_id, company_id, config_id, form } = body;

  if (!sale_id || !form) {
    return jsonResponse({ error: "Dados incompletos: sale_id e form são obrigatórios" }, 400);
  }

  // Rate limiting
  if (company_id) {
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_company_id: company_id,
      p_fn_name: "emit-nfce",
      p_max_calls: 30,
      p_window_sec: 60,
    });
    if (allowed === false) {
      return jsonResponse({ error: "Limite de emissões excedido. Aguarde 1 minuto." }, 429);
    }
  }

  // Buscar empresa + config fiscal em PARALELO (reduz latência ~50%)
  const companyPromise = supabase.from("companies").select("*").eq("id", company_id).single();
  const configPromise = config_id
    ? supabase.from("fiscal_configs").select("*").eq("id", config_id).single()
    : supabase.from("fiscal_configs").select("*")
        .eq("company_id", company_id).eq("doc_type", "nfce").eq("is_active", true).limit(1).maybeSingle();

  const [companyRes, configRes] = await Promise.all([companyPromise, configPromise]);

  const company = companyRes.data;
  if (companyRes.error || !company) {
    return jsonResponse({ error: "Empresa não encontrada" }, 404);
  }

  let config = configRes.data;
  // Fallback: se config_id foi passado mas não encontrou, buscar por company_id
  if (!config && config_id) {
    const { data } = await supabase.from("fiscal_configs").select("*")
      .eq("company_id", company_id).eq("doc_type", "nfce").eq("is_active", true).limit(1).maybeSingle();
    config = data;
  }
  if (!config) {
    return jsonResponse({ error: "Configuração fiscal NFC-e não encontrada. Acesse Fiscal > Configuração." }, 400);
  }

  // Validação IE
  const ieClean = (company.ie || company.state_registration || "").replace(/\D/g, "");
  if (!ieClean || ieClean.length < 2) {
    return jsonResponse({ error: "Inscrição Estadual (IE) não configurada." }, 400);
  }

  // Certificado expirado (check rápido, sem notificações pesadas)
  if (config.certificate_expiry) {
    const expiryDate = new Date(config.certificate_expiry);
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry <= 0) {
      return jsonResponse({ error: `Certificado digital A1 EXPIRADO em ${expiryDate.toLocaleDateString("pt-BR")}. Renove antes de emitir.` }, 400);
    }
    if (daysUntilExpiry <= 30) {
      console.warn(`[emit-nfce] ⚠️ Certificado A1 expira em ${daysUntilExpiry} dias`);
    }
  }

  // CRT e regime
  const crt = form.crt || company.crt || 1;
  const isSimples = crt === 1 || crt === 2;

  // Numeração
  const numero = await getNextNumberSafe(supabase, config.id);

  // Ambiente
  const ambiente = config.environment === "producao" ? "producao" : "homologacao";

  // Itens
  const items = form.items || [];
  if (items.length === 0) {
    return jsonResponse({ error: "Nenhum item na venda" }, 400);
  }

  // Totalizadores
  let totalVProd = 0, totalVDesc = 0, totalVICMS = 0, totalVBCST = 0, totalVST = 0, totalVPIS = 0, totalVCOFINS = 0;

  const detItems = items.map((item: any, i: number) => {
    const ncm = (item.ncm || "").replace(/\D/g, "");
    if (!ncm || ncm.length < 2 || ncm === "00000000") {
      throw new Error(`Item ${i + 1} ("${item.name}") sem NCM válido.`);
    }

    const cfop = (item.cfop || "5102").trim();
    if (!cfop || cfop.length !== 4) {
      throw new Error(`Item ${i + 1} ("${item.name}") com CFOP inválido: "${cfop}"`);
    }

    const qty = item.qty || item.quantity || 1;
    const unitPrice = item.unit_price || 0;
    const discount = Math.round((item.discount || 0) * 100) / 100;
    const vProd = Math.round(qty * unitPrice * 100) / 100;
    const vProdLiq = vProd - discount;

    totalVProd += vProd;
    totalVDesc += discount;

    const icmsBlock = buildIcmsBlock({ ...item, qty, unit_price: unitPrice, discount }, isSimples);

    const icmsKey = Object.keys(icmsBlock)[0];
    const icmsData = (icmsBlock as any)[icmsKey];
    if (icmsData.vICMS) totalVICMS += icmsData.vICMS;
    if (icmsData.vBCST) totalVBCST += icmsData.vBCST;
    if (icmsData.vICMSST) totalVST += icmsData.vICMSST;

    const pisCst = item.pis_cst || (isSimples ? "49" : "01");
    const cofinsCst = item.cofins_cst || (isSimples ? "49" : "01");
    const { PIS, COFINS } = buildPisCofins(pisCst, cofinsCst, vProdLiq);

    if (PIS.PISAliq) totalVPIS += PIS.PISAliq.vPIS;
    if (COFINS.COFINSAliq) totalVCOFINS += COFINS.COFINSAliq.vCOFINS;

    const prodBlock: any = {
      cProd: item.product_id || String(i + 1),
      cEAN: "SEM GTIN", xProd: item.name, NCM: ncm, CFOP: cfop,
      uCom: item.unit || "UN", qCom: qty, vUnCom: unitPrice, vProd,
      cEANTrib: "SEM GTIN", uTrib: item.unit || "UN", qTrib: qty, vUnTrib: unitPrice, indTot: 1,
    };

    if (item.cest) prodBlock.CEST = String(item.cest).replace(/\D/g, "");

    const det: any = { nItem: i + 1, prod: prodBlock, imposto: { ICMS: icmsBlock, PIS, COFINS } };
    if (discount > 0) det.prod.vDesc = discount;

    return det;
  });

  const vNF = Math.round((totalVProd - totalVDesc + totalVST) * 100) / 100;

  // Pagamento
  const troco = form.change || 0;
  const detPag: any[] = [];
  const mainTpag = form.payment_method || "01";

  if (form.payments && Array.isArray(form.payments) && form.payments.length > 0) {
    for (const p of form.payments) {
      detPag.push({ tPag: p.tPag || p.method || "99", vPag: Math.round((p.vPag || p.value || 0) * 100) / 100 });
    }
  } else {
    detPag.push({ tPag: mainTpag, vPag: Math.round((form.payment_value || vNF) * 100) / 100 });
  }

  const pagBlock: any = { detPag };
  if (troco > 0) pagBlock.vTroco = Math.round(troco * 100) / 100;

  // Destinatário
  let dest: any = undefined;
  if (form.customer_doc) {
    const docClean = form.customer_doc.replace(/\D/g, "");
    if (docClean.length === 11) dest = { CPF: docClean };
    else if (docClean.length === 14) dest = { CNPJ: docClean };
    if (dest && form.customer_name) dest.xNome = form.customer_name;
  }

  // Emitente
  const cnpjClean = (company.cnpj || "").replace(/\D/g, "");
  const ieEmitClean = (company.ie || company.state_registration || "").replace(/\D/g, "");

  const ibgeCode = company.ibge_code || company.city_code || company.address_ibge_code || "";
  const ibgeClean = String(ibgeCode).replace(/\D/g, "");
  if (!ibgeClean || ibgeClean.length < 7 || ibgeClean === "0000000") {
    return jsonResponse({ error: `Código IBGE do município não configurado ou inválido ("${ibgeCode}").` }, 400);
  }

  const emit: Record<string, unknown> = {
    CNPJ: cnpjClean,
    xNome: sanitizeSefazText(company.name || company.trade_name, "EMITENTE"),
    CRT: crt,
  };
  if (ieEmitClean) emit.IE = ieEmitClean;

  if (company.street || company.address) {
    emit.enderEmit = {
      xLgr: sanitizeSefazText(company.street || company.address || "Rua não informada", "Rua não informada"),
      nro: company.number || company.address_number || "S/N",
      xBairro: sanitizeSefazText(company.neighborhood || "Centro", "Centro"),
      cMun: ibgeClean,
      xMun: sanitizeSefazText(company.city || "Não informada", "Não informada"),
      UF: sanitizeSefazText(company.state || "MA", "MA"),
      CEP: (company.zip_code || company.cep || "00000000").replace(/\D/g, ""),
      cPais: "1058", xPais: "Brasil",
    };
    if (company.complement) (emit.enderEmit as Record<string, unknown>).xCpl = company.complement;
  }

  let infAdFisco = "";
  if (isSimples) infAdFisco = "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL";
  const infAdic: any = {};
  if (infAdFisco) infAdic.infAdFisco = infAdFisco;
  if (form.inf_adic) infAdic.infCpl = form.inf_adic;

  // Payload
  const payload: any = {
    ambiente,
    infNFe: {
      versao: "4.00",
      ide: {
        cUF: getUfCode(company.state || "MA"),
        natOp: form.nat_op || "VENDA DE MERCADORIA",
        mod: 65, serie: config.serie || 1, nNF: numero,
        dhEmi: new Date().toISOString(),
        tpNF: 1, idDest: 1, cMunFG: ibgeClean,
        tpImp: 4, tpEmis: 1,
        tpAmb: ambiente === "producao" ? 1 : 2,
        finNFe: 1, indFinal: 1, indPres: 1,
        procEmi: 0, verProc: "AnthoSystem 1.0",
      },
      emit,
      det: detItems,
      transp: { modFrete: 9 },
      total: {
        ICMSTot: {
          vBC: Math.round((totalVICMS > 0 ? totalVProd : 0) * 100) / 100,
          vICMS: Math.round(totalVICMS * 100) / 100,
          vICMSDeson: 0, vFCP: 0,
          vBCST: Math.round(totalVBCST * 100) / 100,
          vST: Math.round(totalVST * 100) / 100,
          vFCPST: 0, vFCPSTRet: 0,
          vProd: Math.round(totalVProd * 100) / 100,
          vFrete: 0, vSeg: 0,
          vDesc: Math.round(totalVDesc * 100) / 100,
          vII: 0, vIPI: 0, vIPIDevol: 0,
          vPIS: Math.round(totalVPIS * 100) / 100,
          vCOFINS: Math.round(totalVCOFINS * 100) / 100,
          vOutro: 0, vNF,
        },
      },
      pag: pagBlock,
    },
  };

  if (dest) payload.infNFe.dest = dest;
  if (Object.keys(infAdic).length > 0) payload.infNFe.infAdic = infAdic;

  console.log(`[emit-nfce] ▶ Emitindo NFC-e #${numero} | CNPJ: ${cnpjClean} | CRT: ${crt} | Amb: ${ambiente} | Itens: ${items.length} | Total: ${vNF}`);

  // ─── Autenticação Nuvem Fiscal ───
  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();

  console.log(`[emit-nfce] ▶ Enviando para Nuvem Fiscal...`);

  // ─── Emissão com safeFetch (timeout 10s) ───
  const nfResp = await safeFetch(`${baseUrl}/nfce`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }, 10000);

  const nfData = await parseResponseJsonSafe(nfResp, "emissão NFC-e");

  console.log(`[emit-nfce] ◀ Resposta Nuvem Fiscal: status=${nfResp.status} | ${Date.now() - t0}ms`);

  if (!nfResp.ok) {
    const baseErrMsg = nfData?.mensagem || nfData?.error?.message || nfData?.message || JSON.stringify(nfData);
    const validationList = [
      ...(Array.isArray(nfData?.errors) ? nfData.errors : []),
      ...(Array.isArray(nfData?.violations) ? nfData.violations : []),
      ...(Array.isArray(nfData?.details) ? nfData.details : []),
    ];
    const firstValidation = validationList[0];
    const fieldPath = firstValidation?.propertyPath || firstValidation?.field || firstValidation?.path || "";
    const fieldMessage = firstValidation?.message || firstValidation?.error || firstValidation?.reason || "";
    const validationHint = fieldPath && fieldMessage ? `${fieldPath}: ${fieldMessage}` : (fieldMessage || "");
    const rawHint = !validationHint && String(baseErrMsg).toLowerCase().includes("validation failed")
      ? `payload: ${JSON.stringify(nfData).slice(0, 700)}` : "";
    const errMsg = validationHint ? `${baseErrMsg} — ${validationHint}` : (rawHint ? `${baseErrMsg} — ${rawHint}` : baseErrMsg);
    console.error(`[emit-nfce] ✗ Erro Nuvem Fiscal [${nfResp.status}]:`, errMsg);

    const rejAccessKey = nfData?.chave || nfData?.chave_acesso || nfData?.access_key || null;
    const rejProtocol = nfData?.protocolo || nfData?.numero_protocolo || null;
    const rejReason = nfData?.motivo || nfData?.xMotivo || nfData?.rejection_reason || errMsg;
    const rejCode = nfData?.codigo_status || nfData?.cStat || null;

    const rejRow: Record<string, unknown> = {
      company_id, doc_type: "nfce", number: numero, serie: config.serie || 1,
      status: "rejeitada", total_value: vNF, environment: ambiente,
      customer_name: form.customer_name || null, customer_cpf_cnpj: form.customer_doc || null,
      payment_method: mainTpag, access_key: rejAccessKey, protocol_number: rejProtocol,
      rejection_reason: rejCode ? `[${rejCode}] ${rejReason}` : rejReason, is_contingency: false,
    };
    if (sale_id) rejRow.sale_id = String(sale_id);
    await supabase.from("fiscal_documents").insert(rejRow);

    return jsonResponse({ success: false, error: errMsg, rejection_reason: rejReason, details: nfData }, 400);
  }

  // Detectar status
  const statusStr = (nfData.status || "").toLowerCase();
  const cStatStr = String(nfData.codigo_status || nfData.cStat || "");
  const accessKey = nfData.chave || nfData.chave_acesso || nfData.access_key || "";
  const nuvemFiscalId = nfData.id || nfData.nuvem_fiscal_id || nfData.document_id || nfData.documento_id || null;
  const protocolNumber = nfData.protocolo || nfData.numero_protocolo || "";

  const isAuthorized = statusStr.includes("autoriz") || statusStr.includes("aprovad") || cStatStr === "100";
  const isContingency = statusStr.includes("contingencia") || statusStr.includes("contingência");
  const isPending = statusStr.includes("pendente") || statusStr.includes("processando");

  let finalStatus: string;
  if (isAuthorized) finalStatus = "autorizada";
  else if (isContingency) finalStatus = "contingencia";
  else if (isPending) finalStatus = "pendente";
  else finalStatus = "pendente";

  // Salvar documento fiscal
  const mainPayMethod = detPag[0]?.tPag || "99";
  const insertRow: Record<string, unknown> = {
    company_id, doc_type: "nfce", number: numero, serie: config.serie || 1,
    access_key: accessKey || null, protocol_number: protocolNumber || null,
    status: finalStatus, total_value: vNF, environment: ambiente,
    customer_name: form.customer_name || null, customer_cpf_cnpj: form.customer_doc || null,
    payment_method: mainPayMethod, is_contingency: isContingency,
  };
  if (nuvemFiscalId) insertRow.nuvem_fiscal_id = String(nuvemFiscalId);
  if (sale_id) insertRow.sale_id = String(sale_id);

  const insertRes = await supabase.from("fiscal_documents").insert(insertRow);
  if (insertRes.error) {
    console.error("[emit-nfce] Falha ao registrar fiscal_documents:", insertRes.error.message);
    return jsonResponse({ success: false, error: "Falha ao registrar documento fiscal no banco" }, 500);
  }

  // Reconciliar venda
  try {
    if (sale_id) {
      const saleUpdate: Record<string, unknown> =
        finalStatus === "autorizada"
          ? { status: "emitida", nfce_number: String(numero) }
          : { status: "pendente_fiscal" };
      await supabase.from("sales").update(saleUpdate).eq("id", String(sale_id)).eq("company_id", String(company_id));
    }
  } catch (e) {
    console.warn("[emit-nfce] Falha ao atualizar sales após emissão");
  }

  // ─── NÃO fazemos mais: syncAppLogoToNuvemFiscal, download XML, upload storage ───
  // Essas operações foram removidas para evitar EarlyDrop/timeout.
  // O XML pode ser baixado on-demand via action download_xml.

  console.log(`[emit-nfce] ✓ NFC-e #${numero} → ${finalStatus} | Chave: ${accessKey?.substring(0, 20)}... | ${Date.now() - t0}ms total`);

  return jsonResponse({
    success: true,
    status: finalStatus,
    number: numero,
    access_key: accessKey,
    protocol: protocolNumber,
  });
}

// ─── Emissão a partir de uma venda já gravada ───
async function handleEmitFromSale(supabase: any, body: any) {
  const { sale_id, company_id, config_id } = body as { sale_id?: unknown; company_id?: unknown; config_id?: unknown };
  const saleId = String(sale_id || "");
  const companyId = String(company_id || "");
  if (!saleId || !companyId) {
    return jsonResponse({ error: "Dados incompletos: sale_id e company_id são obrigatórios" }, 400);
  }

  // Tentativa ÚNICA — sem retry com delay (a fila fiscal reprocessa automaticamente)
  const [saleRes, itemsRes] = await Promise.all([
    supabase.from("sales")
      .select("total, total_value, payments, payment_method")
      .eq("id", saleId).eq("company_id", companyId).maybeSingle(),
    supabase.from("sale_items")
      .select("product_id, product_name, quantity, unit_price, discount_percent")
      .eq("sale_id", saleId).eq("company_id", companyId),
  ]);

  const sale = saleRes.data;
  if (saleRes.error || !sale) {
    console.warn(`[emit-nfce] Venda não encontrada: sale_id=${saleId}`);
    return jsonResponse({ success: false, status: "pending", pending: true, error: "Venda não encontrada", sale_id: saleId }, 200);
  }

  const items = itemsRes.data as any[] | null;
  if (itemsRes.error) {
    return jsonResponse({ success: false, error: `Erro ao buscar itens: ${itemsRes.error.message}` }, 500);
  }
  if (!items || items.length === 0) {
    return jsonResponse({ success: false, status: "pending", pending: true, error: "Itens da venda não encontrados", sale_id: saleId }, 200);
  }

  // Buscar dados fiscais dos produtos + CRT em PARALELO
  const productIds = items.map((it: any) => it.product_id).filter(Boolean);
  const [productsRes, companyRes] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products")
          .select("id, ncm, cfop, cst_icms, csosn, cst_pis, cst_cofins, aliq_icms, origem, mva, cest")
          .in("id", productIds)
      : Promise.resolve({ data: [] }),
    supabase.from("companies").select("crt").eq("id", companyId).maybeSingle(),
  ]);

  const productsById = new Map<string, any>();
  for (const p of (productsRes.data || [])) productsById.set(p.id, p);

  const company = companyRes.data;
  const crt = Number((company as Record<string, unknown> | null)?.crt ?? 1);
  const isSimples = crt === 1 || crt === 2;
  const defaultCst = isSimples ? "102" : "00";
  const defaultPisCofins = isSimples ? "49" : "01";

  const saleRow = sale as Record<string, unknown>;
  const saleTotal = Number(saleRow.total ?? saleRow.total_value ?? 0);
  let paymentRows = parseSalePaymentsJson(saleRow.payments);
  if (paymentRows.length === 0) {
    const pm = saleRow.payment_method;
    if (typeof pm === "string" && pm.trim()) {
      paymentRows = [{ method: pm.trim(), amount: saleTotal, change_amount: 0 }];
    }
  }
  const primary = paymentRows[0];
  const mainPay = mapPdvMethodToTPag(getPrimaryPaymentMethod(primary));
  const change = getPaymentChange(primary);
  const fiscalPayments = paymentRows.length > 0
    ? paymentRows.map((row) => {
      const m = getPrimaryPaymentMethod(row);
      const amt = Number(row.amount ?? row.value ?? saleTotal);
      return { tPag: mapPdvMethodToTPag(m), vPag: Math.round((Number.isFinite(amt) ? amt : saleTotal) * 100) / 100 };
    })
    : [{ tPag: mainPay !== "99" ? mainPay : "01", vPag: Math.round(saleTotal * 100) / 100 }];

  const fiscalItems = items.map((item: Record<string, unknown>) => {
    const pid = String(item.product_id || "");
    const product = pid ? (productsById.get(pid) || {}) : {};
    const qty = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unit_price ?? 0);
    const discountPercent = Number(item.discount_percent ?? 0);
    const discountValue = (discountPercent / 100) * unitPrice * qty;
    return {
      product_id: item.product_id,
      name: (item.product_name || "Item") as string,
      ncm: (product.ncm as string) || "",
      cfop: (product.cfop as string) || "5102",
      cst: (isSimples ? product.csosn : product.cst_icms) as string || defaultCst,
      origem: (product.origem as string) || "0",
      unit: "UN", qty, unit_price: unitPrice,
      discount: Math.round(discountValue * 100) / 100,
      pis_cst: (product.cst_pis as string) || defaultPisCofins,
      cofins_cst: (product.cst_cofins as string) || defaultPisCofins,
      icms_aliquota: (product.aliq_icms as number) || 0,
      mva: (product.mva as number) || undefined,
      cest: (product.cest as string) || undefined,
    };
  });

  return await handleEmit(supabase, {
    sale_id: saleId, company_id: companyId,
    config_id: config_id ? String(config_id) : null,
    form: {
      nat_op: "VENDA DE MERCADORIA", crt,
      payments: fiscalPayments, payment_method: mainPay,
      payment_value: saleTotal, change, items: fiscalItems,
    },
  });
}

// ─── Consultar status ───
async function handleConsultStatus(supabase: any, body: any, callerUserId?: string | null) {
  const { access_key, doc_type, company_id } = body;
  if (!access_key) return jsonResponse({ error: "Chave de acesso obrigatória" }, 400);

  if (callerUserId && company_id) {
    const { data: docOwner } = await supabase.from("fiscal_documents").select("id")
      .eq("access_key", access_key).eq("company_id", company_id).maybeSingle();
    if (!docOwner) {
      const { data: anyDoc } = await supabase.from("fiscal_documents").select("id")
        .eq("access_key", access_key).maybeSingle();
      if (anyDoc) return jsonResponse({ success: false, error: "Documento não pertence a esta empresa" }, 403);
    }
  }

  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();
  const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

  const docRef = await resolveProviderDocRef({
    supabase,
    token,
    baseUrl,
    endpoint,
    companyId: company_id ? String(company_id) : null,
    accessKey: String(access_key),
  });

  const resp = await safeFetch(`${baseUrl}/${endpoint}/${docRef}`, {
    headers: { Authorization: `Bearer ${token}` },
  }, 8000);

  if (!resp.ok) {
    const errData = await resp.text();
    return jsonResponse({ success: false, error: `Erro ao consultar: ${errData}` });
  }

  const data = await parseResponseJsonSafe(resp, "consulta de status");
  if (!data) {
    return jsonResponse({ success: false, error: "Resposta vazia ao consultar status" }, 502);
  }
  const status = (data.status || "").toLowerCase();
  const isAuth = status.includes("autoriz") || status.includes("aprovad") || String(data.codigo_status) === "100";
  const isDenied = status.includes("rejei") || status.includes("deneg") || ["110", "204", "301", "302", "539", "999"].includes(String(data.codigo_status || data.cStat || ""));
  const normalizedStatus = isAuth ? "autorizada" : isDenied ? "rejeitada" : status || "pendente";
  const providerReason = String(data.motivo || data.xMotivo || data.rejection_reason || data.mensagem || data.message || "").trim();

  if (company_id) {
    const docUpdate: Record<string, unknown> = {
      status: normalizedStatus,
      access_key: data.chave || access_key,
      nuvem_fiscal_id: data.id || docRef,
      protocol_number: data.protocolo || null,
    };
    if (providerReason && normalizedStatus === "rejeitada") {
      docUpdate.rejection_reason = providerReason;
    }

    await supabase.from("fiscal_documents")
      .update(docUpdate)
      .eq("access_key", access_key).eq("company_id", company_id);

    const salesUpdate =
      normalizedStatus === "autorizada"
        ? { status: "emitida", access_key: data.chave || access_key }
        : normalizedStatus === "rejeitada"
          ? { status: "erro_fiscal" }
          : { status: "pendente_fiscal" };

    await supabase.from("sales")
      .update(salesUpdate)
      .eq("company_id", company_id)
      .eq("access_key", access_key);

    const queueUpdate: Record<string, unknown> = {
      status: normalizedStatus === "autorizada" ? "done" : normalizedStatus === "rejeitada" ? "error" : "pending",
      updated_at: new Date().toISOString(),
      next_retry_at: normalizedStatus === "autorizada" || normalizedStatus === "rejeitada" ? null : undefined,
      finished_at: normalizedStatus === "autorizada" || normalizedStatus === "rejeitada" ? new Date().toISOString() : undefined,
    };
    if (normalizedStatus === "autorizada") {
      queueUpdate.last_error = null;
    }
    if (normalizedStatus === "rejeitada") {
      queueUpdate.last_error = providerReason || "Rejeição confirmada no provedor fiscal";
    }

    const cleanQueueUpdate = Object.fromEntries(Object.entries(queueUpdate).filter(([, value]) => value !== undefined));

    await supabase.from("fiscal_queue")
      .update(cleanQueueUpdate)
      .eq("company_id", company_id)
      .in("status", ["pending", "processing", "error", "dead_letter"])
      .or(`sale_id.in.(select id from sales where company_id.eq.${company_id} and access_key.eq.${access_key}),last_error.ilike.%${access_key.slice(-8)}%`);
  }

  return jsonResponse({
    success: true, status: normalizedStatus,
    access_key: data.chave || access_key, number: data.numero, details: data,
  });
}

// ─── Cancelar documento ───
async function handleCancel(supabase: any, body: any, callerUserId?: string | null) {
  const { access_key, justificativa, doc_type, doc_id, company_id } = body;
  if (!justificativa || justificativa.length < 15) {
    return jsonResponse({ error: "Justificativa deve ter no mínimo 15 caracteres" }, 400);
  }

  if (callerUserId && company_id) {
    const { data: userRole } = await supabase.from("company_users").select("role")
      .eq("user_id", callerUserId).eq("company_id", company_id).eq("is_active", true).maybeSingle();
    if (!userRole || !["admin", "gerente"].includes(userRole.role)) {
      return jsonResponse({ success: false, error: "Apenas administradores e gerentes podem cancelar documentos fiscais" }, 403);
    }
  }

  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();
  const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

  const resp = await safeFetch(`${baseUrl}/${endpoint}/${access_key || doc_id}/cancelamento`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ justificativa }),
  }, 10000);

  const data = await parseResponseJsonSafe(resp, "cancelamento");
  if (!resp.ok) {
    return jsonResponse({ success: false, error: data?.mensagem || "Erro ao cancelar" });
  }

  if (access_key && company_id) {
    await supabase.from("fiscal_documents").update({ status: "cancelada" })
      .eq("access_key", access_key).eq("company_id", company_id);
  } else if (access_key) {
    await supabase.from("fiscal_documents").update({ status: "cancelada" }).eq("access_key", access_key);
  }

  return jsonResponse({ success: true, data });
}

// ─── Download PDF ───
async function handleDownloadPdf(supabase: any, body: any, callerUserId?: string | null) {
  const { access_key, doc_type, company_id } = body;
  if (!access_key) return jsonResponse({ error: "Chave de acesso obrigatória" }, 400);

  let effectiveCompanyId: string | null = company_id ? String(company_id) : null;
  if (callerUserId) {
    if (!effectiveCompanyId) {
      const { data: docRow } = await supabase.from("fiscal_documents").select("company_id")
        .eq("access_key", access_key).maybeSingle();
      effectiveCompanyId = docRow?.company_id ? String(docRow.company_id) : null;
    }
    if (!effectiveCompanyId) return jsonResponse({ success: false, error: "Documento não encontrado" }, 404);

    const { data: membership } = await supabase.from("company_users").select("id")
      .eq("user_id", callerUserId).eq("company_id", effectiveCompanyId).eq("is_active", true).maybeSingle();
    if (!membership) return jsonResponse({ success: false, error: "Documento não pertence a esta empresa" }, 403);
  }

  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();
  const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

  const docIdOrKey = await resolveProviderDocRef({
    supabase,
    token,
    baseUrl,
    endpoint,
    companyId: effectiveCompanyId,
    accessKey: String(access_key),
  });

  const pdfUrl = new URL(`${baseUrl}/${endpoint}/${docIdOrKey}/pdf`);
  if (endpoint === "nfce") {
    pdfUrl.searchParams.set("largura", "80");
    pdfUrl.searchParams.set("resumido", "false");
    pdfUrl.searchParams.set("margem", "2");
    pdfUrl.searchParams.set("logotipo", "true");
    pdfUrl.searchParams.set("nome_fantasia", "true");
  }

  const resp = await safeFetch(pdfUrl.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf", "Cache-Control": "no-cache" },
  }, 10000);

  if (!resp.ok) {
    const status = resp.status;
    if (status === 404) return jsonResponse({ success: false, error: "PDF não encontrado na Nuvem Fiscal" }, 404);
    if (status === 409) return jsonResponse({ success: false, error: "PDF ainda não disponível. Tente novamente." }, 409);
    return jsonResponse({ success: false, error: "Falha ao obter PDF na Nuvem Fiscal" }, 502);
  }

  const arrayBuf = await resp.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return jsonResponse({ success: true, pdf_base64: base64 });
}

// ─── Download XML ───
async function handleDownloadXml(supabase: any, body: any, callerUserId?: string | null) {
  const { access_key, doc_type, company_id } = body;
  if (!access_key) return jsonResponse({ error: "Chave de acesso obrigatória" }, 400);

  let effectiveCompanyId: string | null = company_id ? String(company_id) : null;
  if (callerUserId) {
    if (!effectiveCompanyId) {
      const { data: docRow } = await supabase.from("fiscal_documents").select("company_id")
        .eq("access_key", access_key).maybeSingle();
      effectiveCompanyId = docRow?.company_id ? String(docRow.company_id) : null;
    }
    if (!effectiveCompanyId) return jsonResponse({ success: false, error: "Documento não encontrado" }, 404);

    const { data: membership } = await supabase.from("company_users").select("id")
      .eq("user_id", callerUserId).eq("company_id", effectiveCompanyId).eq("is_active", true).maybeSingle();
    if (!membership) return jsonResponse({ success: false, error: "Documento não pertence a esta empresa" }, 403);
  }

  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();
  const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

  const docIdOrKey = await resolveProviderDocRef({
    supabase,
    token,
    baseUrl,
    endpoint,
    companyId: effectiveCompanyId,
    accessKey: String(access_key),
  });

  const resp = await safeFetch(`${baseUrl}/${endpoint}/${docIdOrKey}/xml`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" },
  }, 8000);

  if (!resp.ok) return jsonResponse({ success: false, error: "XML não encontrado" });

  const xml = await resp.text();
  return jsonResponse({ success: true, xml });
}

// ─── Inutilizar numeração ───
async function handleInutilize(supabase: any, body: any, callerUserId?: string | null) {
  const { company_id, doc_type, serie, numero_inicial, numero_final, justificativa } = body;
  if (!justificativa || justificativa.length < 15) {
    return jsonResponse({ error: "Justificativa deve ter no mínimo 15 caracteres" }, 400);
  }

  if (callerUserId && company_id) {
    const { data: userRole } = await supabase.from("company_users").select("role")
      .eq("user_id", callerUserId).eq("company_id", company_id).eq("is_active", true).maybeSingle();
    if (!userRole || !["admin", "gerente"].includes(userRole.role)) {
      return jsonResponse({ success: false, error: "Apenas administradores e gerentes podem inutilizar numeração fiscal" }, 403);
    }
  }

  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();
  const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

  // Buscar CNPJ da empresa (campo obrigatório na API Nuvem Fiscal)
  let cnpj = "";
  if (company_id) {
    const { data: company } = await supabase.from("companies").select("cnpj")
      .eq("id", company_id).maybeSingle();
    cnpj = onlyDigits(company?.cnpj);
  }
  if (!cnpj || cnpj.length < 11) {
    return jsonResponse({ success: false, error: "CNPJ da empresa não encontrado. Verifique o cadastro." }, 400);
  }

  const ano = new Date().getFullYear() % 100; // 2 dígitos

  const resp = await safeFetch(`${baseUrl}/${endpoint}/inutilizacoes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ambiente: Deno.env.get("NUVEM_FISCAL_SANDBOX") === "true" ? "homologacao" : "producao",
      cnpj,
      ano,
      serie,
      numero_inicial,
      numero_final,
      justificativa,
    }),
  }, 10000);

  const data = await parseResponseJsonSafe(resp, "inutilização");
  if (!resp.ok) {
    const msg = extractProviderErrorMessage(data, resp.status, "Erro na inutilização");
    console.error("[emit-nfce] Nuvem Fiscal inutilização erro:", resp.status, msg);
    return jsonResponse({ success: false, error: `Erro SEFAZ: ${msg}` });
  }

  if (company_id) {
    const ambiente = Deno.env.get("NUVEM_FISCAL_SANDBOX") === "true" ? "homologacao" : "producao";
    const rows = [];
    for (let num = numero_inicial; num <= numero_final; num++) {
      rows.push({
        company_id,
        doc_type: doc_type || "nfce",
        number: num,
        serie: serie || 1,
        status: "inutilizada",
        environment: ambiente,
        rejection_reason: justificativa,
        is_contingency: false,
        total_value: 0,
      });
    }

    // Insert each row individually, ignoring duplicates (no unique constraint exists)
    let insertErrors = 0;
    for (const row of rows) {
      const { error: insertError } = await supabase
        .from("fiscal_documents")
        .insert(row);
      if (insertError) {
        // Duplicate or other error — log but don't fail the whole operation
        console.warn("[emit-nfce] insert inutilização row error:", insertError.message);
        insertErrors++;
      }
    }
    if (insertErrors > 0) {
      console.warn(`[emit-nfce] ${insertErrors}/${rows.length} rows failed to insert (possibly duplicates)`);
    }

    await supabase.from("fiscal_documents")
      .update({ status: "inutilizada", rejection_reason: justificativa })
      .eq("company_id", company_id)
      .eq("doc_type", doc_type || "nfce")
      .eq("serie", serie || 1)
      .gte("number", numero_inicial)
      .lte("number", numero_final)
      .in("status", ["pendente", "rejeitada"]);

    const { data: affectedSales } = await supabase.from("fiscal_documents")
      .select("sale_id")
      .eq("company_id", company_id)
      .eq("doc_type", doc_type || "nfce")
      .eq("serie", serie || 1)
      .gte("number", numero_inicial)
      .lte("number", numero_final)
      .not("sale_id", "is", null);

    const saleIds = Array.from(new Set((affectedSales || []).map((row: { sale_id?: string | null }) => String(row.sale_id || "")).filter(Boolean)));

    if (saleIds.length > 0) {
      await supabase.from("fiscal_queue")
        .update({
          status: "error",
          last_error: `[inutilizada] Numeração inutilizada na SEFAZ: ${numero_inicial}-${numero_final}`,
          next_retry_at: null,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", company_id)
        .in("sale_id", saleIds)
        .in("status", ["pending", "processing", "error", "dead_letter"]);

      await supabase.from("sales")
        .update({ status: "erro_fiscal" })
        .eq("company_id", company_id)
        .in("id", saleIds);
    }
  }

  return jsonResponse({ success: true, data });
}

// ─── Backup XMLs ───
async function handleBackupXmls(supabase: any, body: any) {
  const { company_id } = body;
  if (!company_id) return jsonResponse({ error: "company_id obrigatório" }, 400);

  const { data: docs } = await supabase.from("fiscal_documents")
    .select("access_key, number, doc_type")
    .eq("company_id", company_id).eq("status", "autorizada").not("access_key", "is", null);

  if (!docs || docs.length === 0) {
    return jsonResponse({ success: true, message: "Nenhum documento para backup", backed: 0 });
  }

  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();
  let backed = 0;

  for (const doc of docs) {
    try {
      const endpoint = doc.doc_type === "nfe" ? "nfe" : "nfce";
      const xmlResp = await safeFetch(`${baseUrl}/${endpoint}/${doc.access_key}/xml`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" },
      }, 8000);
      if (!xmlResp.ok) continue;

      const xml = await xmlResp.text();
      const safeKey = doc.access_key.replace(/\D/g, "").slice(-8);
      const fileName = `${doc.doc_type}_${doc.number}_${safeKey}.xml`;
      const path = `${company_id}/xmls/${doc.doc_type}/${fileName}`;

      const blob = new Blob([xml], { type: "application/xml" });
      await supabase.storage.from("company-backups").upload(path, blob, { upsert: true, contentType: "application/xml" });
      backed++;
    } catch {
      // Continue
    }
  }

  return jsonResponse({ success: true, message: `Backup concluído: ${backed} XMLs salvos`, backed });
}

// ─── Código UF ───
function getUfCode(uf: string): number {
  const codes: Record<string, number> = {
    AC: 12, AL: 27, AM: 13, AP: 16, BA: 29, CE: 23, DF: 53, ES: 32,
    GO: 52, MA: 21, MG: 31, MS: 50, MT: 51, PA: 15, PB: 25, PE: 26,
    PI: 22, PR: 41, RJ: 33, RN: 24, RO: 11, RR: 14, RS: 43, SC: 42,
    SE: 28, SP: 35, TO: 17,
  };
  return codes[uf?.toUpperCase()] || 21;
}

// ════════════════════════════════════════════════
// AUTH HELPER
// ════════════════════════════════════════════════

async function validateCaller(req: Request): Promise<{ userId: string | null; isServiceCall: boolean }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { userId: null, isServiceCall: false };

  const token = authHeader.replace("Bearer ", "");
  const { supabaseUrl, anonKey, serviceRoleKey } = getSupabaseRuntimeConfig();

  if (token === serviceRoleKey) return { userId: null, isServiceCall: true };

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const { data, error } = await userClient.auth.getClaims(token);
    if (error || !data?.claims?.sub) return { userId: null, isServiceCall: false };
    return { userId: data.claims.sub as string, isServiceCall: false };
  } catch {
    return { userId: null, isServiceCall: false };
  }
}

// ════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    getSupabaseRuntimeConfig();
    const body = await parseRequestJsonSafe(req);
    const action = body.action || "emit";

    // Detectar chamadas do service_role (ex: process-fiscal-queue / cron)
    const { userId, isServiceCall } = await validateCaller(req);

    // Auth obrigatória para ações destrutivas — mas service_role pode chamar consult_status etc.
    const isAuthRequired = ["emit", "cancel", "backup_xmls"].includes(action) || Boolean(body.company_id);
    if (isAuthRequired && !isServiceCall) {
      const auth = await requireUser(req);
      if (!auth.ok) return auth.response;

      const companyId = String(body.company_id || "");
      if (companyId) {
        const membership = await requireCompanyMembership({ supabase: auth.supabase, userId: auth.userId, companyId });
        if (!membership.ok) return membership.response;
      }
    }
    const supabase = createServiceClient();

    switch (action) {
      case "emit":
        return await handleEmit(supabase, body);
      case "emit_from_sale":
        return await handleEmitFromSale(supabase, body);
      case "consult_status":
        return await handleConsultStatus(supabase, body, userId);
      case "cancel":
        return await handleCancel(supabase, body, userId);
      case "download_pdf":
        return await handleDownloadPdf(supabase, body, userId);
      case "download_xml":
        return await handleDownloadXml(supabase, body, userId);
      case "inutilize":
        return await handleInutilize(supabase, body, userId);
      case "backup_xmls":
        return await handleBackupXmls(supabase, body);
      default:
        return jsonResponse({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error("[emit-nfce] ERRO FATAL:", err.message);
    return jsonResponse({ error: err.message || "Erro interno" }, 500);
  }
});
