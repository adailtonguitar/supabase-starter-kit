import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NUVEM_FISCAL_SANDBOX_MODE = Deno.env.get("NUVEM_FISCAL_SANDBOX") === "true";
const NUVEM_FISCAL_API = NUVEM_FISCAL_SANDBOX_MODE
  ? "https://api.sandbox.nuvemfiscal.com.br"
  : "https://api.nuvemfiscal.com.br";
const NUVEM_FISCAL_AUTH = "https://auth.nuvemfiscal.com.br";

async function getNuvemFiscalToken(): Promise<string> {
  const clientId = NUVEM_FISCAL_SANDBOX_MODE
    ? (Deno.env.get("NUVEM_FISCAL_SANDBOX_CLIENT_ID") || Deno.env.get("NUVEM_FISCAL_CLIENT_ID"))
    : Deno.env.get("NUVEM_FISCAL_CLIENT_ID");
  const clientSecret = NUVEM_FISCAL_SANDBOX_MODE
    ? (Deno.env.get("NUVEM_FISCAL_SANDBOX_CLIENT_SECRET") || Deno.env.get("NUVEM_FISCAL_CLIENT_SECRET"))
    : Deno.env.get("NUVEM_FISCAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Credenciais Nuvem Fiscal não configuradas");
  console.log(`[NuvemFiscal] Modo: ${NUVEM_FISCAL_SANDBOX_MODE ? "SANDBOX" : "PRODUÇÃO"}, API: ${NUVEM_FISCAL_API}`);

  const resp = await fetch(`${NUVEM_FISCAL_AUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "cep cnpj nfce nfe empresa",
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Erro auth Nuvem Fiscal [${resp.status}]: ${errText}`);
  }

  const data = await resp.json();
  return data.access_token;
}

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeFiscalText(value: unknown, fallback = "") {
  return String(value ?? fallback)
    .normalize("NFD")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function checkCompanyOnNuvemFiscal(token: string, cpfCnpj: string): Promise<{ exists: boolean; status: number | null; details?: any }> {
  const resp = await fetch(`${NUVEM_FISCAL_API}/empresas/${cpfCnpj}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const rawText = await resp.text();
  let details: any = null;
  try {
    details = rawText ? JSON.parse(rawText) : null;
  } catch {
    details = rawText || null;
  }

  if (resp.ok) {
    return { exists: true, status: resp.status, details };
  }

  if (resp.status === 404) {
    return { exists: false, status: resp.status, details };
  }

  return { exists: false, status: resp.status, details };
}

function normalizeFiscalAuthorization(payload: any) {
  const rawStatus = (
    payload?.status ||
    payload?.situacao ||
    payload?.status_sefaz?.status ||
    payload?.status_sefaz?.xMotivo ||
    payload?.motivo_status ||
    ""
  )
    .toString()
    .toLowerCase()
    .trim();

  const sefazCode =
    payload?.codigo_status ||
    payload?.status_sefaz?.cStat ||
    payload?.cStat ||
    payload?.protNFe?.infProt?.cStat ||
    payload?.infProt?.cStat ||
    null;

  const accessKey =
    payload?.chave ||
    payload?.chave_acesso ||
    payload?.access_key ||
    payload?.protNFe?.infProt?.chNFe ||
    payload?.infProt?.chNFe ||
    null;

  const protocolNumber =
    payload?.protocolo ||
    payload?.numero_protocolo ||
    payload?.status_sefaz?.nProt ||
    payload?.protNFe?.infProt?.nProt ||
    payload?.infProt?.nProt ||
    null;

  const normalizedCode = sefazCode ? String(sefazCode) : null;
  const isAuthorized =
    rawStatus.includes("autoriz") ||
    rawStatus.includes("aprov") ||
    normalizedCode === "100";

  const isRejected = rawStatus.includes("rejeit") || (!!normalizedCode && normalizedCode.startsWith("2") && normalizedCode !== "204");
  const isCanceled = rawStatus.includes("cancel") || normalizedCode === "101";
  const isContingency = rawStatus.includes("conting") || normalizedCode === "150";

  let status = rawStatus || "pendente";
  if (isAuthorized) status = "autorizada";
  else if (isCanceled) status = "cancelada";
  else if (isRejected) status = "rejeitada";
  else if (isContingency) status = "contingencia";
  else status = "pendente";

  return {
    rawStatus,
    sefazCode: normalizedCode,
    accessKey,
    protocolNumber,
    isAuthorized,
    status,
  };
}

async function persistFiscalEmissionResult(params: {
  supabase: any;
  company_id: string;
  sale_id?: string | null;
  config: any;
  status: string;
  accessKey: string | null;
  docNumber: number | null;
  totalNF: number;
  form: any;
  xmlContent?: string | null;
  nuvemFiscalId?: string | null;
  protocolNumber?: string | null;
}) {
  const {
    supabase,
    company_id,
    sale_id,
    config,
    status,
    accessKey,
    docNumber,
    totalNF,
    form,
    xmlContent,
    nuvemFiscalId,
    protocolNumber,
  } = params;

  const { error: fiscalDocError } = await supabase.from("fiscal_documents").insert({
    company_id,
    doc_type: "nfce",
    number: docNumber,
    serie: config.serie,
    access_key: accessKey,
    status,
    protocol_number: protocolNumber || null,
    total_value: totalNF,
    customer_name: form.customer_name || null,
    customer_cpf_cnpj: form.customer_doc?.replace(/\D/g, "") || null,
    payment_method: form.payment_method,
    environment: config.environment,
    is_contingency: false,
  } as any);

  if (fiscalDocError) {
    throw new Error(`Falha ao salvar documento fiscal no banco: ${fiscalDocError.message}`);
  }

  if (sale_id) {
    const { error: saleError } = await supabase
      .from("sales")
      .update({ status } as any)
      .eq("id", sale_id);

    if (saleError) {
      throw new Error(`Falha ao atualizar status da venda: ${saleError.message}`);
    }
  }

  const { error: configError } = await supabase
    .from("fiscal_configs")
    .update({ next_number: (config.next_number || 1) + 1 })
    .eq("id", config.id);

  if (configError) {
    throw new Error(`Falha ao avançar numeração fiscal: ${configError.message}`);
  }
}

// ── Helper: upload certificate to Nuvem Fiscal via JSON (CadastrarCertificado) ──
async function uploadCertToNuvemFiscal(token: string, cnpjClean: string, certBase64: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const resp = await fetch(`${NUVEM_FISCAL_API}/empresas/${cnpjClean}/certificado`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      certificado: certBase64,
      password: password,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[emit-nfce] Certificate upload failed [${resp.status}]: ${errText}`);
    return { ok: false, error: `Falha ao enviar certificado [${resp.status}]: ${errText}` };
  }

  await resp.text(); // consume body
  return { ok: true };
}

// ── Helper: auto-configure NFC-e settings on Nuvem Fiscal (PUT /empresas/{cpf_cnpj}/nfce) ──
async function ensureNfceConfigOnNuvemFiscal(
  token: string,
  cnpjClean: string,
  config: { environment: string; crt: number; csc_id?: string; csc_token?: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    // First check if NFC-e config already exists
    const checkResp = await fetch(`${NUVEM_FISCAL_API}/empresas/${cnpjClean}/nfce`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (checkResp.ok) {
      const existing = await checkResp.json();
      const desiredAmb = config.environment === "producao" ? "producao" : "homologacao";
      // Only skip if environment AND CSC match — otherwise force update
      if (existing?.ambiente === desiredAmb) {
        console.log(`[emit-nfce] NFC-e config already matches (${desiredAmb}) on Nuvem Fiscal for ${cnpjClean}, skipping`);
        return { ok: true };
      }
      console.log(`[emit-nfce] NFC-e config exists but ambiente differs (${existing?.ambiente} → ${desiredAmb}), updating...`);
    } else {
      // 404 or error means config doesn't exist, proceed to create
      await checkResp.text(); // consume body
    }

    const nfceConfigPayload: Record<string, any> = {
      CRT: config.crt || 1,
      ambiente: config.environment === "producao" ? "producao" : "homologacao",
      sefaz: {},
    };

    // Add CSC if available (required for production, optional for homologação)
    if (config.csc_id && config.csc_token) {
      nfceConfigPayload.sefaz = {
        id_csc: parseInt(config.csc_id) || 0,
        csc: config.csc_token,
      };
    }

    console.log(`[emit-nfce] Configuring NFC-e on Nuvem Fiscal for ${cnpjClean}: ${JSON.stringify(nfceConfigPayload)}`);

    const resp = await fetch(`${NUVEM_FISCAL_API}/empresas/${cnpjClean}/nfce`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(nfceConfigPayload),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[emit-nfce] NFC-e config failed [${resp.status}]: ${errText}`);
      return { ok: false, error: `Falha ao configurar NFC-e na Nuvem Fiscal [${resp.status}]: ${errText}` };
    }

    await resp.text(); // consume body
    console.log(`[emit-nfce] NFC-e config set successfully on Nuvem Fiscal for ${cnpjClean}`);
    return { ok: true };
  } catch (err: any) {
    console.error("[emit-nfce] ensureNfceConfigOnNuvemFiscal error:", err);
    return { ok: false, error: `Erro ao configurar NFC-e: ${err.message}` };
  }
}

async function deleteCertFromNuvemFiscal(token: string, cnpjClean: string): Promise<{ ok: boolean; error?: string }> {
  const resp = await fetch(`${NUVEM_FISCAL_API}/empresas/${cnpjClean}/certificado`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!resp.ok && resp.status !== 404) {
    const errText = await resp.text();
    console.error(`[emit-nfce] Certificate delete failed [${resp.status}]: ${errText}`);
    return { ok: false, error: `Falha ao excluir certificado [${resp.status}]: ${errText}` };
  }

  return { ok: true };
}

// ── Upload XML to Storage bucket for 5-year retention ──
async function backupXml(
  supabase: any,
  companyId: string,
  docType: string,
  accessKey: string | null,
  docNumber: number | null,
  xmlContent: string | null,
  event: "emissao" | "cancelamento"
) {
  if (!xmlContent) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const fileName = `${accessKey || docNumber || now.getTime()}_${event}.xml`;
  const filePath = `${companyId}/xml/${docType}/${year}/${month}/${fileName}`;

  try {
    const encoder = new TextEncoder();
    await supabase.storage
      .from("company-backups")
      .upload(filePath, encoder.encode(xmlContent), {
        contentType: "application/xml",
        upsert: true,
      });
    console.log(`XML backup saved: ${filePath}`);
  } catch (err: unknown) {
    console.error("XML backup error:", err);
  }
}

// ── ICMS rate table by state (alíquota interna padrão) ──
const ICMS_RATES_BY_STATE: Record<string, number> = {
  AC: 19, AL: 19, AM: 20, AP: 18, BA: 20.5, CE: 20, DF: 20, ES: 17,
  GO: 19, MA: 22, MG: 18, MS: 17, MT: 17, PA: 19, PB: 20, PE: 20.5,
  PI: 21, PR: 19.5, RJ: 22, RN: 18, RO: 19.5, RR: 20, RS: 17, SC: 17,
  SE: 19, SP: 18, TO: 20,
};

// ── FCP (Fundo de Combate à Pobreza) rates by state ──
// Only states that currently charge FCP on consumer goods
const FCP_RATES_BY_STATE: Record<string, number> = {
  AC: 0, AL: 1, AM: 2, AP: 0, BA: 2, CE: 0, DF: 2, ES: 0,
  GO: 2, MA: 2, MG: 2, MS: 2, MT: 2, PA: 0, PB: 2, PE: 2,
  PI: 2, PR: 0, RJ: 2, RN: 2, RO: 2, RR: 2, RS: 0, SC: 0,
  SE: 2, SP: 0, TO: 2,
};

// ── CSTs that are tax-exempt (no ICMS/FCP calculation needed) ──
const EXEMPT_CST = new Set(["40", "41", "50", "300", "400", "500"]);

// ── CSOSNs/CSTs that indicate Substituição Tributária ──
const CSOSN_ST_SET = new Set(["201", "202", "203", "500"]);
const CST_ST_SET = new Set(["10", "30", "60", "70"]);

/**
 * 🟠 CORREÇÃO #5: PIS/COFINS CST derivado por regime tributário
 * SN → CST 49 (Outras Operações de Saída)
 * LP → CST 01 (Tributável - Cumulativo, 0.65% PIS / 3% COFINS)
 * LR → CST 01 (Tributável - Não Cumulativo, 1.65% PIS / 7.6% COFINS)
 */
function derivePisCofinsCST(itemCst: string | undefined, crt: number): string {
  if (itemCst && itemCst !== "49") return itemCst; // User explicitly set a CST
  const isSimples = crt === 1 || crt === 2;
  if (isSimples) return "49"; // Correto para SN
  return "01"; // LP e LR: tributação normal
}

function getPisAliquota(crt: number): number {
  if (crt === 1 || crt === 2) return 0; // SN: PIS incluído no DAS
  if (crt === 3) return 0.65; // Lucro Presumido: cumulativo
  return 1.65; // Lucro Real: não-cumulativo
}

function getCofinsAliquota(crt: number): number {
  if (crt === 1 || crt === 2) return 0; // SN: COFINS incluído no DAS
  if (crt === 3) return 3.0; // Lucro Presumido: cumulativo
  return 7.6; // Lucro Real: não-cumulativo
}

function buildPisCofinsPayload(type: "pis" | "cofins", itemCst: string | undefined, crt: number, baseCalc: number) {
  const cst = derivePisCofinsCST(itemCst, crt);
  const isSimples = crt === 1 || crt === 2;
  
  if (isSimples || cst === "49" || cst === "99") {
    // Sem tributação destacada
    if (type === "pis") {
      return { PISOutr: { CST: cst, vBC: 0, pPIS: 0, vPIS: 0 } };
    }
    return { COFINSOutr: { CST: cst, vBC: 0, pCOFINS: 0, vCOFINS: 0 } };
  }

  // LP/LR com CST 01: tributação normal com alíquota e base
  const bc = Math.round(baseCalc * 100) / 100;
  if (type === "pis") {
    const aliq = getPisAliquota(crt);
    const valor = Math.round(bc * (aliq / 100) * 100) / 100;
    return { PISAliq: { CST: cst, vBC: bc, pPIS: aliq, vPIS: valor } };
  }
  const aliq = getCofinsAliquota(crt);
  const valor = Math.round(bc * (aliq / 100) * 100) / 100;
  return { COFINSAliq: { CST: cst, vBC: bc, pCOFINS: aliq, vCOFINS: valor } };
}

/**
 * 🟠 CORREÇÃO #6: Cálculo de ICMS-ST integrado ao fluxo de emissão
 */
function calculateIcmsStForItem(
  item: any, uf: string, crt: number, vProd: number, vDesc: number
): { vBCST: number; pICMSST: number; vICMSST: number; pMVAST: number } | null {
  const cst = String(item.cst || "").trim();
  const isSimples = crt === 1 || crt === 2;
  const hasST = isSimples ? CSOSN_ST_SET.has(cst) : CST_ST_SET.has(cst);
  
  if (!hasST) return null;
  // CST 60 / CSOSN 500 = ST cobrado anteriormente, não calcula
  if (cst === "60" || cst === "500") return null;

  const baseCalc = Math.round((vProd - vDesc) * 100) / 100;
  const icmsOwnRate = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
  const mva = item.mva || 40; // MVA padrão 40% se não informada
  const bcST = Math.round(baseCalc * (1 + mva / 100) * 100) / 100;
  const icmsInternalRate = ICMS_RATES_BY_STATE[uf] || 18;
  const icmsSTTotal = Math.round(bcST * (icmsInternalRate / 100) * 100) / 100;
  const icmsOwn = Math.round(baseCalc * (icmsOwnRate / 100) * 100) / 100;
  const icmsST = Math.max(0, Math.round((icmsSTTotal - icmsOwn) * 100) / 100);

  return { vBCST: bcST, pICMSST: icmsInternalRate, vICMSST: icmsST, pMVAST: mva };
}

// ── Helper: compute FCP for an item ──
function computeFcp(baseCalc: number, uf: string, itemFcpAliquota?: number): { percentual_fcp: number; valor_fcp: number; valor_base_calculo_fcp: number } | null {
  const fcpRate = itemFcpAliquota ?? FCP_RATES_BY_STATE[uf] ?? 0;
  if (fcpRate <= 0) return null;
  const valorFcp = baseCalc * (fcpRate / 100);
  return {
    percentual_fcp: fcpRate,
    valor_fcp: Math.round(valorFcp * 100) / 100,
    valor_base_calculo_fcp: Math.round(baseCalc * 100) / 100,
  };
}

// ── Calculate ICMS + FCP for an item based on CST/CSOSN and state ──
function calculateIcmsForItem(item: any, uf: string, crt: number) {
  const cstCode = String(item.cst || "").trim();
  const isSimples = crt === 1 || crt === 2;

  // For Simples Nacional with common CSOSNs, no ICMS calc needed on NFC-e
  if (isSimples) {
    if (["101", "102", "103", "300", "400", "500"].includes(cstCode)) {
      return { csosn: cstCode, origem: item.origem || "0" };
    }
    // 🟠 CORREÇÃO #7: CSOSN 201/202/203 = with ST — include FCP-ST calculation
    if (["201", "202", "203"].includes(cstCode)) {
      const baseCalc = (item.qty || 1) * (item.unit_price || 0) - (item.discount || 0);
      const fcpSt = computeFcp(baseCalc, uf, item.fcp_aliquota);
      return {
        csosn: cstCode,
        origem: item.origem || "0",
        ...(fcpSt ? {
          percentual_fcp_st: fcpSt.percentual_fcp,
          valor_fcp_st: fcpSt.valor_fcp,
          valor_base_calculo_fcp_st: fcpSt.valor_base_calculo_fcp,
        } : {}),
      };
    }
    // CSOSN 900 = Outros - may need aliquota + FCP
    if (cstCode === "900") {
      const aliq = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
      const baseCalc = (item.qty || 1) * (item.unit_price || 0) - (item.discount || 0);
      const valor = baseCalc * (aliq / 100);
      const fcp = computeFcp(baseCalc, uf, item.fcp_aliquota);
      return {
        csosn: "900",
        origem: item.origem || "0",
        aliquota: aliq,
        valor: Math.round(valor * 100) / 100,
        ...(fcp ? fcp : {}),
      };
    }
    return { csosn: cstCode, origem: item.origem || "0" };
  }

  // Regime Normal (Lucro Presumido / Real)
  if (EXEMPT_CST.has(cstCode)) {
    return { cst: cstCode, origem: item.origem || "0" };
  }

  const baseCalc = (item.qty || 1) * (item.unit_price || 0) - (item.discount || 0);
  const fcp = computeFcp(baseCalc, uf, item.fcp_aliquota);

  if (cstCode === "00") {
    // Tributada integralmente
    const aliq = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
    const valor = baseCalc * (aliq / 100);
    return {
      cst: "00",
      origem: item.origem || "0",
      modalidade_base_calculo: 3,
      valor_base_calculo: Math.round(baseCalc * 100) / 100,
      aliquota: aliq,
      valor: Math.round(valor * 100) / 100,
      ...(fcp ? fcp : {}),
    };
  }

  if (cstCode === "20") {
    // Redução de base
    const aliq = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
    const reducao = item.icms_reducao || 0;
    const baseReduzida = baseCalc * (1 - reducao / 100);
    const valor = baseReduzida * (aliq / 100);
    const fcpReduzido = computeFcp(baseReduzida, uf, item.fcp_aliquota);
    return {
      cst: "20",
      origem: item.origem || "0",
      modalidade_base_calculo: 3,
      percentual_reducao: reducao,
      valor_base_calculo: Math.round(baseReduzida * 100) / 100,
      aliquota: aliq,
      valor: Math.round(valor * 100) / 100,
      ...(fcpReduzido ? fcpReduzido : {}),
    };
  }

  if (["10", "30", "60", "70"].includes(cstCode)) {
    // ST-related CSTs
    const aliq = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
    const valor = cstCode === "60" ? 0 : baseCalc * (aliq / 100);
    return {
      cst: cstCode,
      origem: item.origem || "0",
      ...(cstCode !== "60" ? {
        modalidade_base_calculo: 3,
        valor_base_calculo: Math.round(baseCalc * 100) / 100,
        aliquota: aliq,
        valor: Math.round(valor * 100) / 100,
        ...(fcp ? fcp : {}),
      } : {}),
    };
  }

  // CST 51 (Diferimento), 90 (Outros)
  const aliq = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
  const valor = baseCalc * (aliq / 100);
  return {
    cst: cstCode || "00",
    origem: item.origem || "0",
    modalidade_base_calculo: 3,
    valor_base_calculo: Math.round(baseCalc * 100) / 100,
    aliquota: aliq,
    valor: Math.round(valor * 100) / 100,
    ...(fcp ? fcp : {}),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use SERVICE_ROLE_KEY for server-side operations (verify_jwt = false in config.toml)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const action = body.action || "emit";

    // ── Shared helpers for company resolution ──
    const authHeader = req.headers.get("authorization") || "";
    const jwtToken = authHeader.replace("Bearer ", "");

    async function getAuthUserId(): Promise<string | null> {
      if (!jwtToken) return null;
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser(jwtToken);
        return authUser?.id || null;
      } catch { return null; }
    }

    async function resolveCompanyFromUser(userId: string): Promise<string | null> {
      const { data: emp } = await supabase
        .from("employees")
        .select("company_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (emp?.company_id) return emp.company_id;
      const { data: cu } = await supabase
        .from("company_users")
        .select("company_id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (cu?.company_id) return cu.company_id;
      return null;
    }

    // ── Demo account guard ──
    async function isDemoCompany(companyId: string): Promise<boolean> {
      const { data } = await supabase
        .from("companies")
        .select("is_demo")
        .eq("id", companyId)
        .maybeSingle();
      return data?.is_demo === true;
    }

    // Block demo accounts from fiscal operations (super_admin bypass)
    const demoCheckCompanyId = body.company_id || (jwtToken ? await getAuthUserId().then(uid => uid ? resolveCompanyFromUser(uid) : null) : null);
    if (demoCheckCompanyId && await isDemoCompany(demoCheckCompanyId)) {
      // Check if user is super_admin — bypass demo restriction
      let isSuperAdmin = false;
      const authUserId = await getAuthUserId();
      if (authUserId) {
        const { data: adminData } = await supabase
          .from("admin_roles")
          .select("role")
          .eq("user_id", authUserId)
          .eq("role", "super_admin")
          .maybeSingle();
        isSuperAdmin = !!adminData;
      }
      if (!isSuperAdmin) {
        return jsonResponse({ error: "Emissão fiscal não disponível em contas de demonstração. Assine um plano para utilizar este recurso." }, 403);
      }
    }


    // ─── UPLOAD CERTIFICATE TO NUVEM FISCAL ───
    if (action === "upload_certificate") {
      const { company_id: certCompanyId, certificate_base64: certB64, certificate_password: certPwd } = body;
      if (!certCompanyId || !certB64 || !certPwd) {
        return jsonResponse({ error: "company_id, certificate_base64 e certificate_password são obrigatórios" }, 400);
      }

      const { data: certCompany } = await supabase
        .from("companies")
        .select("cnpj")
        .eq("id", certCompanyId)
        .single();

      if (!certCompany?.cnpj) {
        return jsonResponse({ error: "CNPJ da empresa não encontrado" }, 404);
      }

      const certCnpjClean = certCompany.cnpj.replace(/\D/g, "");
      const certToken = await getNuvemFiscalToken();
      const certResult = await uploadCertToNuvemFiscal(certToken, certCnpjClean, certB64, certPwd);

      if (!certResult.ok) {
        return jsonResponse({
          success: false,
          error: certResult.error || "Falha ao enviar certificado para Nuvem Fiscal",
        });
      }

      // 🔒 Hash the password with bcrypt and store in DB (never plain-text)
      try {
        const hashedPassword = await bcrypt.hash(certPwd);
        await supabase
          .from("fiscal_configs")
          .update({ certificate_password_hash: hashedPassword } as any)
          .eq("company_id", certCompanyId)
          .eq("certificate_type", "A1");
        console.log(`[emit-nfce] Certificate password hashed and stored for company ${certCompanyId}`);
      } catch (hashErr) {
        console.error("[emit-nfce] Failed to hash certificate password:", hashErr);
        // Non-blocking: cert was uploaded successfully, hash storage is best-effort
      }

      console.log(`[emit-nfce] Certificate uploaded successfully for CNPJ ${certCnpjClean}`);
      return jsonResponse({ success: true, message: "Certificado digital enviado para a Nuvem Fiscal com sucesso." });
    }

    if (action === "delete_certificate") {
      const { company_id: certCompanyId, certificate_password: certPwd } = body;
      if (!certCompanyId || !certPwd) {
        return jsonResponse({ error: "company_id e certificate_password são obrigatórios" }, 400);
      }

      const { data: certConfig } = await supabase
        .from("fiscal_configs")
        .select("certificate_password_hash")
        .eq("company_id", certCompanyId)
        .eq("certificate_type", "A1")
        .not("certificate_path", "is", null)
        .maybeSingle();

      if (certConfig?.certificate_password_hash) {
        const storedHash = certConfig.certificate_password_hash;
        const isBcrypt = storedHash.startsWith("$2");
        let passwordValid = false;

        if (isBcrypt) {
          // 🔒 Bcrypt verification (secure)
          passwordValid = await bcrypt.compare(certPwd, storedHash);
        } else {
          // Legacy plain-text: constant-time comparison
          const encoder = new TextEncoder();
          const a = encoder.encode(storedHash);
          const b = encoder.encode(certPwd);
          if (a.length === b.length) {
            let diff = 0;
            for (let i = 0; i < a.length; i++) {
              diff |= a[i] ^ b[i];
            }
            passwordValid = diff === 0;
          }
        }

        if (!passwordValid) {
          return jsonResponse({ error: "Senha do certificado inválida" }, 400);
        }
      }

      const { data: certCompany } = await supabase
        .from("companies")
        .select("cnpj")
        .eq("id", certCompanyId)
        .single();

      if (!certCompany?.cnpj) {
        return jsonResponse({ error: "CNPJ da empresa não encontrado" }, 404);
      }

      const certCnpjClean = certCompany.cnpj.replace(/\D/g, "");
      const certToken = await getNuvemFiscalToken();
      const certResult = await deleteCertFromNuvemFiscal(certToken, certCnpjClean);

      if (!certResult.ok) {
        return jsonResponse({
          success: false,
          error: certResult.error || "Falha ao excluir certificado da Nuvem Fiscal",
        });
      }

      console.log(`[emit-nfce] Certificate deleted successfully for CNPJ ${certCnpjClean}`);
      return jsonResponse({ success: true, message: "Certificado digital excluído com sucesso." });
    }

    if (action === "backup_xmls") {
      const { company_id: bkCompanyId } = body;
      if (!bkCompanyId) return jsonResponse({ error: "company_id obrigatório" }, 400);

      const { data: xmlDocs, error: xmlErr } = await supabase
        .from("fiscal_documents")
        .select("id, doc_type, number, access_key, xml_content, created_at")
        .eq("company_id", bkCompanyId)
        .not("xml_content", "is", null)
        .order("created_at", { ascending: true });

      if (xmlErr) return jsonResponse({ error: xmlErr.message }, 500);

      let backed = 0;
      let skipped = 0;

      for (const doc of xmlDocs || []) {
        const dt = new Date(doc.created_at);
        const year = dt.getFullYear();
        const month = String(dt.getMonth() + 1).padStart(2, "0");
        const fileName = `${doc.access_key || doc.number || doc.id}_emissao.xml`;
        const filePath = `${bkCompanyId}/xml/${doc.doc_type}/${year}/${month}/${fileName}`;

        // Check if already exists
        const { data: existing } = await supabase.storage
          .from("company-backups")
          .list(`${bkCompanyId}/xml/${doc.doc_type}/${year}/${month}`, {
            search: fileName,
          });

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        const encoder = new TextEncoder();
        await supabase.storage
          .from("company-backups")
          .upload(filePath, encoder.encode(doc.xml_content), {
            contentType: "application/xml",
            upsert: true,
          });
        backed++;
      }

      return jsonResponse({
        success: true,
        message: `Backup concluído: ${backed} XMLs salvos, ${skipped} já existiam.`,
        backed,
        skipped,
        total: (xmlDocs || []).length,
      });
    }

    // ─── DOWNLOAD PDF (DANFE) ───
    if (action === "download_pdf") {
      const { access_key, doc_type } = body;
      if (!access_key) return jsonResponse({ error: "Chave de acesso obrigatória" }, 400);

      const token = await getNuvemFiscalToken();
      const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

      const searchResp = await fetch(
        `${NUVEM_FISCAL_API}/${endpoint}?chave=${access_key}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!searchResp.ok) {
        const errData = await searchResp.json();
        return jsonResponse({
          error: errData?.mensagem || `Documento não encontrado [${searchResp.status}]`,
        });
      }

      const searchData = await searchResp.json();
      const docId = searchData?.data?.[0]?.id || searchData?.id;

      if (!docId) {
        return jsonResponse({ error: "Documento não encontrado na Nuvem Fiscal" });
      }

      const pdfResp = await fetch(
        `${NUVEM_FISCAL_API}/${endpoint}/${docId}/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!pdfResp.ok) {
        const errText = await pdfResp.text();
        return jsonResponse({ error: `Erro ao gerar PDF [${pdfResp.status}]: ${errText}` });
      }

      const pdfBuffer = await pdfResp.arrayBuffer();
      const pdfBytes = new Uint8Array(pdfBuffer);
      let binaryStr = "";
      for (let i = 0; i < pdfBytes.length; i++) {
        binaryStr += String.fromCharCode(pdfBytes[i]);
      }
      const pdfBase64 = btoa(binaryStr);

      return jsonResponse({ success: true, pdf_base64: pdfBase64 });
    }

    // ─── CONSULT STATUS ───
    if (action === "consult_status") {
      const { access_key, doc_type, company_id: consultCompanyId } = body;
      if (!access_key) return jsonResponse({ error: "Chave de acesso obrigatória" }, 400);

      const token = await getNuvemFiscalToken();
      const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

      const searchResp = await fetch(
        `${NUVEM_FISCAL_API}/${endpoint}?chave=${access_key}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const searchText = await searchResp.text();
      let searchData: any = null;
      try {
        searchData = searchText ? JSON.parse(searchText) : null;
      } catch {
        searchData = { raw: searchText };
      }

      if (!searchResp.ok) {
        return jsonResponse({
          success: false,
          error: searchData?.mensagem || searchData?.message || `Documento não encontrado [${searchResp.status}]`,
          details: searchData,
        });
      }

      const docData = searchData?.data?.[0] || searchData?.items?.[0] || searchData?.value?.[0] || searchData;
      const docId = docData?.id || null;
      const normalized = normalizeFiscalAuthorization(docData || searchData);
      const resolvedNumber = docData?.numero || docData?.number || null;

      if (consultCompanyId) {
        await supabase
          .from("fiscal_documents")
          .update({
            status: normalized.status,
            number: resolvedNumber,
            access_key: normalized.accessKey || access_key,
          } as any)
          .eq("company_id", consultCompanyId)
          .eq("access_key", access_key);

        if (normalized.status === "autorizada") {
          await supabase
            .from("sales")
            .update({
              status: "autorizada",
              access_key: normalized.accessKey || access_key,
              number: resolvedNumber,
            } as any)
            .eq("company_id", consultCompanyId)
            .eq("access_key", access_key);
        }
      }

      return jsonResponse({
        success: true,
        status: normalized.status,
        sefaz_code: normalized.sefazCode,
        protocol_number: normalized.protocolNumber,
        access_key: normalized.accessKey || access_key,
        number: resolvedNumber,
        nuvem_fiscal_id: docId,
        details: docData || searchData,
      });
    }

    // ─── DOWNLOAD XML ───
    if (action === "download_xml") {
      const { access_key, doc_type } = body;
      if (!access_key) return jsonResponse({ error: "Chave de acesso obrigatória" }, 400);

      // 1. Try local DB first (faster)
      const { data: localDoc } = await supabase
        .from("fiscal_documents")
        .select("xml_content")
        .eq("access_key", access_key)
        .maybeSingle();

      if (localDoc?.xml_content) {
        return jsonResponse({ success: true, xml: localDoc.xml_content });
      }

      // 2. Fetch from Nuvem Fiscal API
      const token = await getNuvemFiscalToken();
      const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

      const searchResp = await fetch(
        `${NUVEM_FISCAL_API}/${endpoint}?chave=${access_key}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!searchResp.ok) {
        const errData = await searchResp.json();
        return jsonResponse({
          error: errData?.mensagem || `Documento não encontrado [${searchResp.status}]`,
        });
      }

      const searchData = await searchResp.json();
      const docId = searchData?.data?.[0]?.id || searchData?.id;

      if (!docId) {
        return jsonResponse({ error: "Documento não encontrado na Nuvem Fiscal" });
      }

      const xmlResp = await fetch(
        `${NUVEM_FISCAL_API}/${endpoint}/${docId}/xml`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!xmlResp.ok) {
        const errText = await xmlResp.text();
        return jsonResponse({ error: `Erro ao obter XML [${xmlResp.status}]: ${errText}` });
      }

      const xmlContent = await xmlResp.text();
      return jsonResponse({ success: true, xml: xmlContent });
    }

    // ─── CANCEL NFC-e / NF-e ───
    if (action === "cancel") {
      const { doc_id, access_key, doc_type, justificativa, fiscal_doc_id, sale_id } = body;
      if (!access_key && !doc_id) {
        return jsonResponse({ error: "Chave de acesso ou ID do documento obrigatório" }, 400);
      }
      if (!justificativa || justificativa.length < 15) {
        return jsonResponse({ error: "Justificativa deve ter no mínimo 15 caracteres" }, 400);
      }

      // ── PRAZO LEGAL: verificar se está dentro do prazo de cancelamento ──
      if (fiscal_doc_id) {
        const { data: fiscalDoc } = await supabase
          .from("fiscal_documents")
          .select("created_at, doc_type")
          .eq("id", fiscal_doc_id)
          .single();

        if (fiscalDoc) {
          const createdAt = new Date(fiscalDoc.created_at).getTime();
          const now = Date.now();
          const hoursElapsed = (now - createdAt) / (1000 * 60 * 60);
          const maxHours = fiscalDoc.doc_type === "nfce" ? 24 : 720; // NFC-e=24h, NF-e=30 dias

          if (hoursElapsed > maxHours) {
            return jsonResponse({
              success: false,
              error: `Prazo de cancelamento expirado. ${fiscalDoc.doc_type === "nfce" ? "NFC-e pode ser cancelada em até 24 horas" : "NF-e pode ser cancelada em até 720 horas (30 dias)"}. Documento emitido há ${Math.round(hoursElapsed)} horas.`,
            }, 400);
          }
        }
      }

      const token = await getNuvemFiscalToken();
      const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

      let nuvemId = doc_id;
      if (!nuvemId && access_key) {
        const searchResp = await fetch(
          `${NUVEM_FISCAL_API}/${endpoint}?chave=${access_key}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (searchResp.ok) {
          const searchData = await searchResp.json();
          nuvemId = searchData?.data?.[0]?.id || searchData?.id;
        }
      }

      if (!nuvemId) {
        return jsonResponse({ error: "Documento não encontrado na Nuvem Fiscal" });
      }

      const cancelResp = await fetch(
        `${NUVEM_FISCAL_API}/${endpoint}/${nuvemId}/cancelamento`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ justificativa }),
        }
      );

      const cancelData = await cancelResp.json();

      if (!cancelResp.ok) {
        console.error("Cancel error:", JSON.stringify(cancelData));
        return jsonResponse({
          success: false,
          error: cancelData?.mensagem || cancelData?.message || `Erro ao cancelar [${cancelResp.status}]`,
          details: cancelData,
        });
      }

      // Update fiscal_documents with company_id guard
      const cancelCompanyId = body.company_id;
      if (fiscal_doc_id && cancelCompanyId) {
        await supabase
          .from("fiscal_documents")
          .update({ status: "cancelada" })
          .eq("id", fiscal_doc_id)
          .eq("company_id", cancelCompanyId);
      } else if (access_key && cancelCompanyId) {
        await supabase
          .from("fiscal_documents")
          .update({ status: "cancelada" })
          .eq("access_key", access_key)
          .eq("company_id", cancelCompanyId);
      }

      if (sale_id && cancelCompanyId) {
        await supabase
          .from("sales")
          .update({ status: "cancelada" })
          .eq("id", sale_id)
          .eq("company_id", cancelCompanyId);
      }

      // ── Backup cancel XML ──
      if (cancelData?.xml) {
        await backupXml(supabase, body.company_id || "", doc_type || "nfce", access_key, null, cancelData.xml, "cancelamento");
      }

      return jsonResponse({
        success: true,
        status: "cancelada",
        protocol: cancelData?.protocolo || cancelData?.numero_protocolo || null,
      });
    }

    // ─── INUTILIZAR NUMERAÇÃO ───
    if (action === "inutilize") {
      const { company_id, doc_type, serie, numero_inicial, numero_final, justificativa: inutJust } = body;
      if (!company_id || !doc_type || !serie || !numero_inicial || !numero_final) {
        return jsonResponse({ error: "Dados incompletos para inutilização" }, 400);
      }
      if (!inutJust || inutJust.length < 15) {
        return jsonResponse({ error: "Justificativa deve ter no mínimo 15 caracteres" }, 400);
      }

      const { data: company } = await supabase
        .from("companies")
        .select("cnpj, address_state")
        .eq("id", company_id)
        .single();

      if (!company) return jsonResponse({ error: "Empresa não encontrada" }, 404);

      const { data: config } = await supabase
        .from("fiscal_configs")
        .select("environment")
        .eq("company_id", company_id)
        .eq("doc_type", doc_type)
        .eq("is_active", true)
        .single();

      const token = await getNuvemFiscalToken();
      const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

      const inutPayload = {
        ambiente: config?.environment === "producao" ? "producao" : "homologacao",
        cnpj: company.cnpj?.replace(/\D/g, ""),
        ano: new Date().getFullYear() % 100,
        serie: serie,
        numero_inicial: numero_inicial,
        numero_final: numero_final,
        justificativa: inutJust,
      };

      const inutResp = await fetch(`${NUVEM_FISCAL_API}/${endpoint}/inutilizacoes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(inutPayload),
      });

      const inutData = await inutResp.json();

      if (!inutResp.ok) {
        console.error("Inutilização error:", JSON.stringify(inutData));
        return jsonResponse({
          success: false,
          error: inutData?.mensagem || inutData?.message || `Erro na inutilização [${inutResp.status}]`,
          details: inutData,
        });
      }

      // Register each number as inutilized in fiscal_documents
      for (let n = numero_inicial; n <= numero_final; n++) {
        await supabase.from("fiscal_documents").insert({
          company_id,
          doc_type,
          number: n,
          serie,
          status: "inutilizada",
          total_value: 0,
          environment: config?.environment || "homologacao",
          is_contingency: false,
        });
      }

      return jsonResponse({
        success: true,
        message: `Numeração ${numero_inicial} a ${numero_final} inutilizada com sucesso.`,
        protocol: inutData?.protocolo || inutData?.numero_protocolo || null,
      });
    }

    // ─── EMIT CONTINGENCY NFC-e (post-sync) ───
    if (action === "emit_contingency") {
      const { sale_id, company_id, config_id, contingency_number, serie, form: contForm, signed_xml } = body;

      if (!company_id || !contForm) {
        return jsonResponse({ error: "Dados de contingência incompletos" }, 400);
      }

      // If we have a locally signed XML, save it directly and skip Nuvem Fiscal emission
      if (signed_xml) {
        console.log(`[Contingency] Received locally signed XML for contingency #${contingency_number}`);

        // Get config for metadata
        let configData = null;
        if (config_id) {
          const { data } = await supabase
            .from("fiscal_configs")
            .select("*")
            .eq("id", config_id)
            .single();
          configData = data;
        }
        if (!configData) {
          const { data } = await supabase
            .from("fiscal_configs")
            .select("*")
            .eq("company_id", company_id)
            .eq("doc_type", "nfce")
            .eq("is_active", true)
            .single();
          configData = data;
        }

        // Extract access key from signed XML
        const keyMatch = (signed_xml as string).match(/Id="NFe(\d{44})"/);
        const accessKey = keyMatch ? keyMatch[1] : null;

        const totalValue = (contForm.items || []).reduce(
          (sum: number, it: any) => sum + (it.qty || 1) * (it.unit_price || 0) - (it.discount || 0),
          0
        );

        // Store the signed XML as fiscal document
        await supabase.from("fiscal_documents").insert({
          company_id,
          doc_type: "nfce",
          number: contingency_number,
          serie: serie || configData?.serie || 1,
          access_key: accessKey,
          status: "contingencia",
          total_value: totalValue,
          customer_name: contForm.customer_name || null,
          customer_cpf_cnpj: contForm.customer_doc?.replace(/\D/g, "") || null,
          payment_method: contForm.payment_method,
          environment: configData?.environment || "homologacao",
          is_contingency: true,
        });

        // Backup the signed XML
        await backupXml(supabase, company_id, "nfce", accessKey, contingency_number, signed_xml, "emissao");

        return jsonResponse({
          success: true,
          access_key: accessKey,
          number: contingency_number,
          status: "contingencia",
          signed_locally: true,
        });
      }

      // No signed XML — fall through to normal emit via Nuvem Fiscal
      // Get config
      let configData = null;
      if (config_id) {
        const { data } = await supabase
          .from("fiscal_configs")
          .select("*")
          .eq("id", config_id)
          .single();
        configData = data;
      }
      if (!configData) {
        const { data } = await supabase
          .from("fiscal_configs")
          .select("*")
          .eq("company_id", company_id)
          .eq("doc_type", "nfce")
          .eq("is_active", true)
          .single();
        configData = data;
      }

      if (!configData) {
        return jsonResponse({ error: "Configuração fiscal NFC-e não encontrada para contingência" }, 404);
      }

      // Now emit as a normal NFC-e but with contingency reference
      body.sale_id = sale_id;
      body.company_id = company_id;
      body.config_id = configData.id;
      body.form = contForm;
      body.form.inf_adic = `NFC-e emitida em contingência offline. Nº contingência: ${contingency_number}. ${contForm.inf_adic || ""}`.trim();
      // Fall through to normal emit below
    }

    // ─── EMIT NF-e MODEL 55 ───
    if (action === "emit_nfe") {
      const { config_id: nfeConfigId, form: nfeForm } = body;
      let nfeCompanyId = body.company_id;

      if (!nfeConfigId || !nfeForm) {
        return jsonResponse({ error: "Dados incompletos para NF-e" }, 400);
      }

      // Resolve company
      let nfeCompany: any = null;
      if (nfeCompanyId) {
        const { data } = await supabase.from("companies").select("*").eq("id", nfeCompanyId).single();
        nfeCompany = data;
      }
      if (!nfeCompany) {
        const userId = await getAuthUserId();
        if (userId) {
          const resolvedId = await resolveCompanyFromUser(userId);
          if (resolvedId) {
            nfeCompanyId = resolvedId;
            const { data } = await supabase.from("companies").select("*").eq("id", resolvedId).single();
            nfeCompany = data;
          }
        }
      }
      if (!nfeCompany || !nfeCompanyId) {
        return jsonResponse({ error: "Empresa não encontrada." }, 404);
      }

      const { data: nfeConfig, error: nfeCfgErr } = await supabase
        .from("fiscal_configs")
        .select("*")
        .eq("id", nfeConfigId)
        .single();

      if (nfeCfgErr || !nfeConfig) {
        return jsonResponse({ error: "Configuração fiscal não encontrada" }, 404);
      }

      const nfeCrt = nfeForm.crt || nfeConfig.crt || 1;
      const nfeIsSimples = nfeCrt === 1 || nfeCrt === 2;
      const nfeDefaultCst = nfeIsSimples ? "102" : "00";
      const nfeUf = (nfeCompany.address_state || "SP").toUpperCase();

      const nfeFormItems = nfeForm.items || [];
      for (let i = 0; i < nfeFormItems.length; i++) {
        const it = nfeFormItems[i];
        if (!it.cst) {
          it.cst = nfeDefaultCst;
          it.origem = it.origem || "0";
        }
      }

      const nfeItems = nfeFormItems.map((item: any, idx: number) => {
        const icmsCalc = calculateIcmsForItem(item, nfeUf, nfeCrt);
        return {
          numero_item: idx + 1,
          codigo_produto: item.product_code || String(idx + 1).padStart(5, "0"),
          descricao: item.name,
          ncm: (item.ncm || "").replace(/\D/g, ""),
          cfop: item.cfop || "5102",
          unidade_comercial: item.unit || "UN",
          quantidade_comercial: item.qty || 1,
          valor_unitario_comercial: item.unit_price || 0,
          valor_bruto: (item.qty || 1) * (item.unit_price || 0),
          unidade_tributavel: item.unit || "UN",
          quantidade_tributavel: item.qty || 1,
          valor_unitario_tributavel: item.unit_price || 0,
          valor_desconto: item.discount || 0,
          imposto: {
            icms: icmsCalc,
            pis: { cst: item.pis_cst || "49" },
            cofins: { cst: item.cofins_cst || "49" },
          },
        };
      });

      const nfeTotalValue = nfeItems.reduce(
        (sum: number, it: any) => sum + it.valor_bruto - (it.valor_desconto || 0), 0
      );

      // Build destinatário
      const destDocClean = (nfeForm.dest_doc || "").replace(/\D/g, "");
      const destIsCompany = destDocClean.length > 11;
      const nfeDestinatario: any = {
        ...(destIsCompany ? { cnpj: destDocClean } : { cpf: destDocClean }),
        nome: nfeForm.dest_name || undefined,
        email: nfeForm.dest_email || undefined,
        indicador_inscricao_estadual:
          nfeForm.dest_ie && nfeForm.dest_ie.toLowerCase() !== "isento"
            ? 1   // Contribuinte ICMS (possui IE)
            : destIsCompany
              ? 2  // Contribuinte isento de IE (PJ sem IE)
              : 9, // Não contribuinte (Pessoa Física)
        inscricao_estadual: nfeForm.dest_ie && nfeForm.dest_ie.toLowerCase() !== "isento" ? nfeForm.dest_ie.replace(/\D/g, "") : undefined,
        endereco: {
          logradouro: nfeForm.dest_street || "",
          numero: nfeForm.dest_number || "S/N",
          complemento: nfeForm.dest_complement || "",
          bairro: nfeForm.dest_neighborhood || "",
          codigo_municipio: nfeForm.dest_city_code || "",
          nome_municipio: nfeForm.dest_city || "",
          uf: (nfeForm.dest_uf || "").toUpperCase(),
          cep: (nfeForm.dest_zip || "").replace(/\D/g, ""),
          codigo_pais: "1058",
          pais: "BRASIL",
        },
      };

      // Build transporte
      const nfeTransporte: any = {
        modalidade_frete: parseInt(nfeForm.frete || "9"),
      };
      if (nfeForm.frete !== "9" && nfeForm.transport_name) {
        const tDocClean = (nfeForm.transport_doc || "").replace(/\D/g, "");
        nfeTransporte.transportadora = {
          ...(tDocClean.length > 11 ? { cnpj: tDocClean } : tDocClean.length > 0 ? { cpf: tDocClean } : {}),
          nome: nfeForm.transport_name,
        };
        if (nfeForm.transport_plate) {
          nfeTransporte.veiculo = {
            placa: nfeForm.transport_plate,
            uf: nfeForm.transport_uf || nfeUf,
          };
        }
        if (nfeForm.volumes > 0 || nfeForm.gross_weight > 0) {
          nfeTransporte.volumes = [{
            quantidade: nfeForm.volumes || 1,
            peso_bruto: nfeForm.gross_weight || 0,
            peso_liquido: nfeForm.net_weight || 0,
          }];
        }
      }

      const paymentMethodMap: Record<string, string> = {
        "01": "01", "02": "02", "03": "03", "04": "04", "05": "05",
        "15": "15", "16": "16", "17": "17", "90": "90", "99": "99",
      };

      const nfePayload = {
        ambiente: nfeConfig.environment === "producao" ? "producao" : "homologacao",
        natureza_operacao: nfeForm.nat_op || "VENDA DE MERCADORIA",
        tipo_documento: 1, // Saída
        finalidade_emissao: parseInt(nfeForm.finalidade || "1"),
        consumidor_final: destIsCompany ? 0 : 1,
        presenca_comprador: 0, // Não se aplica (NF-e)
        notas_referenciadas: [],
        emitente: {
          cnpj: nfeCompany.cnpj?.replace(/\D/g, ""),
          nome: nfeCompany.name,
          nome_fantasia: nfeCompany.trade_name || nfeCompany.name,
          inscricao_estadual: nfeCompany.ie?.replace(/\D/g, "") || "",
          endereco: {
            logradouro: nfeCompany.address_street || "",
            numero: nfeCompany.address_number || "S/N",
            complemento: nfeCompany.address_complement || "",
            bairro: nfeCompany.address_neighborhood || "",
            codigo_municipio: nfeCompany.address_city_code || "",
            nome_municipio: nfeCompany.address_city || "",
            uf: nfeUf,
            cep: nfeCompany.address_zip?.replace(/\D/g, "") || "",
            codigo_pais: "1058",
            pais: "BRASIL",
          },
          crt: nfeCrt,
        },
        destinatario: nfeDestinatario,
        itens: nfeItems,
        pagamento: {
          formas_pagamento: [{
            tipo: paymentMethodMap[nfeForm.payment_method] || "99",
            valor: nfeForm.payment_value || nfeTotalValue,
          }],
        },
        transporte: nfeTransporte,
        informacoes_adicionais: {
          informacoes_contribuinte: nfeForm.inf_adic || undefined,
        },
      };

      const nfeToken = await getNuvemFiscalToken();

      console.log("[emit-nfe] Sending NF-e payload to Nuvem Fiscal");
      const nfeEmitResp = await fetch(`${NUVEM_FISCAL_API}/nfe`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${nfeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nfePayload),
      });

      const nfeEmitData = await nfeEmitResp.json();

      if (!nfeEmitResp.ok) {
        console.error("NF-e Nuvem Fiscal error:", JSON.stringify(nfeEmitData));
        const rejCode = nfeEmitData?.codigo_status || nfeEmitData?.cStat || null;
        const rejMsg = nfeEmitData?.motivo_status || nfeEmitData?.xMotivo || null;
        return jsonResponse({
          success: false,
          error: nfeEmitData?.mensagem || nfeEmitData?.message || `Erro Nuvem Fiscal [${nfeEmitResp.status}]`,
          rejection_code: rejCode ? String(rejCode) : null,
          rejection_reason: rejMsg || null,
          details: nfeEmitData,
        });
      }

      const nfeAuth = normalizeFiscalAuthorization(nfeEmitData);
      const nfeAccessKey = nfeAuth.accessKey;
      const nfeDocNumber = nfeEmitData.numero || nfeConfig.next_number || null;
      const nfeStatus = nfeAuth.status;

      await supabase.from("fiscal_documents").insert({
        company_id: nfeCompanyId,
        doc_type: "nfe",
        number: nfeDocNumber,
        serie: nfeConfig.serie,
        access_key: nfeAccessKey,
        status: nfeStatus,
        total_value: nfeTotalValue,
        customer_name: nfeForm.dest_name || null,
        customer_cpf_cnpj: destDocClean || null,
        payment_method: nfeForm.payment_method,
        environment: nfeConfig.environment,
        is_contingency: false,
      });

      await backupXml(supabase, nfeCompanyId, "nfe", nfeAccessKey, nfeDocNumber, nfeEmitData.xml || null, "emissao");

      await supabase
        .from("fiscal_configs")
        .update({ next_number: (nfeConfig.next_number || 1) + 1 })
        .eq("id", nfeConfigId);

      return jsonResponse({
        success: true,
        access_key: nfeAccessKey,
        number: nfeDocNumber,
        status: nfeStatus,
        sefaz_code: nfeAuth.sefazCode,
        protocol_number: nfeAuth.protocolNumber,
        nuvem_fiscal_id: nfeEmitData.id,
      });
    }

    // ─── EMIT NFC-e (default) ───
    const { sale_id, form } = body;
    let company_id = body.company_id;
    let config_id = body.config_id;

    if (!sale_id || !form) {
      return jsonResponse({ error: "Dados incompletos (sale_id e form são obrigatórios)" }, 400);
    }

    // If config_id not provided, resolve it server-side
    if (!config_id) {
      console.log("[emit-nfce] config_id not provided, resolving server-side...");
      const resolvedCompanyId = company_id || body.company_id;
      if (resolvedCompanyId) {
        const { data: allConfigs } = await supabase
          .from("fiscal_configs")
          .select("*")
          .eq("company_id", resolvedCompanyId);
        const picked = allConfigs?.find((c: any) => c.doc_type === "nfce" && c.is_active)
          || allConfigs?.find((c: any) => c.doc_type === "nfe" && c.is_active)
          || allConfigs?.find((c: any) => c.doc_type === "nfce")
          || allConfigs?.[0];
        if (picked) {
          config_id = picked.id;
          console.log(`[emit-nfce] Resolved config_id server-side: ${config_id}`);
        }
      }
      if (!config_id) {
        return jsonResponse({ error: "Nenhuma configuração fiscal encontrada para esta empresa. Configure em Fiscal > Configurações." }, 400);
      }
    }

    // ── Resolve company + debug logging ──
    let company: any = null;
    console.log(`[emit-nfce] Received company_id from body: ${company_id}`);

    // Strategy 1: Use provided company_id
    if (company_id) {
      const { data, error: compErr } = await supabase
        .from("companies")
        .select("*")
        .eq("id", company_id)
        .single();
      company = data;
      if (!data) console.warn(`[emit-nfce] company_id ${company_id} not found. Error: ${compErr?.message}`);
    }

    // Strategy 2: Resolve via authenticated user → employees/company_users → companies
    if (!company) {
      const userId = await getAuthUserId();
      console.log(`[emit-nfce] Auth user_id: ${userId}`);
      if (userId) {
        const resolvedId = await resolveCompanyFromUser(userId);
        if (resolvedId) {
          company_id = resolvedId;
          const { data } = await supabase
            .from("companies")
            .select("*")
            .eq("id", resolvedId)
            .single();
          company = data;
        }
      }
    }

    if (!company || !company_id) {
      return jsonResponse({
        error: "Empresa não encontrada. Verifique se o usuário está vinculado nas tabelas employees ou company_users.",
        debug_company_id_received: body.company_id || null,
      }, 404);
    }

    console.log(`[emit-nfce] Using company: ${company_id} (${company.name})`);

    // ── Auto-register company in Nuvem Fiscal if not yet registered ──
    const cnpjClean = (company.cnpj || "").replace(/\D/g, "");
    if (cnpjClean.length >= 11) {
      try {
        const regToken = await getNuvemFiscalToken();
        const checkBefore = await checkCompanyOnNuvemFiscal(regToken, cnpjClean);
        let alreadyRegistered = checkBefore.exists;

        if (!alreadyRegistered && checkBefore.status && checkBefore.status !== 404) {
          console.error(`[emit-nfce] Failed to verify company ${cnpjClean} before registration [${checkBefore.status}]:`, checkBefore.details);
          return jsonResponse({
            success: false,
            error: `Não foi possível verificar a empresa na Nuvem Fiscal [${checkBefore.status}]. Verifique se as credenciais do projeto pertencem à mesma conta do painel e se a API tem permissão para consultar/cadastrar empresas.`,
            details: checkBefore.details,
          }, 400);
        }

        console.log(`[emit-nfce] Company lookup for ${cnpjClean}: found=${alreadyRegistered}`);

        if (!alreadyRegistered) {
          console.log(`[emit-nfce] CNPJ ${cnpjClean} not registered in Nuvem Fiscal. Auto-registering...`);

          // Resolve codigo_municipio via ViaCEP if missing
          let regCodigoMunicipio = company.address_city_code || company.city_ibge_code || "";
          const regCep = (company.address_zip || "").replace(/\D/g, "");
          if (!regCodigoMunicipio && regCep.length === 8) {
            try {
              const viaCepResp = await fetch(`https://viacep.com.br/ws/${regCep}/json/`);
              if (viaCepResp.ok) {
                const viaCepData = await viaCepResp.json();
                if (viaCepData.ibge) {
                  regCodigoMunicipio = viaCepData.ibge;
                  console.log(`[emit-nfce] Resolved IBGE code from CEP ${regCep}: ${regCodigoMunicipio}`);
                  await supabase.from("companies").update({ address_city_code: regCodigoMunicipio } as any).eq("id", company_id || body.company_id);
                }
              }
            } catch (e) {
              console.warn("[emit-nfce] ViaCEP lookup for registration failed:", e);
            }
          }

          // Fallback: lookup IBGE by city name + state via IBGE API
          if (!regCodigoMunicipio && company.address_city && company.address_state) {
            try {
              const uf = (company.address_state || "").toUpperCase();
              const ibgeResp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
              if (ibgeResp.ok) {
                const municipios = await ibgeResp.json();
                const cityNorm = (company.address_city || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                const found = municipios.find((m: any) => {
                  const mNorm = (m.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                  return mNorm === cityNorm;
                });
                if (found) {
                  regCodigoMunicipio = String(found.id);
                  console.log(`[emit-nfce] Resolved IBGE code from city name "${company.address_city}/${uf}": ${regCodigoMunicipio}`);
                  await supabase.from("companies").update({ address_city_code: regCodigoMunicipio } as any).eq("id", company_id || body.company_id);
                }
              }
            } catch (e) {
              console.warn("[emit-nfce] IBGE city lookup failed:", e);
            }
          }

          if (!regCodigoMunicipio) {
            return jsonResponse({
              success: false,
              error: "Código IBGE do município não encontrado. Cadastre o CEP da empresa em Configurações > Empresa antes de emitir.",
            }, 400);
          }

          const regBody: Record<string, any> = {
            cpf_cnpj: cnpjClean,
            nome_razao_social: sanitizeFiscalText(company.razao_social || company.name || "Empresa", "Empresa"),
            nome_fantasia: sanitizeFiscalText(company.trade_name || company.nome_fantasia || company.name || "Empresa", "Empresa"),
            inscricao_estadual: (company.ie || "").replace(/\D/g, "") || "ISENTO",
            email: sanitizeFiscalText(company.email || ""),
            fone: (company.phone || "").replace(/\D/g, "") || "",
            endereco: {
              logradouro: sanitizeFiscalText(company.address_street || "", "SEM LOGRADOURO"),
              numero: sanitizeFiscalText(company.address_number || "S/N", "S/N"),
              bairro: sanitizeFiscalText(company.address_neighborhood || "", "CENTRO"),
              codigo_municipio: regCodigoMunicipio,
              cidade: sanitizeFiscalText(company.address_city || "", "CIDADE"),
              uf: (company.address_state || "SP").toUpperCase(),
              codigo_pais: "1058",
              pais: "Brasil",
              cep: regCep,
            },
          };

          if (company.address_complement) {
            regBody.endereco.complemento = sanitizeFiscalText(company.address_complement);
          }

          const regResp = await fetch(`${NUVEM_FISCAL_API}/empresas`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${regToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(regBody),
          });

          const regText = await regResp.text();
          if (!regResp.ok && regResp.status !== 409) {
            console.error(`[emit-nfce] Failed to register company in Nuvem Fiscal [${regResp.status}]: ${regText}`);
            return jsonResponse({
              success: false,
              error: `Falha ao cadastrar empresa na Nuvem Fiscal [${regResp.status}]: ${regText}`,
            }, 400);
          }

          console.log(`[emit-nfce] Company ${cnpjClean} registration response [${regResp.status}]: ${regText}`);

          const checkAfter = await checkCompanyOnNuvemFiscal(regToken, cnpjClean);
          alreadyRegistered = checkAfter.exists;
          if (!alreadyRegistered) {
            console.error(`[emit-nfce] Company ${cnpjClean} still not visible after registration [${checkAfter.status}]:`, checkAfter.details);
            return jsonResponse({
              success: false,
              error: "A empresa não apareceu na conta da Nuvem Fiscal após o cadastro. Verifique se as credenciais salvas no projeto pertencem à mesma conta exibida no painel e se essa conta possui permissão de cadastro via API.",
              details: checkAfter.details,
            }, 400);
          }
        }
      } catch (regError: any) {
        console.error("[emit-nfce] Auto-registration FAILED:", regError?.message || regError);
        return jsonResponse({
          success: false,
          error: `Falha ao registrar empresa na Nuvem Fiscal: ${regError?.message || "Erro desconhecido"}. Verifique se as credenciais do Sandbox estão corretas.`,
        }, 400);
      }
    }

    let config: any = null;

    if (config_id) {
      const { data } = await supabase
        .from("fiscal_configs")
        .select("*")
        .eq("id", config_id)
        .maybeSingle();
      config = data;
    }

    if (!config) {
      const { data: configs, error: cfgErr } = await supabase
        .from("fiscal_configs")
        .select("*")
        .eq("company_id", company_id);

      if (cfgErr) {
        return jsonResponse({ error: `Erro ao buscar configuração fiscal: ${cfgErr.message}` }, 500);
      }

      config = configs?.find((c: any) => c.doc_type === "nfce" && c.is_active)
        || configs?.find((c: any) => c.doc_type === "nfe" && c.is_active)
        || configs?.find((c: any) => c.doc_type === "nfce")
        || configs?.find((c: any) => c.doc_type === "nfe")
        || configs?.[0]
        || null;
    }

    if (!config) {
      return jsonResponse({
        error: "Configuração fiscal não encontrada",
        debug_company_id: company_id,
        debug_requested_config_id: config_id || null,
      }, 404);
    }

    // ── Auto-upload certificate to Nuvem Fiscal using request payload fallback first ──
    const requestCertBase64 = body.certificate_base64 || null;
    const requestCertPassword = body.certificate_password || null;
    const configCertBase64 = config.certificate_base64 || null;
    const configCertPassword = config.certificate_password_hash || null;
    const effectiveCertBase64 = requestCertBase64 || configCertBase64;
    const effectiveCertPassword = requestCertPassword || configCertPassword;
    const hasCertData = !!effectiveCertBase64;
    const hasCertPwd = !!effectiveCertPassword;
    console.log(`[emit-nfce] Certificate check: has_base64=${hasCertData}, has_password=${hasCertPwd}, config_id=${config.id}, source=${requestCertBase64 ? "request" : configCertBase64 ? "config" : "none"}`);

    if (hasCertData && hasCertPwd) {
      try {
        console.log("[emit-nfce] Uploading certificate to Nuvem Fiscal...");
        const autoToken = await getNuvemFiscalToken();
        const autoCnpj = company.cnpj.replace(/\D/g, "");
        const autoResult = await uploadCertToNuvemFiscal(autoToken, autoCnpj, effectiveCertBase64, effectiveCertPassword);
        if (autoResult.ok) {
          console.log("[emit-nfce] Certificate uploaded successfully to Nuvem Fiscal");
        } else {
          return jsonResponse({
            success: false,
            error: autoResult.error || "Falha ao sincronizar certificado digital antes da emissão",
            _cert_diag: {
              has_base64: true,
              has_password: true,
              config_id: config.id,
              cert_source: requestCertBase64 ? "request" : "config",
            },
          }, 400);
        }
      } catch (autoErr: any) {
        return jsonResponse({
          success: false,
          error: autoErr?.message || "Erro ao sincronizar certificado digital antes da emissão",
          _cert_diag: {
            has_base64: true,
            has_password: true,
            config_id: config.id,
            cert_source: requestCertBase64 ? "request" : "config",
          },
        }, 400);
      }
    } else {
      console.warn(`[emit-nfce] No certificate data available for upload.`);
    }

    // ── Auto-configure NFC-e settings on Nuvem Fiscal (CSC, ambiente, CRT) ──
    {
      try {
        const nfceConfigToken = await getNuvemFiscalToken();
        const nfceCnpj = (company.cnpj || "").replace(/\D/g, "");
        const nfceConfigResult = await ensureNfceConfigOnNuvemFiscal(nfceConfigToken, nfceCnpj, {
          environment: config.environment || "homologacao",
          crt: form.crt || config.crt || 1,
          csc_id: config.csc_id || undefined,
          csc_token: config.csc_token || undefined,
        });
        if (!nfceConfigResult.ok) {
          console.warn(`[emit-nfce] NFC-e config warning: ${nfceConfigResult.error}`);
        }
      } catch (nfceConfigErr: any) {
        console.warn("[emit-nfce] NFC-e auto-config error (non-blocking):", nfceConfigErr.message);
      }
    }

    // ── Validate items before building payload ──
    const formItems = form.items || [];
    const crt = form.crt || config.crt || 1;
    const isSimples = crt === 1 || crt === 2;
    const defaultCst = isSimples ? "102" : "00";

    for (let i = 0; i < formItems.length; i++) {
      const it = formItems[i];
      let ncmClean = (it.ncm || "").replace(/\D/g, "");
      if (!ncmClean || ncmClean.length < 2) {
        // 🔴 CRÍTICO: Bloquear emissão sem NCM válido — NCM genérico gera Rejeição 778
        return jsonResponse({
          error: `Item ${i + 1} ("${it.name || ""}"): NCM não informado ou inválido. Cadastre o NCM correto do produto antes de emitir.`,
        }, 400);
      }
      if (ncmClean === "00000000" || ncmClean === "0") {
        return jsonResponse({
          error: `Item ${i + 1} ("${it.name || ""}"): NCM "00000000" é genérico e será rejeitado pela SEFAZ. Informe o NCM correto.`,
        }, 400);
      }
      it.ncm = ncmClean;
      if (!it.cfop || it.cfop.length !== 4) {
        return jsonResponse({ error: `Item ${i + 1} ("${it.name || ""}"): CFOP inválido ou não informado.` }, 400);
      }
      // Auto-fill CST/CSOSN if missing, based on CRT
      if (!it.cst) {
        it.cst = defaultCst;
        it.origem = it.origem || "0";
        console.log(`[emit-nfce] Item ${i + 1}: CST/CSOSN ausente, aplicando padrão "${defaultCst}" (CRT=${crt})`);
      }
    }

    // crt already declared above
    const uf = (company.address_state || "SP").toUpperCase();

    // UF code for IBGE
    const UF_CODES: Record<string, number> = {
      AC:12,AL:27,AM:13,AP:16,BA:29,CE:23,DF:53,ES:32,GO:52,MA:21,MG:31,MS:50,MT:51,
      PA:15,PB:25,PE:26,PI:22,PR:41,RJ:33,RN:24,RO:11,RR:14,RS:43,SC:42,SE:28,SP:35,TO:17,
    };
    const cUF = UF_CODES[uf] || 35;

    // Resolve codigo_municipio (IBGE) if missing — use ViaCEP + IBGE API as fallback
    let codigoMunicipio = company.address_city_code || company.city_ibge_code || "";
    const cepClean = company.address_zip?.replace(/\D/g, "") || "";
    if (!codigoMunicipio && cepClean.length === 8) {
      try {
        const viaCepResp = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
        if (viaCepResp.ok) {
          const viaCepData = await viaCepResp.json();
          if (viaCepData.ibge) {
            codigoMunicipio = viaCepData.ibge;
            console.log(`[emit-nfce] Resolved IBGE code from CEP ${cepClean}: ${codigoMunicipio}`);
            await supabase.from("companies").update({ address_city_code: codigoMunicipio } as any).eq("id", company_id);
          }
        }
      } catch (e) {
        console.warn("[emit-nfce] ViaCEP lookup failed:", e);
      }
    }

    // Fallback: lookup IBGE by city name + state via IBGE API
    if (!codigoMunicipio && company.address_city && company.address_state) {
      try {
        const ibgeUf = (company.address_state || "").toUpperCase();
        const ibgeResp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ibgeUf}/municipios`);
        if (ibgeResp.ok) {
          const municipios = await ibgeResp.json();
          const cityNorm = (company.address_city || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          const found = municipios.find((m: any) => {
            const mNorm = (m.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            return mNorm === cityNorm;
          });
          if (found) {
            codigoMunicipio = String(found.id);
            console.log(`[emit-nfce] Resolved IBGE code from city name "${company.address_city}/${ibgeUf}": ${codigoMunicipio}`);
            await supabase.from("companies").update({ address_city_code: codigoMunicipio } as any).eq("id", company_id);
          }
        }
      } catch (e) {
        console.warn("[emit-nfce] IBGE city lookup failed:", e);
      }
    }

    if (!codigoMunicipio) {
      return jsonResponse({ error: "Código IBGE do município não encontrado. Cadastre o CEP ou a Cidade/UF da empresa em Configurações." }, 400);
    }

    // Build items in XML-like format (infNFe schema) required by Nuvem Fiscal API
    const nfceItems = formItems.map((item: any, idx: number) => {
      const vProd = Math.round((item.qty || 1) * (item.unit_price || 0) * 100) / 100;
      const vDesc = item.discount || 0;
      const cstCsosn = item.cst || defaultCst;
      const origem = Number(item.origem || 0);

      // Build ICMS object in NfeSefaz format
      const icmsObj: Record<string, any> = {};
      if (isSimples) {
        // Simples Nacional CSOSNs
        if (["101", "102", "103", "300", "400"].includes(cstCsosn)) {
          icmsObj[`ICMSSN${cstCsosn}`] = { orig: origem, CSOSN: cstCsosn };
        } else if (cstCsosn === "500") {
          // 🟠 CSOSN 500: ICMS cobrado anteriormente por ST — sem cálculo, mas com vBCSTRet
          icmsObj.ICMSSN500 = { orig: origem, CSOSN: "500" };
        } else if (["201", "202", "203"].includes(cstCsosn)) {
          // 🟠 CORREÇÃO #6/#7: CSOSN ST com cálculo de ICMS-ST e FCP-ST
          const stCalc = calculateIcmsStForItem(item, uf, crt, vProd, vDesc);
          const fcpSt = computeFcp(stCalc?.vBCST || 0, uf, item.fcp_aliquota);
          icmsObj[`ICMSSN${cstCsosn}`] = {
            orig: origem, CSOSN: cstCsosn,
            ...(stCalc ? {
              modBCST: 4, // MVA
              pMVAST: stCalc.pMVAST,
              vBCST: stCalc.vBCST,
              pICMSST: stCalc.pICMSST,
              vICMSST: stCalc.vICMSST,
            } : {}),
            ...(fcpSt ? {
              vBCFCPST: fcpSt.valor_base_calculo_fcp,
              pFCPST: fcpSt.percentual_fcp,
              vFCPST: fcpSt.valor_fcp,
            } : {}),
          };
        } else if (cstCsosn === "900") {
          const icmsRate = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
          icmsObj.ICMSSN900 = {
            orig: origem, CSOSN: "900", modBC: 3,
            vBC: Math.round((vProd - vDesc) * 100) / 100,
            pICMS: icmsRate,
            vICMS: Math.round((vProd - vDesc) * (icmsRate / 100) * 100) / 100,
          };
        } else {
          icmsObj.ICMSSN102 = { orig: origem, CSOSN: "102" };
        }
      } else {
        // Regime Normal
        if (["40", "41", "50"].includes(cstCsosn)) {
          icmsObj[`ICMS${cstCsosn}`] = { orig: origem, CST: cstCsosn };
        } else if (cstCsosn === "60") {
          // CST 60: ICMS cobrado anteriormente por ST
          icmsObj.ICMS60 = { orig: origem, CST: "60" };
        } else if (["10", "30", "70"].includes(cstCsosn)) {
          // 🟠 CST com ST: calcular ICMS-ST
          const icmsRate = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
          const baseCalc = Math.round((vProd - vDesc) * 100) / 100;
          const stCalc = calculateIcmsStForItem(item, uf, crt, vProd, vDesc);
          const fcpOwn = computeFcp(baseCalc, uf, item.fcp_aliquota);
          const fcpSt = stCalc ? computeFcp(stCalc.vBCST, uf, item.fcp_aliquota) : null;
          icmsObj[`ICMS${cstCsosn}`] = {
            orig: origem, CST: cstCsosn, modBC: 3,
            vBC: baseCalc, pICMS: icmsRate,
            vICMS: Math.round(baseCalc * (icmsRate / 100) * 100) / 100,
            ...(stCalc ? {
              modBCST: 4,
              pMVAST: stCalc.pMVAST,
              vBCST: stCalc.vBCST,
              pICMSST: stCalc.pICMSST,
              vICMSST: stCalc.vICMSST,
            } : {}),
            ...(fcpOwn ? { vBCFCP: fcpOwn.valor_base_calculo_fcp, pFCP: fcpOwn.percentual_fcp, vFCP: fcpOwn.valor_fcp } : {}),
            ...(fcpSt ? { vBCFCPST: fcpSt.valor_base_calculo_fcp, pFCPST: fcpSt.percentual_fcp, vFCPST: fcpSt.valor_fcp } : {}),
          };
        } else {
          const icmsRate = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
          const baseCalc = Math.round((vProd - vDesc) * 100) / 100;
          const fcpOwn = computeFcp(baseCalc, uf, item.fcp_aliquota);
          icmsObj[`ICMS${cstCsosn || "00"}`] = {
            orig: origem, CST: cstCsosn || "00", modBC: 3,
            vBC: baseCalc, pICMS: icmsRate,
            vICMS: Math.round(baseCalc * (icmsRate / 100) * 100) / 100,
            ...(fcpOwn ? { vBCFCP: fcpOwn.valor_base_calculo_fcp, pFCP: fcpOwn.percentual_fcp, vFCP: fcpOwn.valor_fcp } : {}),
          };
        }
      }

      return {
        nItem: idx + 1,
        prod: {
          cProd: item.product_code || item.product_id || String(idx + 1).padStart(5, "0"),
          cEAN: "SEM GTIN",
          xProd: item.name || "PRODUTO",
          NCM: (item.ncm || "").replace(/\D/g, ""),
          CFOP: Number(item.cfop) || 5102,
          uCom: item.unit || "UN",
          qCom: item.qty || 1,
          vUnCom: item.unit_price || 0,
          vProd: vProd,
          cEANTrib: "SEM GTIN",
          uTrib: item.unit || "UN",
          qTrib: item.qty || 1,
          vUnTrib: item.unit_price || 0,
          ...(vDesc > 0 ? { vDesc } : {}),
          indTot: 1,
        },
        imposto: {
          ICMS: icmsObj,
          PIS: buildPisCofinsPayload("pis", item.pis_cst, crt, vProd - vDesc),
          COFINS: buildPisCofinsPayload("cofins", item.cofins_cst, crt, vProd - vDesc),
        },
      };
    });

    const totalProd = Math.round(nfceItems.reduce((s: number, it: any) => s + (it.prod.vProd || 0), 0) * 100) / 100;
    const totalDesc = Math.round(nfceItems.reduce((s: number, it: any) => s + (it.prod.vDesc || 0), 0) * 100) / 100;
    const totalNF = Math.round((totalProd - totalDesc) * 100) / 100;

    const paymentMethodMap: Record<string, string> = {
      "01": "01", "02": "02", "03": "03", "04": "04", "05": "05",
      "10": "10", "11": "11", "13": "13", "15": "15", "16": "16", "17": "17", "99": "99",
    };
    const tPag = paymentMethodMap[form.payment_method] || "99";
    const nextNumber = config.next_number || 1;
    const serie = config.serie || 1;
    const dhEmi = new Date().toISOString().replace("Z", "-03:00");

    // Consumer doc
    const consumerDocClean = form.customer_doc ? form.customer_doc.replace(/\D/g, "") : "";

    const nfcePayload: Record<string, any> = {
      ambiente: config.environment === "producao" ? "producao" : "homologacao",
      infNFe: {
        versao: "4.00",
        ide: {
          cUF: cUF,
          natOp: form.nat_op || "VENDA DE MERCADORIA",
          mod: 65,
          serie: Number(serie),
          nNF: nextNumber,
          dhEmi: dhEmi,
          tpNF: 1,
          idDest: 1,
          cMunFG: codigoMunicipio,
          tpImp: 4,
          tpEmis: 1,
          finNFe: 1,
          indFinal: 1,
          indPres: 1,
          procEmi: 0,
          verProc: "AnthosSystem 1.0",
        },
        emit: {
          CNPJ: company.cnpj?.replace(/\D/g, "") || "",
          xNome: (company.razao_social || company.name || "EMPRESA").trim().replace(/\s+/g, " "),
          xFant: (company.trade_name || company.nome_fantasia || company.name || "EMPRESA").trim().replace(/\s+/g, " "),
          IE: company.ie?.replace(/\D/g, "") || "",
          CRT: crt,
          enderEmit: {
            xLgr: company.address_street || "",
            nro: company.address_number || "S/N",
            ...(company.address_complement ? { xCpl: company.address_complement } : {}),
            xBairro: company.address_neighborhood || "",
            cMun: codigoMunicipio,
            xMun: company.address_city || "",
            UF: uf,
            CEP: cepClean,
            cPais: "1058",
            xPais: "BRASIL",
          },
        },
        ...(consumerDocClean ? {
          dest: {
            ...(consumerDocClean.length <= 11 ? { CPF: consumerDocClean } : { CNPJ: consumerDocClean }),
            ...(form.customer_name ? { xNome: form.customer_name } : {}),
            indIEDest: 9,
          },
        } : {}),
        det: nfceItems,
        total: (() => {
          // 🟠 Calcular totais de ICMS, ST, FCP e PIS/COFINS dinamicamente dos itens
          let totVBC = 0, totVICMS = 0, totVBCST = 0, totVST = 0;
          let totVFCP = 0, totVFCPST = 0, totVPIS = 0, totVCOFINS = 0;
          nfceItems.forEach((it: any) => {
            const icms = it.imposto?.ICMS || {};
            const icmsData = Object.values(icms)[0] as any || {};
            totVBC += icmsData.vBC || 0;
            totVICMS += icmsData.vICMS || 0;
            totVBCST += icmsData.vBCST || 0;
            totVST += icmsData.vICMSST || 0;
            totVFCP += icmsData.vFCP || 0;
            totVFCPST += icmsData.vFCPST || 0;
            const pis = it.imposto?.PIS || {};
            const pisData = Object.values(pis)[0] as any || {};
            totVPIS += pisData.vPIS || 0;
            const cofins = it.imposto?.COFINS || {};
            const cofinsData = Object.values(cofins)[0] as any || {};
            totVCOFINS += cofinsData.vCOFINS || 0;
          });
          return {
            ICMSTot: {
              vBC: Math.round(totVBC * 100) / 100,
              vICMS: Math.round(totVICMS * 100) / 100,
              vICMSDeson: 0,
              vFCP: Math.round(totVFCP * 100) / 100,
              vBCST: Math.round(totVBCST * 100) / 100,
              vST: Math.round(totVST * 100) / 100,
              vFCPST: Math.round(totVFCPST * 100) / 100,
              vFCPSTRet: 0,
              vProd: totalProd, vFrete: 0, vSeg: 0, vDesc: totalDesc,
              vII: 0, vIPI: 0, vIPIDevol: 0,
              vPIS: Math.round(totVPIS * 100) / 100,
              vCOFINS: Math.round(totVCOFINS * 100) / 100,
              vOutro: 0,
              vNF: totalNF,
            },
          };
        })(),
        transp: { modFrete: 9 },
        pag: {
          detPag: [{ tPag: tPag, vPag: form.payment_value || totalNF }],
          vTroco: form.change || 0,
        },
        ...(form.inf_adic ? { infAdic: { infCpl: form.inf_adic } } : {}),
      },
    };

    const token = await getNuvemFiscalToken();

    const emitResp = await fetch(`${NUVEM_FISCAL_API}/nfce`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(nfcePayload),
    });

    const emitData = await emitResp.json();

    if (!emitResp.ok) {
      console.error("Nuvem Fiscal error:", JSON.stringify(emitData));

      // ── Auto-retry: if certificate not found, try uploading it and retry once ──
      const errText = JSON.stringify(emitData).toLowerCase();
      const isCertError = errText.includes("certificado") && (errText.includes("não encontrado") || errText.includes("not found") || errText.includes("nao encontrado"));
      if (isCertError && effectiveCertBase64 && effectiveCertPassword) {
        console.log("[emit-nfce] Certificate not found on Nuvem Fiscal. Attempting auto-upload and retry...");
        try {
          const retryToken = await getNuvemFiscalToken();
          const retryCnpj = (company.cnpj || "").replace(/\D/g, "");
          const certUpResult = await uploadCertToNuvemFiscal(retryToken, retryCnpj, effectiveCertBase64, effectiveCertPassword);
          if (certUpResult.ok) {
            console.log("[emit-nfce] Certificate uploaded. Retrying emission...");
            const retryResp = await fetch(`${NUVEM_FISCAL_API}/nfce`, {
              method: "POST",
              headers: { Authorization: `Bearer ${retryToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(nfcePayload),
            });
            const retryData = await retryResp.json();
            if (retryResp.ok) {
              const retryAuth = normalizeFiscalAuthorization(retryData);
              const retryAccessKey = retryAuth.accessKey;
              const retryDocNumber = retryData.numero || config.next_number || null;
              const retryStatus = retryAuth.status;

              try {
                await persistFiscalEmissionResult({
                  supabase,
                  company_id,
                  sale_id,
                  config,
                  status: retryStatus,
                  accessKey: retryAccessKey,
                  docNumber: retryDocNumber,
                  totalNF,
                  form,
                  xmlContent: retryData.xml || null,
                  nuvemFiscalId: retryData.id || null,
                  protocolNumber: retryAuth.protocolNumber,
                });
              } catch (persistErr: any) {
                console.error("[emit-nfce] Retry emission persisted remotely but failed locally:", persistErr);
                return jsonResponse({
                  success: false,
                  error: persistErr?.message || "Falha ao persistir documento fiscal após retry",
                  details: { stage: "persist_local_state_retry", provider_status: retryStatus },
                }, 500);
              }

              await backupXml(supabase, company_id, "nfce", retryAccessKey, retryDocNumber, retryData.xml || null, "emissao");
              return jsonResponse({ success: true, status: retryStatus, access_key: retryAccessKey, number: retryDocNumber, sefaz_code: retryAuth.sefazCode, protocol_number: retryAuth.protocolNumber, data: retryData });
            }
            console.warn("[emit-nfce] Retry after cert upload also failed:", JSON.stringify(retryData));
          } else {
            console.warn(`[emit-nfce] Auto cert upload failed: ${certUpResult.error}`);
          }
        } catch (retryErr: any) {
          console.warn("[emit-nfce] Cert auto-upload retry error:", retryErr.message);
        }
      }

      const rejCode = emitData?.codigo_status || emitData?.cStat || emitData?.status_sefaz?.cStat || null;
      const rejMsg = emitData?.motivo_status || emitData?.xMotivo || emitData?.status_sefaz?.xMotivo || null;
      const apiMsg = emitData?.mensagem || emitData?.message || emitData?.error?.message || "";
      const validationErrors = emitData?.error?.errors || emitData?.errors || [];
      const validationDetail = Array.isArray(validationErrors) ? validationErrors.map((e: any) => e?.mensagem || e?.message || JSON.stringify(e)).join("; ") : "";
      const fullError = [apiMsg, rejMsg, validationDetail].filter(Boolean).join(" | ") || `Erro Nuvem Fiscal [${emitResp.status}]`;
      
      return jsonResponse({
        success: false,
        error: fullError,
        rejection_code: rejCode ? String(rejCode) : null,
        rejection_reason: rejMsg || null,
        details: emitData,
        _cert_diag: {
          has_base64: !!effectiveCertBase64,
          base64_length: effectiveCertBase64?.length || 0,
          has_password: !!effectiveCertPassword,
          config_id: config.id,
          cert_source: requestCertBase64 ? "request" : configCertBase64 ? "config" : "none",
        },
      });
    }

    const normalizedAuth = normalizeFiscalAuthorization(emitData);
    const accessKey = normalizedAuth.accessKey;
    const docNumber = emitData.numero || emitData.number || config.next_number || null;
    let finalAuth = normalizedAuth;
    let finalStatus = normalizedAuth.status;
    let finalDocNumber = docNumber;
    let finalNuvemFiscalId = emitData.id || null;

    console.log("[emit-nfce] Raw status:", JSON.stringify({
      rawStatus: normalizedAuth.rawStatus,
      sefazCode: normalizedAuth.sefazCode,
      accessKey: !!accessKey,
      protocolNumber: !!normalizedAuth.protocolNumber,
      isAuthorized: normalizedAuth.isAuthorized,
      finalStatus: normalizedAuth.status,
    }));

    if (accessKey && normalizedAuth.status === "pendente") {
      try {
        const consultResp = await fetch(`${NUVEM_FISCAL_API}/nfce?chave=${accessKey}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const consultText = await consultResp.text();
        let consultData: any = null;
        try {
          consultData = consultText ? JSON.parse(consultText) : null;
        } catch {
          consultData = { raw: consultText };
        }

        if (consultResp.ok) {
          const consultedDoc = consultData?.data?.[0] || consultData?.items?.[0] || consultData?.value?.[0] || consultData;
          const consultedAuth = normalizeFiscalAuthorization(consultedDoc || consultData);
          finalAuth = consultedAuth;
          finalStatus = consultedAuth.status;
          finalDocNumber = consultedDoc?.numero || consultedDoc?.number || finalDocNumber;
          finalNuvemFiscalId = consultedDoc?.id || finalNuvemFiscalId;
          console.log("[emit-nfce] Consulted status after emit:", JSON.stringify({
            rawStatus: consultedAuth.rawStatus,
            sefazCode: consultedAuth.sefazCode,
            protocolNumber: !!consultedAuth.protocolNumber,
            finalStatus,
          }));
        }
      } catch (consultErr: any) {
        console.warn("[emit-nfce] Immediate consult after emit failed:", consultErr?.message || consultErr);
      }
    }

    try {
      await persistFiscalEmissionResult({
        supabase,
        company_id,
        sale_id,
        config,
        status: finalStatus,
        accessKey: finalAuth.accessKey || accessKey,
        docNumber: finalDocNumber,
        totalNF,
        form,
        xmlContent: emitData.xml || null,
        nuvemFiscalId: finalNuvemFiscalId,
        protocolNumber: finalAuth.protocolNumber,
      });
    } catch (persistErr: any) {
      console.error("[emit-nfce] Emission persisted remotely but failed locally:", persistErr);
      return jsonResponse({
        success: false,
        error: persistErr?.message || "Falha ao persistir documento fiscal no banco",
        details: { stage: "persist_local_state", provider_status: finalStatus },
      }, 500);
    }

    // ── Auto-backup XML to Storage ──
    await backupXml(supabase, company_id, "nfce", finalAuth.accessKey || accessKey, finalDocNumber, emitData.xml || null, "emissao");

    return jsonResponse({
      success: true,
      access_key: finalAuth.accessKey || accessKey,
      number: finalDocNumber,
      status: finalStatus,
      sefaz_code: finalAuth.sefazCode,
      protocol_number: finalAuth.protocolNumber,
      nuvem_fiscal_id: finalNuvemFiscalId,
    });
  } catch (err: unknown) {
    console.error("emit-nfce error:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
