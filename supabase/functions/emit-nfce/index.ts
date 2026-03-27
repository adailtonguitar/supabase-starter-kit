/**
 * emit-nfce — Edge Function de emissão NFC-e via Nuvem Fiscal
 * 
 * Suporta ações: emit (padrão), consult_status, cancel, download_pdf, download_xml, inutilize, backup_xmls
 * 
 * Utiliza dados fiscais completos enviados pelo frontend/fila:
 * - CRT da empresa → define CSOSN vs CST ICMS
 * - NCM, CFOP, CST/CSOSN por item
 * - PIS/COFINS por regime tributário
 * - ICMS-ST com vBCST, vICMSST quando aplicável
 * - Dados completos do emitente (IE, CRT, endereço)
 */

import { corsHeaders, createServiceClient, jsonResponse, requireCompanyMembership, requireUser } from "../_shared/auth.ts";
import {
  getPaymentChange,
  getPrimaryPaymentMethod,
  mapPdvMethodToTPag,
  parseSalePaymentsJson,
} from "../_shared/sale-payments.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { compressLogoForNuvemFiscal } from "./compress-logo.ts";

// ─── Nuvem Fiscal Auth ───
async function getNuvemFiscalToken(): Promise<string> {
  const clientId = Deno.env.get("NUVEM_FISCAL_CLIENT_ID");
  const clientSecret = Deno.env.get("NUVEM_FISCAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Credenciais da Nuvem Fiscal não configuradas");

  const resp = await fetch("https://auth.nuvemfiscal.com.br/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "nfce nfe empresa",
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Erro autenticação Nuvem Fiscal: ${errText}`);
  }

  const data = await resp.json();
  return data.access_token;
}

function getApiBaseUrl(): string {
  const isSandbox = Deno.env.get("NUVEM_FISCAL_SANDBOX") === "true";
  return isSandbox
    ? "https://api.sandbox.nuvemfiscal.com.br"
    : "https://api.nuvemfiscal.com.br";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onlyDigits(v: unknown): string {
  return String(v ?? "").replace(/[^0-9]/g, "");
}

// Nuvem Fiscal/SEFAZ valida alguns campos textuais com regex baseada em Latin-1.
// Então normalizamos: remove quebras de linha/tabs, cola espaços e remove caracteres fora de [0x21..0xFF] (mais espaço).
function sanitizeSefazText(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value : "";
  let s = raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/[^\x21-\xFF ]/g, ""); // keep only allowed characters
  if (!s) return fallback;
  return s;
}

/** Extrai bucket + path de URLs públicas do Supabase Storage (`/object/public/{bucket}/...`). */
function parseSupabasePublicStoragePath(logoUrl: string): { bucket: string; path: string } | null {
  try {
    const clean = logoUrl.split("?")[0];
    const u = new URL(clean);
    const marker = "/storage/v1/object/public/";
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    const rest = u.pathname.slice(idx + marker.length);
    const slash = rest.indexOf("/");
    if (slash < 1) return null;
    const bucket = rest.slice(0, slash);
    const path = decodeURIComponent(rest.slice(slash + 1));
    if (!bucket || !path) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}

/** Baixa bytes do logo: preferindo Storage com service role (funciona com bucket privado). */
async function loadCompanyLogoBytes(
  supabase: any,
  logoUrl: string,
): Promise<{ buf: ArrayBuffer; mime: string } | null> {
  const parsed = parseSupabasePublicStoragePath(logoUrl);
  if (parsed) {
    const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
    if (!error && data) {
      const buf = await data.arrayBuffer();
      const mime = (data as Blob).type || "";
      return { buf, mime: mime || "application/octet-stream" };
    }
    console.warn("[emit-nfce] Storage download do logo falhou, tentando HTTP:", error?.message);
  }

  const imgRes = await fetch(logoUrl.split("?")[0], { redirect: "follow" });
  if (!imgRes.ok) {
    console.warn("[emit-nfce] Não foi possível baixar logo_url:", imgRes.status);
    return null;
  }
  const buf = await imgRes.arrayBuffer();
  const mime = imgRes.headers.get("content-type") || "";
  return { buf, mime };
}

function inferLogoMime(mime: string, logoUrl: string): "image/png" | "image/jpeg" | null {
  const m = mime.toLowerCase();
  const u = logoUrl.toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg") || u.includes(".jpg") || u.includes(".jpeg")) return "image/jpeg";
  if (m.includes("png") || u.includes(".png")) return "image/png";
  // JPEG padrão após otimização no app (company-logo-fiscal)
  if (m.includes("octet-stream") && u.includes(".jpg")) return "image/jpeg";
  return null;
}

/** Envia o logo salvo no app (`companies.logo_url`) para a Nuvem Fiscal, para o DANFE usar `logotipo=true` sem cadastro manual no painel. */
async function syncAppLogoToNuvemFiscal(
  supabase: any,
  companyId: string,
  token: string,
  baseUrl: string,
): Promise<void> {
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, logo_url")
    .eq("id", String(companyId))
    .maybeSingle();

  const logoUrl = company?.logo_url ? String(company.logo_url).trim() : "";
  const cnpj = onlyDigits(company?.cnpj);
  if (!logoUrl || cnpj.length !== 14) return;

  try {
    const loaded = await loadCompanyLogoBytes(supabase, logoUrl);
    if (!loaded) return;

    let { buf } = loaded;
    let mime = inferLogoMime(loaded.mime, logoUrl);
    if (buf.byteLength > 200 * 1024) {
      const compressed = compressLogoForNuvemFiscal(buf);
      if (!compressed) return;
      buf = compressed;
      mime = "image/jpeg";
    }

    if (!mime && logoUrl.toLowerCase().includes(".jpg")) mime = "image/jpeg";
    if (!mime) {
      console.warn("[emit-nfce] Logo deve ser PNG ou JPEG. Content-Type:", loaded.mime);
      return;
    }

    // Nuvem Fiscal: corpo = bytes da imagem (não multipart). Ver suporte:
    // https://suporte.nuvemfiscal.com.br/t/enviar-logotipo-empresa-content-type-nao-aceita/1024
    const body = new Uint8Array(buf);
    const putRes = await fetch(`${baseUrl}/empresas/${cnpj}/logotipo`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": mime,
      },
      body,
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      console.warn("[emit-nfce] Falha ao sincronizar logotipo com Nuvem Fiscal:", putRes.status, errText.slice(0, 400));
    } else {
      console.log("[emit-nfce] Logotipo sincronizado com Nuvem Fiscal para CNPJ", cnpj);
    }
  } catch (e) {
    console.warn("[emit-nfce] Erro ao sincronizar logotipo:", e);
  }
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

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${params.token}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null) as any;
  const first = Array.isArray(data?.data) ? data.data[0] : null;
  const id = first?.id;
  return typeof id === "string" && id ? id : null;
}

// ─── Numeração segura (atômica via RPC com FOR UPDATE) ───
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

// ─── Anti-duplicação ───
async function checkDuplicate(supabase: any, saleId: string): Promise<boolean> {
  // `fiscal_documents` não tem `sale_id` no schema atual. O provedor fiscal já faz
  // a validação contra duplicidade pela `access_key`/numeração, então não
  // tentamos anti-duplicação aqui para não quebrar a emissão.
  return false;
}

// ─── CST/CSOSN de ST que exigem campos de ST ───
const CSOSN_ST = new Set(["201", "202", "203"]);
const CST_ST = new Set(["10", "30", "70"]);

// ─── Construtor de bloco ICMS por regime ───
function buildIcmsBlock(item: any, isSimples: boolean) {
  const cst = (item.cst || "").trim();
  const origem = Number(item.origem) || 0;
  const vProd = item.qty * item.unit_price - (item.discount || 0);
  const aliqIcms = item.icms_aliquota || 0;

  if (isSimples) {
    // Simples Nacional → CSOSN
    if (CSOSN_ST.has(cst)) {
      // ST no Simples — MVA default 40% quando não configurado (evitar vBCST = vProd)
      const mva = item.mva != null && item.mva > 0 ? item.mva : 40;
      const bcST = vProd * (1 + mva / 100);
      const icmsST = bcST * (aliqIcms / 100);
      return {
        ICMSSN201: {
          orig: origem,
          CSOSN: cst,
          modBCST: 4, // MVA
          pMVAST: mva,
          vBCST: Math.round(bcST * 100) / 100,
          pICMSST: aliqIcms,
          vICMSST: Math.round(icmsST * 100) / 100,
        },
      };
    }
    if (cst === "500") {
      return {
        ICMSSN500: {
          orig: origem,
          CSOSN: "500",
        },
      };
    }
    // CSOSN 102, 103, 300, 400, 900
    return {
      ICMSSN102: {
        orig: origem,
        CSOSN: cst || "102",
      },
    };
  }

  // Regime Normal → CST ICMS
  if (CST_ST.has(cst)) {
    const mva = item.mva != null && item.mva > 0 ? item.mva : 40;
    const vBC = vProd;
    const vICMS = vBC * (aliqIcms / 100);
    const bcST = vProd * (1 + mva / 100);
    const icmsSTTotal = bcST * (aliqIcms / 100);
    const icmsST = Math.max(0, icmsSTTotal - vICMS);
    return {
      ICMS10: {
        orig: origem,
        CST: cst,
        modBC: 3,
        vBC: Math.round(vBC * 100) / 100,
        pICMS: aliqIcms,
        vICMS: Math.round(vICMS * 100) / 100,
        modBCST: 4,
        pMVAST: mva,
        vBCST: Math.round(bcST * 100) / 100,
        pICMSST: aliqIcms,
        vICMSST: Math.round(icmsST * 100) / 100,
      },
    };
  }
  if (cst === "60") {
    return {
      ICMS60: { orig: origem, CST: "60" },
    };
  }
  if (cst === "40" || cst === "41" || cst === "50") {
    return {
      ICMS40: { orig: origem, CST: cst },
    };
  }
  if (cst === "20") {
    return {
      ICMS20: {
        orig: origem,
        CST: "20",
        modBC: 3,
        pRedBC: 0,
        vBC: Math.round(vProd * 100) / 100,
        pICMS: aliqIcms,
        vICMS: Math.round(vProd * (aliqIcms / 100) * 100) / 100,
      },
    };
  }
  // CST 00 — tributado integralmente (default)
  const vBC = vProd;
  const vICMS = vBC * (aliqIcms / 100);
  return {
    ICMS00: {
      orig: origem,
      CST: cst || "00",
      modBC: 3,
      vBC: Math.round(vBC * 100) / 100,
      pICMS: aliqIcms,
      vICMS: Math.round(vICMS * 100) / 100,
    },
  };
}

// ─── Construtor de PIS/COFINS ───
function buildPisCofins(pisCst: string, cofinsCst: string, vProd: number) {
  const pis: any = {};
  const cofins: any = {};
  const ntCst = new Set(["04", "05", "06", "07", "08", "09"]);

  // PIS
  if (["01", "02"].includes(pisCst)) {
    pis.PISAliq = { CST: pisCst, vBC: Math.round(vProd * 100) / 100, pPIS: 0.65, vPIS: Math.round(vProd * 0.0065 * 100) / 100 };
  } else if (ntCst.has(pisCst)) {
    pis.PISNT = { CST: pisCst };
  } else {
    // CST 49 and other "outras operações" must use PISOutr group.
    const cst = pisCst || "49";
    pis.PISOutr = { CST: cst, vBC: 0, pPIS: 0, vPIS: 0 };
  }

  // COFINS
  if (["01", "02"].includes(cofinsCst)) {
    cofins.COFINSAliq = { CST: cofinsCst, vBC: Math.round(vProd * 100) / 100, pCOFINS: 3.0, vCOFINS: Math.round(vProd * 0.03 * 100) / 100 };
  } else if (ntCst.has(cofinsCst)) {
    cofins.COFINSNT = { CST: cofinsCst };
  } else {
    // CST 49 and other "outras operações" must use COFINSOutr group.
    const cst = cofinsCst || "49";
    cofins.COFINSOutr = { CST: cst, vBC: 0, pCOFINS: 0, vCOFINS: 0 };
  }

  return { PIS: pis, COFINS: cofins };
}

// ════════════════════════════════════════════════
// HANDLERS
// ════════════════════════════════════════════════

async function handleEmit(supabase: any, body: any) {
  const { sale_id, company_id, config_id, form } = body;

  if (!sale_id || !form) {
    return jsonResponse({ error: "Dados incompletos: sale_id e form são obrigatórios" }, 400);
  }

  // Rate limiting: protege Nuvem Fiscal / RPC; fila + PDV + reemissões podem gerar várias tentativas no mesmo minuto.
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

  // Anti-duplicação
  const isDuplicate = await checkDuplicate(supabase, sale_id);
  if (isDuplicate) {
    return jsonResponse({ error: "NFC-e já emitida ou em processamento para esta venda" }, 400);
  }

  // Buscar empresa com dados completos
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("*")
    .eq("id", company_id)
    .single();

  if (companyErr || !company) {
    return jsonResponse({ error: "Empresa não encontrada" }, 404);
  }

  // Buscar config fiscal
  let config: any = null;
  if (config_id) {
    const { data } = await supabase
      .from("fiscal_configs")
      .select("*")
      .eq("id", config_id)
      .single();
    config = data;
  }
  if (!config) {
    const { data } = await supabase
      .from("fiscal_configs")
      .select("*")
      .eq("company_id", company_id)
      .eq("doc_type", "nfce")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    config = data;
  }
  if (!config) {
    return jsonResponse({ error: "Configuração fiscal NFC-e não encontrada. Acesse Fiscal > Configuração." }, 400);
  }

  // Validação obrigatória de IE (Inscrição Estadual)
  const ieClean = (company.ie || company.state_registration || "").replace(/\D/g, "");
  if (!ieClean || ieClean.length < 2) {
    return jsonResponse({
      error: "Inscrição Estadual (IE) não configurada. Cadastre a IE da empresa em Configurações > Empresa antes de emitir documentos fiscais.",
    }, 400);
  }

  // Alerta de certificado A1 próximo do vencimento
  if (config.certificate_expiry) {
    const expiryDate = new Date(config.certificate_expiry);
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry <= 0) {
      return jsonResponse({
        error: `Certificado digital A1 EXPIRADO em ${expiryDate.toLocaleDateString("pt-BR")}. Renove o certificado antes de emitir.`,
        _cert_diag: { expired: true, days: daysUntilExpiry },
      }, 400);
    }
    if (daysUntilExpiry <= 30) {
      console.warn(`[emit-nfce] ⚠️ Certificado A1 expira em ${daysUntilExpiry} dias (${expiryDate.toLocaleDateString("pt-BR")})`);
      // Criar notificação proativa se <= 15 dias
      if (daysUntilExpiry <= 15) {
        const alertTitle = daysUntilExpiry <= 7
          ? `🚨 Certificado expira em ${daysUntilExpiry} dia(s)!`
          : `⚠️ Certificado A1 expira em ${daysUntilExpiry} dias`;
        // Evitar spam: só notificar 1x por dia
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("company_id", company_id)
          .eq("title", alertTitle)
          .gte("created_at", new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString())
          .maybeSingle();
        if (!existing) {
          const { data: admins } = await supabase
            .from("company_users")
            .select("user_id")
            .eq("company_id", company_id)
            .eq("is_active", true)
            .in("role", ["admin", "gerente"]);
          for (const admin of (admins || [])) {
            await supabase.from("notifications").insert({
              company_id,
              user_id: admin.user_id,
              title: alertTitle,
              message: `Seu certificado digital A1 expira em ${expiryDate.toLocaleDateString("pt-BR")}. Renove-o para evitar interrupção na emissão fiscal.`,
              type: "warning",
            });
          }
        }
      }
    }
  }

  // CRT e regime
  const crt = form.crt || company.crt || 1;
  const isSimples = crt === 1 || crt === 2;

  // Numeração
  const numero = await getNextNumberSafe(supabase, config.id);

  // Ambiente
  const ambiente = config.environment === "producao" ? "producao" : "homologacao";

  // Validar e construir itens
  const items = form.items || [];
  if (items.length === 0) {
    return jsonResponse({ error: "Nenhum item na venda" }, 400);
  }

  // Totalizadores
  let totalVProd = 0;
  let totalVDesc = 0;
  let totalVICMS = 0;
  let totalVBCST = 0;
  let totalVST = 0;
  let totalVPIS = 0;
  let totalVCOFINS = 0;

  const detItems = items.map((item: any, i: number) => {
    const ncm = (item.ncm || "").replace(/\D/g, "");
    if (!ncm || ncm.length < 2 || ncm === "00000000") {
      throw new Error(`Item ${i + 1} ("${item.name}") sem NCM válido. Cadastre o NCM antes de emitir.`);
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

    // ICMS
    const icmsBlock = buildIcmsBlock({ ...item, qty, unit_price: unitPrice, discount }, isSimples);

    // Extrair valores de ICMS para totais
    const icmsKey = Object.keys(icmsBlock)[0];
    const icmsData = (icmsBlock as any)[icmsKey];
    if (icmsData.vICMS) totalVICMS += icmsData.vICMS;
    if (icmsData.vBCST) totalVBCST += icmsData.vBCST;
    if (icmsData.vICMSST) totalVST += icmsData.vICMSST;

    // PIS / COFINS
    const pisCst = item.pis_cst || (isSimples ? "49" : "01");
    const cofinsCst = item.cofins_cst || (isSimples ? "49" : "01");
    const { PIS, COFINS } = buildPisCofins(pisCst, cofinsCst, vProdLiq);

    // Acumular PIS/COFINS
    if (PIS.PISAliq) totalVPIS += PIS.PISAliq.vPIS;
    if (COFINS.COFINSAliq) totalVCOFINS += COFINS.COFINSAliq.vCOFINS;

    const prodBlock: any = {
      cProd: item.product_id || String(i + 1),
      cEAN: "SEM GTIN",
      xProd: item.name,
      NCM: ncm,
      CFOP: cfop,
      uCom: item.unit || "UN",
      qCom: qty,
      vUnCom: unitPrice,
      vProd,
      cEANTrib: "SEM GTIN",
      uTrib: item.unit || "UN",
      qTrib: qty,
      vUnTrib: unitPrice,
      indTot: 1,
    };

    // CEST — obrigatório para ST e alguns NCMs
    if (item.cest) {
      prodBlock.CEST = String(item.cest).replace(/\D/g, "");
    }

    const det: any = {
      nItem: i + 1,
      prod: prodBlock,
      imposto: {
        ICMS: icmsBlock,
        PIS,
        COFINS,
      },
    };

    if (discount > 0) {
      det.prod.vDesc = discount;
    }

    return det;
  });

  // Valor total da NF
  const vNF = Math.round((totalVProd - totalVDesc + totalVST) * 100) / 100;

  // Pagamento — suporte a múltiplas formas (split payment)
  const troco = form.change || 0;
  const detPag: any[] = [];
  // tPag no escopo externo para uso no insert de rejeição
  const mainTpag = form.payment_method || "01";

  if (form.payments && Array.isArray(form.payments) && form.payments.length > 0) {
    // Múltiplas formas de pagamento
    for (const p of form.payments) {
      detPag.push({
        tPag: p.tPag || p.method || "99",
        vPag: Math.round((p.vPag || p.value || 0) * 100) / 100,
      });
    }
  } else {
    // Fallback: forma única
    const vPag = form.payment_value || vNF;
    detPag.push({ tPag: mainTpag, vPag: Math.round(vPag * 100) / 100 });
  }

  const pagBlock: any = { detPag };
  if (troco > 0) {
    pagBlock.vTroco = Math.round(troco * 100) / 100;
  }

  // Destinatário (opcional em NFC-e)
  let dest: any = undefined;
  if (form.customer_doc) {
    const docClean = form.customer_doc.replace(/\D/g, "");
    if (docClean.length === 11) {
      dest = { CPF: docClean };
    } else if (docClean.length === 14) {
      dest = { CNPJ: docClean };
    }
    if (dest && form.customer_name) {
      dest.xNome = form.customer_name;
    }
  }

  // Emitente
  const cnpjClean = (company.cnpj || "").replace(/\D/g, "");
  const ieEmitClean = (company.ie || company.state_registration || "").replace(/\D/g, "");

  // ── Item 5: Validar código IBGE antes de prosseguir ──
  const ibgeCode = company.ibge_code || company.city_code || company.address_ibge_code || "";
  const ibgeClean = String(ibgeCode).replace(/\D/g, "");
  if (!ibgeClean || ibgeClean.length < 7 || ibgeClean === "0000000") {
    return jsonResponse({
      error: `Código IBGE do município do emitente não configurado ou inválido ("${ibgeCode}"). Acesse Configurações > Empresa e preencha o código IBGE (7 dígitos). Utilize a consulta por CEP para preenchimento automático.`,
    }, 400);
  }

  const emit: Record<string, unknown> = {
    CNPJ: cnpjClean,
    xNome: sanitizeSefazText(company.name || company.trade_name, "EMITENTE"),
    CRT: crt,
  };

  if (ieEmitClean) emit.IE = ieEmitClean;

  // Endereço do emitente
  if (company.street || company.address) {
    emit.enderEmit = {
      xLgr: sanitizeSefazText(company.street || company.address || "Rua não informada", "Rua não informada"),
      nro: company.number || company.address_number || "S/N",
      xBairro: sanitizeSefazText(company.neighborhood || "Centro", "Centro"),
      cMun: ibgeClean,
      xMun: sanitizeSefazText(company.city || "Não informada", "Não informada"),
      UF: sanitizeSefazText(company.state || "MA", "MA"),
      CEP: (company.zip_code || company.cep || "00000000").replace(/\D/g, ""),
      cPais: "1058",
      xPais: "Brasil",
    };
    if (company.complement) {
      (emit.enderEmit as Record<string, unknown>).xCpl = company.complement;
    }
  }

  // Info adicional
  let infAdFisco = "";
  if (isSimples) {
    infAdFisco = "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL";
  }

  const infAdic: any = {};
  if (infAdFisco) infAdic.infAdFisco = infAdFisco;
  if (form.inf_adic) infAdic.infCpl = form.inf_adic;

  // Payload completo
  const payload: any = {
    ambiente,
    infNFe: {
      versao: "4.00",
      ide: {
        cUF: getUfCode(company.state || "MA"),
        natOp: form.nat_op || "VENDA DE MERCADORIA",
        mod: 65,
        serie: config.serie || 1,
        nNF: numero,
        dhEmi: new Date().toISOString(),
        tpNF: 1, // saída
        idDest: 1, // operação interna
        cMunFG: ibgeClean,
        tpImp: 4, // DANFE NFC-e
        tpEmis: 1, // emissão normal
        tpAmb: ambiente === "producao" ? 1 : 2,
        finNFe: 1, // NF-e normal
        indFinal: 1, // consumidor final
        indPres: 1, // operação presencial
        procEmi: 0, // emissão por aplicativo do contribuinte
        verProc: "AnthoSystem 1.0",
      },
      emit,
      det: detItems,
      transp: { modFrete: 9 },
      total: {
        ICMSTot: {
          vBC: Math.round((totalVICMS > 0 ? totalVProd : 0) * 100) / 100,
          vICMS: Math.round(totalVICMS * 100) / 100,
          vICMSDeson: 0,
          vFCP: 0,
          vBCST: Math.round(totalVBCST * 100) / 100,
          vST: Math.round(totalVST * 100) / 100,
          vFCPST: 0,
          vFCPSTRet: 0,
          vProd: Math.round(totalVProd * 100) / 100,
          vFrete: 0,
          vSeg: 0,
          vDesc: Math.round(totalVDesc * 100) / 100,
          vII: 0,
          vIPI: 0,
          vIPIDevol: 0,
          vPIS: Math.round(totalVPIS * 100) / 100,
          vCOFINS: Math.round(totalVCOFINS * 100) / 100,
          vOutro: 0,
          vNF,
        },
      },
      pag: pagBlock,
    },
  };

  if (dest) payload.infNFe.dest = dest;
  if (Object.keys(infAdic).length > 0) payload.infNFe.infAdic = infAdic;

  // Nuvem Fiscal validates `infNFe.ide` strictly against SEFAZ schema.
  // CSC fields are not valid ide properties and must not be injected here.

  // Do not send certificate in the issue payload; Nuvem Fiscal rejects unknown fields.

  console.log(`[emit-nfce] Emitindo NFC-e #${numero} | Empresa: ${cnpjClean} | CRT: ${crt} | Ambiente: ${ambiente} | Itens: ${items.length} | Total: ${vNF}`);

  // Enviar para Nuvem Fiscal
  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();

  const nfResp = await fetch(`${baseUrl}/nfce`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const nfData = await nfResp.json();

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
    const validationHint = fieldPath && fieldMessage
      ? `${fieldPath}: ${fieldMessage}`
      : (fieldMessage || "");
    const rawHint = !validationHint && String(baseErrMsg).toLowerCase().includes("validation failed")
      ? `payload: ${JSON.stringify(nfData).slice(0, 700)}`
      : "";
    const errMsg = validationHint
      ? `${baseErrMsg} — ${validationHint}`
      : (rawHint ? `${baseErrMsg} — ${rawHint}` : baseErrMsg);
    console.error(`[emit-nfce] Erro Nuvem Fiscal [${nfResp.status}]:`, errMsg);

    // ── Item 11: Extract rejection protocol and access key from SEFAZ response ──
    const rejAccessKey = nfData?.chave || nfData?.chave_acesso || nfData?.access_key || null;
    const rejProtocol = nfData?.protocolo || nfData?.numero_protocolo || null;
    const rejReason = nfData?.motivo || nfData?.xMotivo || nfData?.rejection_reason || errMsg;
    const rejCode = nfData?.codigo_status || nfData?.cStat || null;

    // Salvar como rejeitada com protocolo, chave e motivo para rastreabilidade e reprocessamento
    const rejRow: Record<string, unknown> = {
      company_id,
      doc_type: "nfce",
      number: numero,
      serie: config.serie || 1,
      status: "rejeitada",
      total_value: vNF,
      environment: ambiente,
      customer_name: form.customer_name || null,
      customer_cpf_cnpj: form.customer_doc || null,
      payment_method: mainTpag,
      access_key: rejAccessKey,
      protocol_number: rejProtocol,
      rejection_reason: rejCode ? `[${rejCode}] ${rejReason}` : rejReason,
      is_contingency: false,
    };
    if (sale_id) rejRow.sale_id = String(sale_id);
    await supabase.from("fiscal_documents").insert(rejRow);

    return jsonResponse({ success: false, error: errMsg, rejection_reason: rejReason, details: nfData }, 400);
  }

  // Detectar status de autorização
  const statusStr = (nfData.status || "").toLowerCase();
  const cStatStr = String(nfData.codigo_status || nfData.cStat || "");
  const accessKey = nfData.chave || nfData.chave_acesso || nfData.access_key || "";
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
    company_id,
    doc_type: "nfce",
    number: numero,
    serie: config.serie || 1,
    access_key: accessKey || null,
    protocol_number: protocolNumber || null,
    status: finalStatus,
    total_value: vNF,
    environment: ambiente,
    customer_name: form.customer_name || null,
    customer_cpf_cnpj: form.customer_doc || null,
    payment_method: mainPayMethod,
    is_contingency: isContingency,
  };
  // Obrigatório para process-fiscal-queue consultar/reconciliar sem segunda emissão.
  if (sale_id) insertRow.sale_id = String(sale_id);

  const insertRes = await supabase.from("fiscal_documents").insert(insertRow);
  if (insertRes.error) {
    console.error("[emit-nfce] Falha ao registrar fiscal_documents:", insertRes.error.message);
    return jsonResponse({ success: false, error: "Falha ao registrar documento fiscal no banco" }, 500);
  }

  // Reconciliar venda (PDV) — evita ficar "Pendente NFC-e" após autorização
  try {
    if (sale_id) {
      const saleUpdate: Record<string, unknown> =
        finalStatus === "autorizada"
          ? { status: "emitida", nfce_number: String(numero) }
          : { status: "pendente_fiscal" };
      await supabase
        .from("sales")
        .update(saleUpdate)
        .eq("id", String(sale_id))
        .eq("company_id", String(company_id));
    }
  } catch (e) {
    console.warn("[emit-nfce] Falha ao atualizar sales após emissão");
  }

  // Envia logotipo do app para a Nuvem Fiscal assim que a nota autoriza (antes de qualquer download de PDF).
  if (isAuthorized) {
    try {
      await syncAppLogoToNuvemFiscal(supabase, String(company_id), token, baseUrl);
    } catch (e) {
      console.warn("[emit-nfce] sync logotipo após autorização:", e);
    }
  }

  // Auto-save XML no Storage após autorização (obrigação legal: 5 anos)
  if (isAuthorized && accessKey) {
    try {
      const xmlToken = await getNuvemFiscalToken();
      const xmlBaseUrl = getApiBaseUrl();
      const xmlResp = await fetch(`${xmlBaseUrl}/nfce/${accessKey}/xml`, {
        headers: { Authorization: `Bearer ${xmlToken}`, Accept: "application/xml" },
      });
      if (xmlResp.ok) {
        const xmlContent = await xmlResp.text();
        const safeKey = accessKey.slice(-8);
        const xmlPath = `${company_id}/xmls/nfce/nfce_${numero}_${safeKey}.xml`;
        await supabase.storage.from("company-backups").upload(xmlPath, new TextEncoder().encode(xmlContent), {
          upsert: true,
          contentType: "application/xml",
        });
        console.log(`[emit-nfce] XML salvo automaticamente: ${xmlPath}`);
      }
    } catch (xmlErr: any) {
      console.warn(`[emit-nfce] Falha ao salvar XML automaticamente: ${xmlErr.message}`);
    }
  }

  console.log(`[emit-nfce] NFC-e #${numero} → Status: ${finalStatus} | Chave: ${accessKey?.substring(0, 20)}...`);

  return jsonResponse({
    success: true,
    status: finalStatus,
    number: numero,
    access_key: accessKey,
    protocol: protocolNumber,
  });
}

// Emissão a partir de uma venda já gravada (resolve falhas de RLS/timing no frontend).
async function handleEmitFromSale(supabase: any, body: any) {
  const { sale_id, company_id, config_id } = body as { sale_id?: unknown; company_id?: unknown; config_id?: unknown };
  const saleId = String(sale_id || "");
  const companyId = String(company_id || "");
  if (!saleId || !companyId) {
    return jsonResponse({ error: "Dados incompletos: sale_id e company_id são obrigatórios" }, 400);
  }

  // Em cenários de alta concorrência, venda/itens podem levar alguns ms para ficar visíveis após a RPC.
  // Retry mais longo para evitar falso negativo no PDV (principalmente PIX/cartão).
  let sale: any = null;
  let saleErr: any = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await supabase
      .from("sales")
      .select("total, total_value, payments, payment_method")
      .eq("id", saleId)
      .eq("company_id", companyId)
      .maybeSingle();
    sale = res.data;
    saleErr = res.error;
    if (sale) break;
    if (attempt < 11) await sleep(500);
  }
  if (saleErr || !sale) return jsonResponse({ error: "Venda não encontrada" }, 404);

  // 1) Load sale_items without relying on implicit foreign table joins (can break if relationship name differs)
  let items: any[] | null = null;
  let itemsErr: any = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await supabase
      .from("sale_items")
      // Columns confirmed in your DB: product_id, product_name, quantity, unit_price, discount_percent, sale_id, company_id
      .select("product_id, product_name, quantity, unit_price, discount_percent")
      .eq("sale_id", saleId)
      .eq("company_id", companyId);
    items = res.data as any[] | null;
    itemsErr = res.error;
    if (Array.isArray(items) && items.length > 0) break;
    if (attempt < 11) await sleep(500);
  }
  if (itemsErr) {
    console.error("[emit-nfce] Falha ao carregar sale_items:", itemsErr.message);
    return jsonResponse({ error: "Falha ao carregar itens da venda" }, 500);
  }
  if (!items?.length) return jsonResponse({ error: "Itens da venda não encontrados" }, 400);

  // 2) Load product fiscal fields in a second query
  const productIds = Array.from(new Set(items.map((it: Record<string, unknown>) => String(it.product_id || "")).filter(Boolean)));
  const productsById = new Map<string, Record<string, unknown>>();
  if (productIds.length > 0) {
    const { data: products, error: prodErr } = await supabase
      .from("products")
      // Use `*` to avoid schema mismatch breaking emission
      .select("*")
      .in("id", productIds);
    if (prodErr) {
      console.error("[emit-nfce] Falha ao carregar products:", prodErr.message);
      // Not fatal: we can still emit with item-level fields/defaults
    } else {
      for (const p of (products || []) as Record<string, unknown>[]) {
        if (p?.id) productsById.set(String(p.id), p);
      }
    }
  }

  // Buscar CRT via companies (ou default)
  const { data: company } = await supabase
    .from("companies")
    .select("crt")
    .eq("id", companyId)
    .maybeSingle();

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
      return {
        tPag: mapPdvMethodToTPag(m),
        vPag: Math.round((Number.isFinite(amt) ? amt : saleTotal) * 100) / 100,
      };
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
      unit: "UN",
      qty,
      unit_price: unitPrice,
      discount: Math.round(discountValue * 100) / 100,
      pis_cst: (product.cst_pis as string) || defaultPisCofins,
      cofins_cst: (product.cst_cofins as string) || defaultPisCofins,
      icms_aliquota: (product.aliq_icms as number) || 0,
      mva: (product.mva as number) || undefined,
      cest: (product.cest as string) || undefined,
    };
  });

  return await handleEmit(supabase, {
    sale_id: saleId,
    company_id: companyId,
    config_id: config_id ? String(config_id) : null,
    form: {
      nat_op: "VENDA DE MERCADORIA",
      crt,
      payments: fiscalPayments,
      payment_method: mainPay,
      payment_value: saleTotal,
      change,
      items: fiscalItems,
    },
  });
}

// ─── Consultar status (com validação cross-tenant) ───
async function handleConsultStatus(supabase: any, body: any, callerUserId?: string | null) {
  const { access_key, doc_type, company_id } = body;
  if (!access_key) return jsonResponse({ error: "Chave de acesso obrigatória" }, 400);

  // Validação cross-tenant: verificar que o documento pertence à empresa do caller
  if (callerUserId && company_id) {
    const { data: docOwner } = await supabase
      .from("fiscal_documents")
      .select("id")
      .eq("access_key", access_key)
      .eq("company_id", company_id)
      .maybeSingle();

    // Se existe no banco mas não pertence a esta empresa, bloquear
    if (!docOwner) {
      const { data: anyDoc } = await supabase
        .from("fiscal_documents")
        .select("id")
        .eq("access_key", access_key)
        .maybeSingle();
      if (anyDoc) {
        return jsonResponse({ success: false, error: "Documento não pertence a esta empresa" }, 403);
      }
    }
  }

  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();
  const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

  const resp = await fetch(`${baseUrl}/${endpoint}/${access_key}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const errData = await resp.text();
    return jsonResponse({ success: false, error: `Erro ao consultar: ${errData}` });
  }

  const data = await resp.json();
  const status = (data.status || "").toLowerCase();
  const isAuth = status.includes("autoriz") || status.includes("aprovad") || String(data.codigo_status) === "100";

  // Auto-reconciliar no banco se autorizada
  if (isAuth && company_id) {
    await supabase
      .from("fiscal_documents")
      .update({ status: "autorizada", access_key: data.chave || access_key, protocol_number: data.protocolo || null })
      .eq("access_key", access_key)
      .eq("company_id", company_id);
  }

  return jsonResponse({
    success: true,
    status: isAuth ? "autorizada" : status,
    access_key: data.chave || access_key,
    number: data.numero,
    details: data,
  });
}

// ─── Cancelar documento (RBAC: apenas admin/gerente) ───
async function handleCancel(supabase: any, body: any, callerUserId?: string | null) {
  const { access_key, justificativa, doc_type, doc_id, company_id } = body;
  if (!justificativa || justificativa.length < 15) {
    return jsonResponse({ error: "Justificativa deve ter no mínimo 15 caracteres" }, 400);
  }

  // RBAC: exigir perfil admin ou gerente para cancelamento
  if (callerUserId && company_id) {
    const { data: userRole } = await supabase
      .from("company_users")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("company_id", company_id)
      .eq("is_active", true)
      .maybeSingle();

    const allowedRoles = ["admin", "gerente"];
    if (!userRole || !allowedRoles.includes(userRole.role)) {
      return jsonResponse({ success: false, error: "Apenas administradores e gerentes podem cancelar documentos fiscais" }, 403);
    }
  }

  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();
  const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

  const cancelBody = { justificativa };

  const resp = await fetch(`${baseUrl}/${endpoint}/${access_key || doc_id}/cancelamento`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cancelBody),
  });

  const data = await resp.json();

  if (!resp.ok) {
    return jsonResponse({ success: false, error: data?.mensagem || "Erro ao cancelar" });
  }

  // Atualizar status no banco e reverter venda via cancel_sale_atomic
  if (access_key && company_id) {
    // Buscar sale_id vinculado ao documento
    const { data: fiscalDoc } = await supabase
      .from("fiscal_documents")
      .select("id")
      .eq("access_key", access_key)
      .eq("company_id", company_id)
      .maybeSingle();

    // Atualizar documento fiscal
    await supabase
      .from("fiscal_documents")
      .update({ status: "cancelada" })
      .eq("access_key", access_key)
      .eq("company_id", company_id);

    // Nota: como `fiscal_documents` não possui `sale_id` no schema atual, não reverteremos
    // estoque/financeiro automaticamente aqui.
  } else if (access_key) {
    await supabase
      .from("fiscal_documents")
      .update({ status: "cancelada" })
      .eq("access_key", access_key);
  }

  return jsonResponse({ success: true, data });
}

// ─── Download PDF (com validação cross-tenant) ───
async function handleDownloadPdf(supabase: any, body: any, callerUserId?: string | null) {
  const { access_key, doc_type, company_id } = body;
  if (!access_key) return jsonResponse({ error: "Chave de acesso obrigatória" }, 400);

  // Validação cross-tenant + descoberta de company_id quando o frontend não envia.
  let effectiveCompanyId: string | null = company_id ? String(company_id) : null;
  if (callerUserId) {
    if (!effectiveCompanyId) {
      const { data: docRow } = await supabase
        .from("fiscal_documents")
        .select("company_id")
        .eq("access_key", access_key)
        .maybeSingle();
      effectiveCompanyId = docRow?.company_id ? String(docRow.company_id) : null;
    }

    if (!effectiveCompanyId) {
      return jsonResponse({ success: false, error: "Documento não encontrado" }, 404);
    }

    const { data: membership } = await supabase
      .from("company_users")
      .select("id")
      .eq("user_id", callerUserId)
      .eq("company_id", effectiveCompanyId)
      .eq("is_active", true)
      .maybeSingle();
    if (!membership) {
      return jsonResponse({ success: false, error: "Documento não pertence a esta empresa" }, 403);
    }
  }

  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();
  const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

  const keyDigits = onlyDigits(access_key);
  const isAccessKey = keyDigits.length === 44;
  let docIdOrKey: string = isAccessKey ? keyDigits : String(access_key);

  // A Nuvem Fiscal usa `id` (gerado pela API) nos endpoints de PDF/XML.
  // Se recebemos uma chave de acesso (44 dígitos), resolvemos primeiro o `id` via listagem.
  if (isAccessKey && effectiveCompanyId) {
    const { data: company } = await supabase
      .from("companies")
      .select("cnpj")
      .eq("id", String(effectiveCompanyId))
      .maybeSingle();

    const cpfCnpj = onlyDigits(company?.cnpj);
    const ambiente: "homologacao" | "producao" =
      Deno.env.get("NUVEM_FISCAL_SANDBOX") === "true" ? "homologacao" : "producao";

    if (cpfCnpj.length >= 11) {
      const resolved = await resolveNuvemFiscalDocId({
        token,
        baseUrl,
        endpoint,
        ambiente,
        cpfCnpj,
        chave: keyDigits,
      });
      if (resolved) docIdOrKey = resolved;
    }
  }

  // Logo do app → Nuvem Fiscal (automático), para `logotipo=true` no PDF.
  if (endpoint === "nfce" && effectiveCompanyId) {
    await syncAppLogoToNuvemFiscal(supabase, effectiveCompanyId, token, baseUrl);
  }

  const pdfUrl = new URL(`${baseUrl}/${endpoint}/${docIdOrKey}/pdf`);
  // Match the default DANFCE layout used in "Fiscal > Documentos":
  // keep width/margins, but avoid `qrcode_lateral` which can render blank QR area in some templates.
  if (endpoint === "nfce") {
    pdfUrl.searchParams.set("largura", "80");
    pdfUrl.searchParams.set("resumido", "false");
    pdfUrl.searchParams.set("margem", "2");
    // Inclui logotipo cadastrado na empresa na Nuvem Fiscal (empresas/{cnpj}/logotipo).
    pdfUrl.searchParams.set("logotipo", "true");
    pdfUrl.searchParams.set("nome_fantasia", "true");
  }

  const resp = await fetch(pdfUrl.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/pdf",
      "Cache-Control": "no-cache",
    },
  });

  if (!resp.ok) {
    // Mensagem mais útil para o usuário (e ainda segura).
    const status = resp.status;
    if (status === 404) return jsonResponse({ success: false, error: "PDF não encontrado na Nuvem Fiscal" }, 404);
    if (status === 409) return jsonResponse({ success: false, error: "PDF ainda não disponível. Tente novamente em alguns segundos." }, 409);
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

// ─── Download XML (com validação cross-tenant) ───
async function handleDownloadXml(supabase: any, body: any, callerUserId?: string | null) {
  const { access_key, doc_type, company_id } = body;
  if (!access_key) return jsonResponse({ error: "Chave de acesso obrigatória" }, 400);

  // Validação cross-tenant + descoberta de company_id quando o frontend não envia.
  let effectiveCompanyId: string | null = company_id ? String(company_id) : null;
  if (callerUserId) {
    if (!effectiveCompanyId) {
      const { data: docRow } = await supabase
        .from("fiscal_documents")
        .select("company_id")
        .eq("access_key", access_key)
        .maybeSingle();
      effectiveCompanyId = docRow?.company_id ? String(docRow.company_id) : null;
    }

    if (!effectiveCompanyId) {
      return jsonResponse({ success: false, error: "Documento não encontrado" }, 404);
    }

    const { data: membership } = await supabase
      .from("company_users")
      .select("id")
      .eq("user_id", callerUserId)
      .eq("company_id", effectiveCompanyId)
      .eq("is_active", true)
      .maybeSingle();
    if (!membership) {
      return jsonResponse({ success: false, error: "Documento não pertence a esta empresa" }, 403);
    }
  }

  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();
  const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

  const keyDigits = onlyDigits(access_key);
  const isAccessKey = keyDigits.length === 44;
  let docIdOrKey: string = isAccessKey ? keyDigits : String(access_key);

  if (isAccessKey && effectiveCompanyId) {
    const { data: company } = await supabase
      .from("companies")
      .select("cnpj")
      .eq("id", String(effectiveCompanyId))
      .maybeSingle();

    const cpfCnpj = onlyDigits(company?.cnpj);
    const ambiente: "homologacao" | "producao" =
      Deno.env.get("NUVEM_FISCAL_SANDBOX") === "true" ? "homologacao" : "producao";

    if (cpfCnpj.length >= 11) {
      const resolved = await resolveNuvemFiscalDocId({
        token,
        baseUrl,
        endpoint,
        ambiente,
        cpfCnpj,
        chave: keyDigits,
      });
      if (resolved) docIdOrKey = resolved;
    }
  }

  const resp = await fetch(`${baseUrl}/${endpoint}/${docIdOrKey}/xml`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" },
  });

  if (!resp.ok) {
    return jsonResponse({ success: false, error: "XML não encontrado" });
  }

  const xml = await resp.text();
  return jsonResponse({ success: true, xml });
}

// ─── Inutilizar numeração (RBAC: apenas admin/gerente) ───
async function handleInutilize(supabase: any, body: any, callerUserId?: string | null) {
  const { company_id, doc_type, serie, numero_inicial, numero_final, justificativa } = body;
  if (!justificativa || justificativa.length < 15) {
    return jsonResponse({ error: "Justificativa deve ter no mínimo 15 caracteres" }, 400);
  }

  // RBAC: exigir perfil admin ou gerente
  if (callerUserId && company_id) {
    const { data: userRole } = await supabase
      .from("company_users")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("company_id", company_id)
      .eq("is_active", true)
      .maybeSingle();

    const allowedRoles = ["admin", "gerente"];
    if (!userRole || !allowedRoles.includes(userRole.role)) {
      return jsonResponse({ success: false, error: "Apenas administradores e gerentes podem inutilizar numeração fiscal" }, 403);
    }
  }

  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();
  const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

  const resp = await fetch(`${baseUrl}/${endpoint}/inutilizacao`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ambiente: Deno.env.get("NUVEM_FISCAL_SANDBOX") === "true" ? "homologacao" : "producao",
      serie,
      numero_inicial,
      numero_final,
      justificativa,
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    return jsonResponse({ success: false, error: data?.mensagem || "Erro na inutilização" });
  }

  // Persistir inutilização na tabela fiscal_documents
  if (company_id) {
    const ambiente = Deno.env.get("NUVEM_FISCAL_SANDBOX") === "true" ? "homologacao" : "producao";
    for (let num = numero_inicial; num <= numero_final; num++) {
      await supabase.from("fiscal_documents").insert({
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
  }

  return jsonResponse({ success: true, data });
}

// ─── Backup XMLs ───
async function handleBackupXmls(supabase: any, body: any) {
  const { company_id } = body;
  if (!company_id) return jsonResponse({ error: "company_id obrigatório" }, 400);

  const { data: docs } = await supabase
    .from("fiscal_documents")
    .select("access_key, number, doc_type")
    .eq("company_id", company_id)
    .eq("status", "autorizada")
    .not("access_key", "is", null);

  if (!docs || docs.length === 0) {
    return jsonResponse({ success: true, message: "Nenhum documento para backup", backed: 0 });
  }

  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();
  let backed = 0;

  for (const doc of docs) {
    try {
      const endpoint = doc.doc_type === "nfe" ? "nfe" : "nfce";
      const xmlResp = await fetch(`${baseUrl}/${endpoint}/${doc.access_key}/xml`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" },
      });
      if (!xmlResp.ok) continue;

      const xml = await xmlResp.text();
      const safeKey = doc.access_key.replace(/\D/g, "").slice(-8);
      const fileName = `${doc.doc_type}_${doc.number}_${safeKey}.xml`;
      const path = `${company_id}/xmls/${doc.doc_type}/${fileName}`;

      const blob = new Blob([xml], { type: "application/xml" });
      await supabase.storage.from("company-backups").upload(path, blob, { upsert: true, contentType: "application/xml" });
      backed++;
    } catch {
      // Continue with next doc
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
// AUTH HELPER — validates JWT for external calls
// ════════════════════════════════════════════════

async function validateCaller(req: Request): Promise<{ userId: string | null; isServiceCall: boolean }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { userId: null, isServiceCall: false };
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // If the token IS the service_role_key itself, it's an internal call (e.g. process-fiscal-queue)
  if (token === serviceRoleKey) {
    return { userId: null, isServiceCall: true };
  }

  // Validate user JWT via getClaims
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const { data, error } = await userClient.auth.getClaims(token);
    if (error || !data?.claims?.sub) {
      return { userId: null, isServiceCall: false };
    }
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
    const body = await req.json();
    const action = body.action || "emit";

    // Auth + tenant check for all actions that touch company data
    const isAuthRequired = ["emit", "cancel", "backup_xmls"].includes(action) || Boolean(body.company_id);
    if (isAuthRequired) {
      const auth = await requireUser(req);
      if (!auth.ok) return auth.response;

      const companyId = String(body.company_id || "");
      if (companyId) {
        const membership = await requireCompanyMembership({
          supabase: auth.supabase,
          userId: auth.userId,
          companyId,
        });
        if (!membership.ok) return membership.response;
      }
    }

    // Caller identity for read/download actions
    const { userId } = await validateCaller(req);

    // Service client (used only after auth+tenant validation above)
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
    console.error("[emit-nfce] ERRO:", err.message);
    return jsonResponse({ error: err.message || "Erro interno" }, 500);
  }
});
