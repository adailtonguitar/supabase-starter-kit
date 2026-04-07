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
  classifyAndNormalizePayment,
  normalizePaymentsForNfce,
  normalizePaymentsFromSaleData,
  parseSalePaymentsJson,
  validateDetPagForEmission,
} from "../_shared/sale-payments.ts";
import { getFiscalReadiness, getFiscalReadinessBlockReason, getFiscalReadinessPrimaryIssueCode } from "../_shared/fiscal-readiness.ts";
import {
  fillCompanyRowFromServicePeerFallback,
  resolveCompanyFiscalRowWithParent,
} from "../_shared/company-fiscal-fallback.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ─── Fiscal Risk Engine (inline — fonte única de verdade, espelho de shared/fiscal/fiscal-risk-engine.ts) ───
type RiskLevel = "low" | "medium" | "high" | "critical";
interface FiscalRiskResult { score: number; level: RiskLevel; reasons: string[]; shouldBlock: boolean; }
interface FiscalRiskInput {
  difalApplied?: boolean; difalRequired?: boolean; ncmWithoutRule?: boolean; fallbackUsed?: boolean;
  cfopAutoCorrected?: boolean; cpfInterstate?: boolean; taxRuleAbsent?: boolean;
  isInterstate?: boolean; itemCount?: number; totalValue?: number;
  ncmInvalid?: boolean; cstInconsistent?: boolean; missingIE?: boolean; presenceAutoCorrected?: boolean;
  recentCriticalCount?: number; sameErrorRepeatCount?: number;
}
interface _ScoringRule { key: keyof FiscalRiskInput; points: number; condition: (v: any, input?: FiscalRiskInput) => boolean; reason: string; }
const _SCORING_RULES: _ScoringRule[] = [
  { key: "difalApplied", points: -10, condition: (v) => v === true, reason: "DIFAL aplicado corretamente" },
  { key: "ncmWithoutRule", points: 30, condition: (v) => v === true, reason: "NCM sem regra tributária definida" },
  { key: "fallbackUsed", points: 20, condition: (v) => v === true, reason: "Fallback tributário utilizado" },
  { key: "taxRuleAbsent", points: 15, condition: (v) => v === true, reason: "Ausência de tax_rule para rota interestadual" },
  { key: "cfopAutoCorrected", points: 10, condition: (v) => v === true, reason: "CFOP auto-corrigido pelo motor" },
  { key: "cpfInterstate", points: 10, condition: (v) => v === true, reason: "CPF em operação interestadual" },
  { key: "ncmInvalid", points: 25, condition: (v) => v === true, reason: "NCM inválido ou ausente em item" },
  { key: "cstInconsistent", points: 20, condition: (v) => v === true, reason: "CST/CSOSN inconsistente com operação" },
  { key: "missingIE", points: 15, condition: (v) => v === true, reason: "IE ausente em operação que exigiria" },
  { key: "presenceAutoCorrected", points: 5, condition: (v) => v === true, reason: "Tipo de presença auto-corrigido (indPres)" },
  { key: "difalRequired", points: 35, condition: (v, input) => v === true && !input?.difalApplied, reason: "DIFAL obrigatório mas NÃO aplicado — risco de autuação" },
  { key: "recentCriticalCount", points: 15, condition: (v) => typeof v === "number" && v >= 3, reason: "3+ notas críticas nas últimas 24h — padrão de risco" },
  { key: "sameErrorRepeatCount", points: 20, condition: (v) => typeof v === "number" && v >= 5, reason: "Mesmo erro fiscal repetido 5+ vezes — correção necessária" },
];
function calculateFiscalRisk(input: FiscalRiskInput): FiscalRiskResult {
  let score = 0; const reasons: string[] = [];
  for (const rule of _SCORING_RULES) {
    const value = input[rule.key];
    if (rule.key === "difalRequired") { if (rule.condition(value, input)) { score += rule.points; reasons.push(`[+${rule.points}] ${rule.reason}`); } continue; }
    if (value !== undefined && rule.condition(value)) { score += rule.points; reasons.push(rule.points > 0 ? `[+${rule.points}] ${rule.reason}` : `[${rule.points}] ${rule.reason}`); }
  }
  score = Math.max(0, Math.min(100, score));
  const level: RiskLevel = score >= 70 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low";
  return { score, level, reasons, shouldBlock: score >= 70 || (input.sameErrorRepeatCount ?? 0) >= 5 };
}
function shouldGenerateAlert(result: FiscalRiskResult): { generate: boolean; severity: "warning" | "critical" } {
  if (result.score >= 70) return { generate: true, severity: "critical" };
  if (result.score >= 50) return { generate: true, severity: "warning" };
  return { generate: false, severity: "warning" };
}
// ─── Fim Fiscal Risk Engine ───

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

function pickFirstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function mapTPagToLocalPaymentMethod(tPag: unknown): string {
  switch (String(tPag ?? "").trim()) {
    case "01":
      return "dinheiro";
    case "03":
      return "credito";
    case "04":
      return "debito";
    case "05":
      return "prazo";
    case "17":
      return "pix";
    default:
      return "outros";
  }
}

function sanitizeSefazText(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value : "";
  let s = raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/[^\x21-\xFF ]/g, "");
  if (!s) return fallback;
  return s;
}

function normalizeCityName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function resolveIbgeCodeFromDestination(params: {
  city?: unknown;
  uf?: unknown;
  zip?: unknown;
}): Promise<string> {
  const zipDigits = onlyDigits(params.zip);
  if (zipDigits.length === 8) {
    try {
      const viacepResp = await safeFetch(`https://viacep.com.br/ws/${zipDigits}/json/`, {}, 5000);
      if (viacepResp.ok) {
        const viacepData = await viacepResp.json();
        const ibge = onlyDigits(viacepData?.ibge);
        if (ibge.length >= 7) return ibge;
      }
    } catch (error) {
      console.warn("[emit-nfce] Falha ao resolver IBGE do destinatário via ViaCEP:", error);
    }
  }

  const city = String(params.city ?? "").trim();
  const uf = String(params.uf ?? "").trim().toUpperCase();
  if (!city || uf.length !== 2) return "";

  try {
    const ibgeUrl = `https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome=${encodeURIComponent(city)}`;
    const ibgeResp = await safeFetch(ibgeUrl, {}, 5000);
    if (!ibgeResp.ok) return "";

    const ibgeData = await ibgeResp.json().catch(() => []);
    if (!Array.isArray(ibgeData)) return "";

    const normalizedCity = normalizeCityName(city);
    const match = ibgeData.find((item) => {
      const itemUf = String(item?.microrregiao?.mesorregiao?.UF?.sigla || item?.['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla || "").toUpperCase();
      const itemCity = normalizeCityName(item?.nome);
      return itemUf === uf && itemCity === normalizedCity;
    }) || ibgeData.find((item) => {
      const itemUf = String(item?.microrregiao?.mesorregiao?.UF?.sigla || item?.['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla || "").toUpperCase();
      return itemUf === uf;
    });

    return onlyDigits(match?.id);
  } catch (error) {
    console.warn("[emit-nfce] Falha ao resolver IBGE do destinatário via API IBGE:", error);
    return "";
  }
}

function extractConsultReason(data: Record<string, any>): string {
  const candidates = [
    data.motivo,
    data.xMotivo,
    data.motivo_status,
    data.rejection_reason,
    data.mensagem,
    data.message,
    data.erro,
    data.descricao,
    data?.status_sefaz?.motivo,
    data?.status_sefaz?.xMotivo,
    data?.status_sefaz?.mensagem,
    data?.status_sefaz?.message,
    data?.autorizacao?.motivo_status,
    data?.autorizacao?.motivo,
    data?.autorizacao?.xMotivo,
    data?.autorizacao?.mensagem,
    data?.autorizacao?.message,
    data?.erro?.mensagem,
    data?.erro?.message,
    data?.error?.mensagem,
    data?.error?.message,
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }

  return "";
}

function formatConsultReason(data: Record<string, any>, fallback: string): string {
  const code = String(
    data.codigo_status
      || data.cStat
      || data.status_sefaz?.codigo
      || data.autorizacao?.codigo_status
      || data.autorizacao?.cStat
      || "",
  ).trim();
  const reason = extractConsultReason(data) || fallback;
  return code && !reason.includes(`[${code}]`) ? `[${code}] ${reason}` : reason;
}

function normalizeCfopForDestination(baseCfop: unknown, isInterstate: boolean): string {
  let cfop = String(baseCfop ?? "5102").trim();
  if (!/^\d{4}$/.test(cfop)) cfop = "5102";
  if (isInterstate && cfop.startsWith("5")) return `6${cfop.slice(1)}`;
  if (!isInterstate && cfop.startsWith("6")) return `5${cfop.slice(1)}`;
  return cfop;
}

function resolveProviderFiscalStatus(data: Record<string, any> | null | undefined) {
  const primaryStatus = String(data?.status || "").toLowerCase();
  const authStatus = String(data?.autorizacao?.status || "").toLowerCase();
  const statusStr = authStatus || primaryStatus;
  const cStatStr = String(
    data?.codigo_status
      || data?.cStat
      || data?.status_sefaz?.codigo
      || data?.autorizacao?.codigo_status
      || data?.autorizacao?.cStat
      || "",
  ).trim();
  const accessKey = String(
    data?.chave
      || data?.chave_acesso
      || data?.access_key
      || data?.autorizacao?.chave_acesso
      || "",
  ).trim();
  const protocolNumber = String(
    data?.protocolo
      || data?.numero_protocolo
      || data?.status_sefaz?.protocolo
      || data?.autorizacao?.protocolo
      || data?.autorizacao?.numero_protocolo
      || "",
  ).trim();

  const isDenied = statusStr.includes("rejei") || statusStr.includes("deneg") || ["110", "204", "301", "302", "539", "793", "999"].includes(cStatStr);
  const isContingency = statusStr.includes("contingencia") || statusStr.includes("contingência");
  const isAuthorized = cStatStr === "100"
    || statusStr.includes("autoriz")
    || (statusStr.includes("aprovad") && !!protocolNumber);
  const isPending = !isAuthorized && !isDenied && (
    statusStr.includes("pendente")
    || statusStr.includes("process")
    || statusStr.includes("fila")
    || statusStr.includes("recebid")
    || statusStr.includes("aprovad")
    || (!cStatStr && !protocolNumber)
  );

  const normalizedStatus = isDenied
    ? "rejeitada"
    : isAuthorized
      ? "autorizada"
      : isContingency
        ? "contingencia"
        : isPending
          ? "pendente"
          : "pendente";

  return {
    normalizedStatus,
    isAuthorized,
    isDenied,
    isContingency,
    isPending,
    statusStr,
    cStatStr,
    accessKey,
    protocolNumber,
  };
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
    const { data: company } = await params.supabase
      .from("companies")
      .select("cnpj, parent_company_id")
      .eq("id", String(params.companyId))
      .maybeSingle();

    let merged = await resolveCompanyFiscalRowWithParent(
      params.supabase,
      (company || {}) as Record<string, unknown>,
    );
    merged = await fillCompanyRowFromServicePeerFallback(
      params.supabase,
      merged,
      String(params.companyId),
    );
    const cpfCnpj = onlyDigits(merged.cnpj);
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
const CSOSN_ICMSSN102_ALLOWED = new Set(["102", "103", "300", "400", "900"]);

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
    // API rejeita CSOSN 101 dentro do bloco ICMSSN102; normalizamos para códigos válidos desse bloco.
    let safeCsosn = cst || "102";
    if (safeCsosn === "101") safeCsosn = "102";
    if (!CSOSN_ICMSSN102_ALLOWED.has(safeCsosn)) safeCsosn = "102";
    return { ICMSSN102: { orig: origem, CSOSN: safeCsosn } };
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

    const formItems = Array.isArray(form?.items) ? form.items : [];
    const restrictIds = [
      ...new Set(
        formItems.map((it: { product_id?: string }) => String(it?.product_id || "").trim()).filter(Boolean),
      ),
    ];
    const readiness = await getFiscalReadiness(
      supabase,
      String(company_id),
      "nfce",
      restrictIds.length ? { restrictToProductIds: restrictIds as string[] } : undefined,
    );
    if (readiness.status !== "ready") {
      const primaryIssueCode = getFiscalReadinessPrimaryIssueCode(readiness);
      if (primaryIssueCode !== "company_cnpj_missing") {
        return jsonResponse({
          error: getFiscalReadinessBlockReason(readiness),
          primary_issue_code: primaryIssueCode,
          readiness,
        }, 400);
      }
      console.warn(
        `[emit-nfce] readiness soft-bypass: ${primaryIssueCode}. ` +
        `Tentando resolver CNPJ no fallback do emitente (company_id=${company_id}).`,
      );
    }
  }

  // Buscar empresa + config fiscal + regras tributárias em PARALELO (reduz latência ~50%)
  const companyPromise = supabase.from("companies").select("*").eq("id", company_id).single();
  const configPromise = config_id
    ? supabase.from("fiscal_configs").select("*").eq("id", config_id).single()
    : supabase.from("fiscal_configs").select("*")
        .eq("company_id", company_id).eq("doc_type", "nfce").eq("is_active", true).limit(1).maybeSingle();
  const taxRulesNcmPromise = supabase
    .from("tax_rules_by_ncm")
    .select("*")
    .eq("company_id", company_id)
    .eq("is_active", true);

  const [companyRes, configRes, taxRulesNcmRes] = await Promise.all([companyPromise, configPromise, taxRulesNcmPromise]);
  const taxRulesByNcm: any[] = taxRulesNcmRes.data || [];

  if (companyRes.error || !companyRes.data) {
    return jsonResponse({ error: "Empresa não encontrada" }, 404);
  }

  const company = (await fillCompanyRowFromServicePeerFallback(
    supabase,
    await resolveCompanyFiscalRowWithParent(supabase, companyRes.data as Record<string, unknown>),
    String(company_id),
  )) as typeof companyRes.data;

  const companyStreet = pickFirstNonEmpty(company.street, company.address_street, company.address);
  const companyNumber = pickFirstNonEmpty(company.number, company.address_number);
  const companyNeighborhood = pickFirstNonEmpty(company.neighborhood, company.address_neighborhood);
  const companyCity = pickFirstNonEmpty(company.city, company.address_city);
  const companyState = pickFirstNonEmpty(company.state, company.address_state, "MA").toUpperCase();
  const companyZip = onlyDigits(pickFirstNonEmpty(company.zip_code, company.address_zip, company.cep));

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

  const taxClassificationAudit: any[] = [];
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

    // ─── Tax Classification Engine: score-based matching por NCM ───
    if (taxRulesByNcm.length > 0) {
      const regime = isSimples ? "simples" : "normal";
      let bestRule: any = null;
      let bestScore = -1;
      for (const r of taxRulesByNcm) {
        const rawNcm = (r.ncm || "").trim();
        const rNcm = rawNcm === "*" ? "*" : rawNcm.replace(/\D/g, "");
        let sc = 0;
        if (rNcm === "*") sc += 10;
        else if (rNcm === ncm) sc += 100;
        else if (ncm.startsWith(rNcm) && rNcm.length >= 4) sc += 60;
        else if (ncm.startsWith(rNcm) && rNcm.length >= 2) sc += 30;
        else continue;
        if (r.regime !== regime) continue;
        sc += 40;
        if (r.uf_origem === companyState) sc += 30; else if (r.uf_origem === "*") sc += 5; else continue;
        if (r.uf_destino === companyState) sc += 30; else if (r.uf_destino === "*") sc += 5; else continue;
        if (r.tipo_cliente === "*") sc += 5; else sc += 30;
        if (sc > bestScore) { bestScore = sc; bestRule = r; }
      }
      const matchedRule = bestScore >= 50 ? bestRule : null;
      if (matchedRule) {
        if (!item.cst && matchedRule.cst) item.cst = matchedRule.cst;
        if (!item.csosn && matchedRule.csosn) item.cst = matchedRule.csosn;
        if ((!item.icms_aliquota || item.icms_aliquota === 0) && matchedRule.icms_aliquota > 0) item.icms_aliquota = matchedRule.icms_aliquota;
        if (matchedRule.icms_st && (!item.mva || item.mva === 0) && matchedRule.mva > 0) item.mva = matchedRule.mva;
        if (matchedRule.icms_reducao_base > 0 && !item.reducao_base) item.reducao_base = matchedRule.icms_reducao_base;
        taxClassificationAudit.push({ item: item.name, ncm, rule_id: matchedRule.id, score: bestScore, fallback: false });
      } else {
        taxClassificationAudit.push({ item: item.name, ncm, rule_id: null, score: bestScore, fallback: true });
      }
    }

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
  const normalizedPayments = form.payments && Array.isArray(form.payments) && form.payments.length > 0
    ? normalizePaymentsForNfce(form.payments as Array<Record<string, unknown>>, {
      fallbackAmount: vNF,
      fallbackChange: troco,
    })
    : [classifyAndNormalizePayment(form as Record<string, unknown>, {
      fallbackAmount: vNF,
      fallbackChange: troco,
    })];
  validateDetPagForEmission(normalizedPayments);
  const detPag = normalizedPayments.map((payment) => payment.sefazDetPag);
  const mainTpag = normalizedPayments[0]?.tPag || "99";
  console.log("[emit-nfce] payment.audit.raw:", JSON.stringify(form.payments ?? form));
  console.log("[emit-nfce] payment.audit.normalized:", JSON.stringify(normalizedPayments));
  console.log("[emit-nfce] payment.audit.detPag:", JSON.stringify(detPag));

  const pagBlock: any = { detPag };
  if (troco > 0) pagBlock.vTroco = Math.round(troco * 100) / 100;

  // Destinatário
  let dest: any = undefined;
  if (form.customer_doc) {
    const docClean = form.customer_doc.replace(/\D/g, "");
    if (docClean.length === 11) dest = { CPF: docClean, indIEDest: 9 };
    else if (docClean.length === 14) dest = { CNPJ: docClean, indIEDest: 9 };
    if (dest && form.customer_name) dest.xNome = form.customer_name;
  }

  // Emitente
  const cnpjClean = (company.cnpj || "").replace(/\D/g, "");
  const ieEmitClean = (company.ie || company.state_registration || "").replace(/\D/g, "");

  let ibgeCode = company.ibge_code || company.city_code || company.address_ibge_code || "";
  let ibgeClean = String(ibgeCode).replace(/\D/g, "");
  // Fallback: resolver IBGE via ViaCEP se não configurado
  if ((!ibgeClean || ibgeClean.length < 7 || ibgeClean === "0000000") && companyZip) {
    const cepDigits = companyZip;
    if (cepDigits.length === 8) {
      try {
        const viacepResp = await safeFetch(`https://viacep.com.br/ws/${cepDigits}/json/`, {}, 5000);
        if (viacepResp.ok) {
          const viacepData = await viacepResp.json();
          if (viacepData.ibge) {
            ibgeClean = String(viacepData.ibge).replace(/\D/g, "");
            // Persistir para não precisar consultar novamente
            await supabase.from("companies").update({ ibge_code: ibgeClean, address_ibge_code: ibgeClean }).eq("id", company_id);
            console.log(`[emit-nfce] IBGE resolvido via ViaCEP: ${ibgeClean}`);
          }
        }
      } catch (e) {
        console.warn("[emit-nfce] Falha ao consultar ViaCEP para IBGE:", e);
      }
    }
  }
  if (!ibgeClean || ibgeClean.length < 7 || ibgeClean === "0000000") {
    return jsonResponse({ error: `Código IBGE do município não configurado ou inválido ("${ibgeCode}"). Atualize o CEP da empresa em Configurações.` }, 400);
  }

  const emit: Record<string, unknown> = {
    CNPJ: cnpjClean,
    xNome: sanitizeSefazText(company.name || company.trade_name, "EMITENTE"),
    CRT: crt,
  };
  if (ieEmitClean) emit.IE = ieEmitClean;

  if (companyStreet) {
    emit.enderEmit = {
      xLgr: sanitizeSefazText(companyStreet || "Rua não informada", "Rua não informada"),
      nro: companyNumber || "S/N",
      xBairro: sanitizeSefazText(companyNeighborhood || "Centro", "Centro"),
      cMun: ibgeClean,
      xMun: sanitizeSefazText(companyCity || "Não informada", "Não informada"),
      UF: sanitizeSefazText(companyState || "MA", "MA"),
      CEP: companyZip || "00000000",
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

  // ─── FISCAL RISK SCORING (via engine centralizado) ───
  let riskResult: FiscalRiskResult;
  try {
    riskResult = calculateFiscalRisk({
      fallbackUsed: taxClassificationAudit.some((a: any) => a.fallback),
      ncmWithoutRule: taxClassificationAudit.some((a: any) => a.fallback),
      taxRuleAbsent: taxClassificationAudit.length > 0 && taxClassificationAudit.every((a: any) => a.fallback),
      itemCount: items.length,
      totalValue: vNF,
    });
  } catch (engineErr: any) {
    console.error(`[emit-nfce] ✗ FALHA CRÍTICA no fiscal risk engine: ${engineErr.message}`);
    return jsonResponse({ error: "Erro interno no motor de risco fiscal. Emissão bloqueada por segurança." }, 500);
  }

  if (riskResult.shouldBlock) {
    console.error(`[emit-nfce] ✗ BLOQUEIO POR RISCO FISCAL: score=${riskResult.score} reasons=${JSON.stringify(riskResult.reasons)}`);
    await supabase.from("fiscal_risk_logs").insert({
      company_id, note_type: "nfce", score: riskResult.score, level: riskResult.level, reasons: riskResult.reasons, blocked: true,
    }).then(() => {});
    return jsonResponse({ error: `Emissão bloqueada por risco fiscal elevado (score: ${riskResult.score}). Corrija as regras tributárias antes de emitir.`, risk_score: riskResult.score, risk_reasons: riskResult.reasons }, 400);
  }

  console.log(`[emit-nfce] ▶ Emitindo NFC-e #${numero} | CNPJ: ${cnpjClean} | CRT: ${crt} | Amb: ${ambiente} | Itens: ${items.length} | Total: ${vNF} | RiskScore: ${riskResult.score}`);
  console.log(`[emit-nfce] ▶ pagBlock completo:`, JSON.stringify(pagBlock));

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
      payment_method: mapTPagToLocalPaymentMethod(mainTpag), access_key: rejAccessKey, protocol_number: rejProtocol,
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
  const mainPayMethod = mapTPagToLocalPaymentMethod(normalizedPayments[0]?.tPag || "99");
  const insertRow: Record<string, unknown> = {
    company_id, doc_type: "nfce", number: numero, serie: config.serie || 1,
    access_key: accessKey || null, protocol_number: protocolNumber || null,
    status: finalStatus, total_value: vNF, environment: ambiente,
    customer_name: form.customer_name || null, customer_cpf_cnpj: form.customer_doc || null,
    payment_method: mainPayMethod, is_contingency: isContingency,
  };
  if (sale_id) insertRow.sale_id = String(sale_id);

  const insertRes = await supabase.from("fiscal_documents").insert(insertRow);
  if (insertRes.error) {
    console.error("[emit-nfce] Falha ao registrar fiscal_documents:", insertRes.error.message, JSON.stringify(insertRow));
    return jsonResponse({ success: false, error: `Falha ao registrar documento fiscal no banco: ${insertRes.error.message}` }, 500);
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

  // ─── Registrar risk log (não-bloqueante, via engine) ───
  supabase.from("fiscal_risk_logs").insert({
    company_id, note_id: accessKey || String(numero), note_type: "nfce",
    score: riskResult.score, level: riskResult.level, reasons: riskResult.reasons, blocked: false,
  }).then(() => {});
  // Gerar alerta via shouldGenerateAlert
  const nfceAlert = shouldGenerateAlert(riskResult);
  if (nfceAlert.generate) {
    supabase.from("fiscal_alerts").insert({
      company_id, severity: nfceAlert.severity, score: riskResult.score,
      title: `NFC-e #${numero} com risco ${nfceAlert.severity}`,
      description: `Score: ${riskResult.score}/100`,
      reasons: riskResult.reasons,
    }).then(() => {});
  }

  return jsonResponse({
    success: true,
    status: finalStatus,
    number: numero,
    access_key: accessKey,
    protocol: protocolNumber,
    risk_score: riskResult.score,
    risk_level: riskResult.level,
  });
}

// ─── Emissão NF-e modelo 55 (chamada pelo NFeEmissao.tsx) ───
async function handleEmitNfe(supabase: any, body: any) {
  const t0 = Date.now();
  const { company_id, config_id, form, certificate_base64, certificate_password } = body;

  if (!company_id || !form) {
    return jsonResponse({ error: "Dados incompletos: company_id e form são obrigatórios" }, 400);
  }

  // Rate limiting
  const { data: allowed } = await supabase.rpc("check_rate_limit", {
    p_company_id: company_id,
    p_fn_name: "emit-nfe",
    p_max_calls: 20,
    p_window_sec: 60,
  });
  if (allowed === false) {
    return jsonResponse({ error: "Limite de emissões excedido. Aguarde 1 minuto." }, 429);
  }

  // Buscar empresa + config fiscal + regras tributárias em PARALELO
  const companyPromise = supabase.from("companies").select("*").eq("id", company_id).single();
  const configPromise = config_id
    ? supabase.from("fiscal_configs").select("*").eq("id", config_id).single()
    : supabase.from("fiscal_configs").select("*")
        .eq("company_id", company_id).eq("doc_type", "nfe").eq("is_active", true).limit(1).maybeSingle();
  const taxRulesNcmPromiseNfe = supabase
    .from("tax_rules_by_ncm")
    .select("*")
    .eq("company_id", company_id)
    .eq("is_active", true);

  const [companyRes, configRes, taxRulesNcmResNfe] = await Promise.all([companyPromise, configPromise, taxRulesNcmPromiseNfe]);
  const taxRulesByNcmNfe: any[] = taxRulesNcmResNfe.data || [];

  if (companyRes.error || !companyRes.data) {
    return jsonResponse({ error: "Empresa não encontrada" }, 404);
  }

  const company = (await fillCompanyRowFromServicePeerFallback(
    supabase,
    await resolveCompanyFiscalRowWithParent(supabase, companyRes.data as Record<string, unknown>),
    String(company_id),
  )) as typeof companyRes.data;

  const companyStreet = pickFirstNonEmpty(company.street, company.address_street, company.address);
  const companyNumber = pickFirstNonEmpty(company.number, company.address_number);
  const companyNeighborhood = pickFirstNonEmpty(company.neighborhood, company.address_neighborhood);
  const companyCity = pickFirstNonEmpty(company.city, company.address_city);
  const companyState = pickFirstNonEmpty(company.state, company.address_state, "MA").toUpperCase();
  const companyZip = onlyDigits(pickFirstNonEmpty(company.zip_code, company.address_zip, company.cep));

  let config = configRes.data;
  if (!config && config_id) {
    const { data } = await supabase.from("fiscal_configs").select("*")
      .eq("company_id", company_id).eq("doc_type", "nfe").eq("is_active", true).limit(1).maybeSingle();
    config = data;
  }
  if (!config) {
    return jsonResponse({ error: "Configuração fiscal NF-e não encontrada. Acesse Fiscal > Configuração." }, 400);
  }

  // Validação IE
  const ieClean = (company.ie || company.state_registration || "").replace(/\D/g, "");
  if (!ieClean || ieClean.length < 2) {
    return jsonResponse({ error: "Inscrição Estadual (IE) não configurada." }, 400);
  }

  // Certificado expirado
  if (config.certificate_expiry) {
    const expiryDate = new Date(config.certificate_expiry);
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry <= 0) {
      return jsonResponse({ error: `Certificado digital A1 EXPIRADO em ${expiryDate.toLocaleDateString("pt-BR")}. Renove antes de emitir.` }, 400);
    }
  }

  // CRT e regime
  const crt = form.crt || company.crt || 1;
  const isSimples = crt === 1 || crt === 2;

  // Numeração
  const numero = await getNextNumberSafe(supabase, config.id);

  // Ambiente
  const ambiente = config.environment === "producao" ? "producao" : "homologacao";

  // ─── Motor Fiscal Automático com Validação de Integridade ───
  const VALID_UFS = new Set([
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
    "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
    "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
  ]);
  const emitUF = companyState.trim();
  const destUF = (form.dest_uf || "").toUpperCase().trim();
  const rawPresence = Number(form.presence_type);
  let indPres = [1, 2, 3, 4, 9].includes(rawPresence) ? rawPresence : 1;
  const isInterstate = destUF.length === 2 && VALID_UFS.has(destUF) && emitUF !== destUF;
  const idDest = isInterstate ? 2 : 1;

  // ─── REGRA DE COERÊNCIA: interestadual + presencial → auto-corrigir ───
  if (isInterstate && indPres === 1) {
    console.warn(`[emit-nfe] ⚠ Coerência: idDest=2 (interestadual) + indPres=1 (presencial) → auto-corrigindo para indPres=2`);
    indPres = 2;
  }

  console.log(`[emit-nfe] Motor Fiscal: UF=${emitUF}→${destUF} idDest=${idDest} indPres=${indPres} CRT=${crt}`);

  // ─── Buscar tax_rule customizada (se existir) ───
  let taxRule: { aliq_interestadual: number; aliq_interna_destino: number; fcp_percent: number } | null = null;
  if (isInterstate) {
    const { data: ruleData } = await supabase
      .from("tax_rules")
      .select("aliq_interestadual, aliq_interna_destino, fcp_percent")
      .eq("uf_origem", emitUF)
      .eq("uf_destino", destUF)
      .maybeSingle();
    if (ruleData) taxRule = ruleData;
  }

  // ─── Determinar se destinatário é contribuinte ICMS ───
  const destDocDigits = (form.dest_doc || "").replace(/\D/g, "");
  const destIERaw = String(form.dest_ie || "").trim();
  const destIE = destIERaw.replace(/\D/g, "");
  const destIEIsento = /^isento$/i.test(destIERaw);
  const destIsContribuinte = destDocDigits.length === 14 && (destIE.length >= 2 || destIEIsento);
  const applyDifal = isInterstate && !destIsContribuinte;

  // ─── FAIL-SAFE: CPF + interestadual → DIFAL obrigatório ───
  if (isInterstate && destDocDigits.length === 11 && !applyDifal) {
    console.error(`[emit-nfe] ✗ FAIL-SAFE: CPF interestadual sem DIFAL — situação impossível, forçando DIFAL`);
  }
  // ─── FAIL-SAFE: CNPJ sem IE + interestadual → deve aplicar DIFAL ───
  if (isInterstate && destDocDigits.length === 14 && !destIsContribuinte && !applyDifal) {
    console.error(`[emit-nfe] ✗ FAIL-SAFE: CNPJ sem IE interestadual sem DIFAL — situação impossível`);
  }

  console.log(`[emit-nfe] DestDoc=${destDocDigits.length} IE=${destIERaw || "(vazio)"} Contribuinte=${destIsContribuinte} DIFAL=${applyDifal}`);

  // ─── Alíquotas DIFAL ───
  const SUL_SUDESTE = new Set(["SP", "RJ", "MG", "PR", "SC", "RS"]);
  const ALIQ_INTERNA_UF: Record<string, number> = {
    AC: 19, AL: 19, AP: 18, AM: 20, BA: 20.5, CE: 20, DF: 20, ES: 17,
    GO: 19, MA: 22, MT: 17, MS: 17, MG: 18, PA: 19, PB: 20, PR: 19.5,
    PE: 20.5, PI: 21, RJ: 22, RN: 18, RS: 17, RO: 19.5, RR: 20, SC: 17,
    SP: 18, SE: 19, TO: 20,
  };
  const FCP_UF: Record<string, number> = {
    RJ: 2, MG: 2, MS: 2, GO: 2, MT: 2, PI: 0, AL: 1, MA: 2,
    BA: 2, PE: 2, CE: 2, PA: 2, SE: 2, PB: 2, RN: 2, TO: 2,
  };
  const resolveEffectiveFcpPercent = (ufDestino: string, explicitPercent?: number | null) => {
    const uf = ufDestino.toUpperCase().trim();
    if (uf === "PI") return 0; // Prevenir Rejeição 793
    if (typeof explicitPercent === "number" && Number.isFinite(explicitPercent)) return explicitPercent;
    return FCP_UF[uf] || 0;
  };
  const defaultInterRate = SUL_SUDESTE.has(emitUF) && !SUL_SUDESTE.has(destUF) ? 7 : 12;
  const pICMSInter = taxRule?.aliq_interestadual ?? defaultInterRate;
  const pICMSUFDest = taxRule?.aliq_interna_destino ?? (ALIQ_INTERNA_UF[destUF] || 18);
  const pFCPUFDest = resolveEffectiveFcpPercent(destUF, taxRule?.fcp_percent ?? null);

  // ─── PRÉ-VALIDAÇÃO DE INTEGRIDADE FISCAL (BLOQUEANTE) ───
  const integrityErrors: string[] = [];

  // Validar UF emitente
  if (!VALID_UFS.has(emitUF)) {
    integrityErrors.push(`UF do emitente "${emitUF}" inválida.`);
  }
  // Validar CRT
  if (![1, 2, 3].includes(crt)) {
    integrityErrors.push(`CRT "${crt}" inválido. Deve ser 1, 2 ou 3.`);
  }
  // NF-e exige destinatário
  if (!form.dest_doc) {
    integrityErrors.push("Destinatário é obrigatório para NF-e (modelo 55).");
  }
  // Validar doc destinatário
  if (destDocDigits && destDocDigits.length !== 11 && destDocDigits.length !== 14) {
    integrityErrors.push(`CPF/CNPJ do destinatário inválido (${destDocDigits.length} dígitos).`);
  }
  // Validar UF destino para interestadual
  if (isInterstate && !VALID_UFS.has(destUF)) {
    integrityErrors.push(`UF do destinatário "${destUF}" inválida.`);
  }
  // UF obrigatória para NF-e
  if (!destUF || destUF.length !== 2) {
    integrityErrors.push("UF do destinatário é obrigatória para NF-e.");
  }
  // DIFAL: se interestadual + não contribuinte, alíquotas devem ser resolvíveis
  if (applyDifal && pICMSUFDest <= pICMSInter) {
    console.warn(`[emit-nfe] ⚠ DIFAL não aplicável: alíqInterna(${pICMSUFDest}) <= alíqInter(${pICMSInter})`);
  }

  if (integrityErrors.length > 0) {
    console.error(`[emit-nfe] ✗ Pré-validação fiscal falhou:`, integrityErrors);
    // Log de tentativa bloqueada
    await supabase.from("action_logs").insert({
      company_id,
      action: "fiscal_emission_blocked",
      module: "fiscal",
      details: JSON.stringify({
        reason: "pre_validation_failed",
        errors: integrityErrors,
        emitUF, destUF, crt, isInterstate, applyDifal,
      }),
    }).then(() => {}).catch(() => {});

    return jsonResponse({
      error: `Pré-validação fiscal falhou: ${integrityErrors.join(" | ")}`,
      validation_errors: integrityErrors,
    }, 400);
  }

  // Itens
  const items = form.items || [];
  if (items.length === 0) {
    return jsonResponse({ error: "Nenhum item na nota" }, 400);
  }

  // Totalizadores
  let totalVProd = 0, totalVDesc = 0, totalVICMS = 0, totalVBCST = 0, totalVST = 0, totalVPIS = 0, totalVCOFINS = 0;
  let totalVFCPUFDest = 0, totalVICMSUFDest = 0, totalVICMSUFRemet = 0;

  const resolvedItemsForReturn: Array<Record<string, unknown>> = [];
  const taxClassificationAuditNfe: any[] = [];

  const detItems = items.map((item: any, i: number) => {
    const ncm = (item.ncm || "").replace(/\D/g, "");
    if (!ncm || ncm.length < 2 || ncm === "00000000") {
      throw new Error(`Item ${i + 1} ("${item.name}") sem NCM válido.`);
    }

    const cfop = normalizeCfopForDestination(item.cfop || "5102", isInterstate);
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

    // ─── Tax Classification Engine: score-based matching por NCM (NF-e) ───
    if (taxRulesByNcmNfe.length > 0) {
      const regime = isSimples ? "simples" : "normal";
      const destUfForRule = destUF || emitUF;
      let bestRuleNfe: any = null;
      let bestScoreNfe = -1;
      for (const r of taxRulesByNcmNfe) {
        const rawNcm = (r.ncm || "").trim();
        const rNcm = rawNcm === "*" ? "*" : rawNcm.replace(/\D/g, "");
        let sc = 0;
        if (rNcm === "*") sc += 10;
        else if (rNcm === ncm) sc += 100;
        else if (ncm.startsWith(rNcm) && rNcm.length >= 4) sc += 60;
        else if (ncm.startsWith(rNcm) && rNcm.length >= 2) sc += 30;
        else continue;
        if (r.regime !== regime) continue;
        sc += 40;
        if (r.uf_origem === emitUF) sc += 30; else if (r.uf_origem === "*") sc += 5; else continue;
        if (r.uf_destino === destUfForRule) sc += 30; else if (r.uf_destino === "*") sc += 5; else continue;
        if (r.tipo_cliente === "*") sc += 5; else sc += 30;
        if (sc > bestScoreNfe) { bestScoreNfe = sc; bestRuleNfe = r; }
      }
      const matchedRule = bestScoreNfe >= 50 ? bestRuleNfe : null;
      if (matchedRule) {
        if (!item.cst && matchedRule.cst) item.cst = matchedRule.cst;
        if (!item.csosn && matchedRule.csosn) item.cst = matchedRule.csosn;
        if ((!item.icms_aliquota || item.icms_aliquota === 0) && matchedRule.icms_aliquota > 0) item.icms_aliquota = matchedRule.icms_aliquota;
        if (matchedRule.icms_st && (!item.mva || item.mva === 0) && matchedRule.mva > 0) item.mva = matchedRule.mva;
        if (matchedRule.icms_reducao_base > 0 && !item.reducao_base) item.reducao_base = matchedRule.icms_reducao_base;
        if (matchedRule.cest && !item.cest) item.cest = matchedRule.cest;
        taxClassificationAuditNfe.push({ item: item.name, ncm, rule_id: matchedRule.id, score: bestScoreNfe, fallback: false });
      } else {
        taxClassificationAuditNfe.push({ item: item.name, ncm, rule_id: null, score: bestScoreNfe, fallback: true });
      }
    }

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
      cProd: item.product_code || item.product_id || String(i + 1),
      cEAN: "SEM GTIN", xProd: item.name, NCM: ncm, CFOP: cfop,
      uCom: item.unit || "UN", qCom: qty, vUnCom: unitPrice, vProd,
      cEANTrib: "SEM GTIN", uTrib: item.unit || "UN", qTrib: qty, vUnTrib: unitPrice, indTot: 1,
    };

    if (item.cest) prodBlock.CEST = String(item.cest).replace(/\D/g, "");

    const impostoBlock: any = { ICMS: icmsBlock, PIS, COFINS };

    // ─── DIFAL: ICMSUFDest por item (interestadual + não contribuinte) ───
    if (applyDifal && pICMSUFDest > pICMSInter) {
      const vBCUFDest = Math.round(vProdLiq * 100) / 100;
      const difalItem = Math.round(vBCUFDest * (pICMSUFDest - pICMSInter) / 100 * 100) / 100;
      const fcpItem = Math.round(vBCUFDest * pFCPUFDest / 100 * 100) / 100;
      const vICMSUFDestItem = difalItem; // 100% destino desde 2019
      const vICMSUFRemetItem = 0;

      impostoBlock.ICMSUFDest = {
        vBCUFDest,
        pFCPUFDest,
        pICMSUFDest,
        pICMSInter,
        pICMSInterPart: 100,
        vFCPUFDest: fcpItem,
        vICMSUFDest: vICMSUFDestItem,
        vICMSUFRemet: vICMSUFRemetItem,
      };

      totalVFCPUFDest += fcpItem;
      totalVICMSUFDest += vICMSUFDestItem;
      totalVICMSUFRemet += vICMSUFRemetItem;
    }

    const det: any = { nItem: i + 1, prod: prodBlock, imposto: impostoBlock };
    if (discount > 0) det.prod.vDesc = discount;

    resolvedItemsForReturn.push({
      name: item.name,
      productCode: item.product_code || item.product_id || String(i + 1),
      ncm,
      cfop,
      cst: String(item.cst || ""),
      unit: item.unit || "UN",
      qty,
      unitPrice,
      discount,
      total: Math.round(vProdLiq * 100) / 100,
      pisCst,
      cofinsCst,
      icmsAliquota: Number(item.icms_aliquota || 0),
      origem: String(item.origem || "0"),
    });

    return det;
  });

  const vNF = Math.round((totalVProd - totalVDesc + totalVST) * 100) / 100;

  // Pagamento
  const paymentMethod = form.payment_method || "01";
  const paymentValue = form.payment_value || vNF;
  const tPag = paymentMethod;
  const detPag = [{ tPag, vPag: Math.round(paymentValue * 100) / 100 }];
  const pagBlock: any = { detPag };

  // Destinatário (obrigatório para NF-e)
  let dest: any = undefined;
  const destDoc = (form.dest_doc || "").replace(/\D/g, "");
  if (destDoc) {
    let destCityCode = onlyDigits(form.dest_city_code);
    if (destCityCode.length < 7) {
      destCityCode = await resolveIbgeCodeFromDestination({
        city: form.dest_city,
        uf: form.dest_uf,
        zip: form.dest_zip,
      });
    }

    dest = {};
    if (destDoc.length === 11) { dest.CPF = destDoc; }
    else if (destDoc.length === 14) { dest.CNPJ = destDoc; }

    if (form.dest_name) dest.xNome = sanitizeSefazText(form.dest_name, "CONSUMIDOR");

    // IE do destinatário
    const destIERawValue = String(form.dest_ie || "").trim();
    const destIE = destIERawValue.replace(/\D/g, "");
    const destIEIsento = /^isento$/i.test(destIERawValue);
    if (destIE && destIE.length >= 2) {
      dest.IE = destIE;
      dest.indIEDest = 1; // Contribuinte
    } else if (destDoc.length === 14 && destIEIsento) {
      dest.indIEDest = 2; // Contribuinte isento
    } else {
      dest.indIEDest = 9; // Não contribuinte
    }

    if (form.dest_email) dest.email = form.dest_email;

    // Endereço do destinatário
    if (form.dest_street) {
      dest.enderDest = {
        xLgr: sanitizeSefazText(form.dest_street, "Rua não informada"),
        nro: form.dest_number || "S/N",
        xBairro: sanitizeSefazText(form.dest_neighborhood || "Centro", "Centro"),
        cMun: destCityCode || "0000000",
        xMun: sanitizeSefazText(form.dest_city || "Não informada", "Não informada"),
        UF: (form.dest_uf || "").toUpperCase() || "MA",
        CEP: (form.dest_zip || "00000000").replace(/\D/g, ""),
        cPais: "1058", xPais: "Brasil",
      };
      if (form.dest_complement) dest.enderDest.xCpl = form.dest_complement;
    }

    if (destCityCode.length < 7) {
      return jsonResponse({
        error: "Código IBGE do município do destinatário não pôde ser resolvido automaticamente. Revise CEP, cidade e UF do destinatário.",
      }, 400);
    }
  }

  // Emitente
  const cnpjClean = (company.cnpj || "").replace(/\D/g, "");
  const ieEmitClean = (company.ie || company.state_registration || "").replace(/\D/g, "");

  let ibgeCode = company.ibge_code || company.city_code || company.address_ibge_code || "";
  let ibgeClean = String(ibgeCode).replace(/\D/g, "");
  // Fallback: resolver IBGE via ViaCEP se não configurado
  if ((!ibgeClean || ibgeClean.length < 7 || ibgeClean === "0000000") && companyZip) {
    const cepDigits = companyZip;
    if (cepDigits.length === 8) {
      try {
        const viacepResp = await safeFetch(`https://viacep.com.br/ws/${cepDigits}/json/`, {}, 5000);
        if (viacepResp.ok) {
          const viacepData = await viacepResp.json();
          if (viacepData.ibge) {
            ibgeClean = String(viacepData.ibge).replace(/\D/g, "");
            await supabase.from("companies").update({ ibge_code: ibgeClean, address_ibge_code: ibgeClean }).eq("id", company_id);
            console.log(`[emit-nfe] IBGE resolvido via ViaCEP: ${ibgeClean}`);
          }
        }
      } catch (e) {
        console.warn("[emit-nfe] Falha ao consultar ViaCEP para IBGE:", e);
      }
    }
  }
  if (!ibgeClean || ibgeClean.length < 7 || ibgeClean === "0000000") {
    return jsonResponse({ error: `Código IBGE do município não configurado ou inválido ("${ibgeCode}"). Atualize o CEP da empresa em Configurações.` }, 400);
  }

  const emit: Record<string, unknown> = {
    CNPJ: cnpjClean,
    xNome: sanitizeSefazText(company.name || company.trade_name, "EMITENTE"),
    CRT: crt,
  };
  if (ieEmitClean) emit.IE = ieEmitClean;

  if (companyStreet) {
    emit.enderEmit = {
      xLgr: sanitizeSefazText(companyStreet || "Rua não informada", "Rua não informada"),
      nro: companyNumber || "S/N",
      xBairro: sanitizeSefazText(companyNeighborhood || "Centro", "Centro"),
      cMun: ibgeClean,
      xMun: sanitizeSefazText(companyCity || "Não informada", "Não informada"),
      UF: sanitizeSefazText(companyState || "MA", "MA"),
      CEP: companyZip || "00000000",
      cPais: "1058", xPais: "Brasil",
    };
    if (company.complement) (emit.enderEmit as Record<string, unknown>).xCpl = company.complement;
  }

  // Informações adicionais
  let infAdFisco = "";
  if (isSimples) infAdFisco = "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL";
  const infAdic: any = {};
  if (infAdFisco) infAdic.infAdFisco = infAdFisco;
  if (form.inf_adic) infAdic.infCpl = form.inf_adic;

  // Finalidade
  const finNFe = Number(form.finalidade) || 1;

  // Transporte
  const modFrete = Number(form.frete) || 9;
  const transp: any = { modFrete };
  if (form.transport_name && modFrete !== 9) {
    const transpDoc = (form.transport_doc || "").replace(/\D/g, "");
    transp.transporta = {
      xNome: sanitizeSefazText(form.transport_name, "TRANSPORTADORA"),
    };
    if (transpDoc.length === 14) transp.transporta.CNPJ = transpDoc;
    else if (transpDoc.length === 11) transp.transporta.CPF = transpDoc;

    if (form.transport_plate) {
      transp.veicTransp = {
        placa: form.transport_plate.replace(/[^A-Z0-9]/gi, "").toUpperCase(),
        UF: (form.transport_uf || "").toUpperCase() || "MA",
      };
    }
  }

  // Volumes
  if (form.volumes && Number(form.volumes) > 0) {
    transp.vol = [{
      qVol: Number(form.volumes),
      pesoL: form.net_weight ? Math.round(Number(form.net_weight) * 1000) / 1000 : undefined,
      pesoB: form.gross_weight ? Math.round(Number(form.gross_weight) * 1000) / 1000 : undefined,
    }];
  }

  // Payload NF-e modelo 55
  const payload: any = {
    ambiente,
    infNFe: {
      versao: "4.00",
      ide: {
        cUF: getUfCode(company.state || "MA"),
        natOp: form.nat_op || "VENDA DE MERCADORIA",
        mod: 55, serie: config.serie || 1, nNF: numero,
        dhEmi: new Date().toISOString(),
        dhSaiEnt: new Date().toISOString(),
        tpNF: 1, idDest, cMunFG: ibgeClean,
        tpImp: 1, tpEmis: 1,
        tpAmb: ambiente === "producao" ? 1 : 2,
        finNFe, indFinal: 1, indPres: indPres,
        procEmi: 0, verProc: "AnthoSystem 1.0",
      },
      emit,
      dest,
      det: detItems,
      transp,
      total: {
        ICMSTot: {
          vBC: Math.round((totalVICMS > 0 ? totalVProd : 0) * 100) / 100,
          vICMS: Math.round(totalVICMS * 100) / 100,
          vICMSDeson: 0, vFCP: Math.round(totalVFCPUFDest * 100) / 100,
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
          vFCPUFDest: Math.round(totalVFCPUFDest * 100) / 100,
          vICMSUFDest: Math.round(totalVICMSUFDest * 100) / 100,
          vICMSUFRemet: Math.round(totalVICMSUFRemet * 100) / 100,
        },
      },
      pag: pagBlock,
    },
  };

  if (!dest) {
    return jsonResponse({ error: "Destinatário é obrigatório para NF-e modelo 55. Preencha os dados do destinatário." }, 400);
  }

  if (Object.keys(infAdic).length > 0) payload.infNFe.infAdic = infAdic;

  // ─── FISCAL RISK SCORING NF-e (via engine centralizado) ───
  const hasFallbackNfe = taxClassificationAuditNfe.some((a: any) => a.fallback);
  let riskResultNfe: FiscalRiskResult;
  try {
    riskResultNfe = calculateFiscalRisk({
      fallbackUsed: hasFallbackNfe,
      ncmWithoutRule: hasFallbackNfe,
      taxRuleAbsent: taxClassificationAuditNfe.length > 0 && taxClassificationAuditNfe.every((a: any) => a.fallback),
      difalApplied: applyDifal,
      difalRequired: isInterstate && !applyDifal && destDocDigits.length === 11,
      cpfInterstate: isInterstate && destDocDigits.length === 11,
      isInterstate,
      presenceAutoCorrected: indPres !== Number(form.presence_type),
      itemCount: items.length,
      totalValue: vNF,
    });
  } catch (engineErr: any) {
    console.error(`[emit-nfe] ✗ FALHA CRÍTICA no fiscal risk engine: ${engineErr.message}`);
    return jsonResponse({ error: "Erro interno no motor de risco fiscal. Emissão bloqueada por segurança." }, 500);
  }

  if (riskResultNfe.shouldBlock) {
    console.error(`[emit-nfe] ✗ BLOQUEIO POR RISCO FISCAL: score=${riskResultNfe.score}`);
    supabase.from("fiscal_risk_logs").insert({
      company_id, note_type: "nfe", score: riskResultNfe.score, level: riskResultNfe.level, reasons: riskResultNfe.reasons, blocked: true,
    }).then(() => {});
    return jsonResponse({ error: `Emissão NF-e bloqueada por risco fiscal elevado (score: ${riskResultNfe.score}). Corrija as regras tributárias.`, risk_score: riskResultNfe.score, risk_reasons: riskResultNfe.reasons }, 400);
  }

  console.log(`[emit-nfe] ▶ Emitindo NF-e #${numero} | CNPJ: ${cnpjClean} | CRT: ${crt} | Amb: ${ambiente} | Itens: ${items.length} | Total: ${vNF} | Finalidade: ${finNFe} | RiskScore: ${riskResultNfe.score}`);

  // ─── Autenticação Nuvem Fiscal ───
  const token = await getNuvemFiscalToken();
  const baseUrl = getApiBaseUrl();

  // ─── Garantir que a empresa tem config de NF-e na Nuvem Fiscal ───
  try {
    const checkResp = await safeFetch(`${baseUrl}/empresas/${cnpjClean}/nfe`, {
      headers: { Authorization: `Bearer ${token}` },
    }, 5000);

    if (checkResp.status === 404 || !checkResp.ok) {
      console.log(`[emit-nfe] Config NF-e não encontrada na Nuvem Fiscal. Criando...`);

      // Primeiro garantir que a empresa existe na Nuvem Fiscal
      const empresaPayload: any = {
        cpf_cnpj: cnpjClean,
        inscricao_estadual: ieEmitClean,
        nome_razao_social: sanitizeSefazText(company.name || company.trade_name, "EMITENTE"),
        nome_fantasia: sanitizeSefazText(company.trade_name || company.name, "EMITENTE"),
        endereco: {
          logradouro: sanitizeSefazText(company.street || company.address || "Rua não informada", "Rua não informada"),
          numero: company.number || company.address_number || "S/N",
          bairro: sanitizeSefazText(company.neighborhood || "Centro", "Centro"),
          codigo_municipio: ibgeClean,
          cidade: sanitizeSefazText(company.city || "Não informada", "Não informada"),
          uf: (company.state || "MA").toUpperCase(),
          cep: (company.zip_code || company.cep || "00000000").replace(/\D/g, ""),
          codigo_pais: "1058",
          pais: "Brasil",
        },
      };

      // Criar/atualizar empresa
      await safeFetch(`${baseUrl}/empresas`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(empresaPayload),
      }, 8000);

      // Configurar NF-e
      const nfeConfigPayload: any = {
        ambiente: ambiente === "producao" ? "producao" : "homologacao",
      };

      // Certificado A1 (se disponível)
      if (certificate_base64) {
        nfeConfigPayload.certificado = {
          base64: certificate_base64,
          password: certificate_password || "",
        };
      } else if (config.certificate_path) {
        // Tentar buscar certificado do storage
        try {
          const { data: certData } = await supabase.storage
            .from("company-backups")
            .download(config.certificate_path);
          if (certData) {
            const arrayBuf = await certData.arrayBuffer();
            const bytes = new Uint8Array(arrayBuf);
            let binary = "";
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            nfeConfigPayload.certificado = {
              base64: btoa(binary),
              password: config.certificate_password || "",
            };
          }
        } catch (certErr) {
          console.warn("[emit-nfe] Falha ao buscar certificado do storage:", certErr);
        }
      }

      const nfeConfigResp = await safeFetch(`${baseUrl}/empresas/${cnpjClean}/nfe`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(nfeConfigPayload),
      }, 8000);

      if (!nfeConfigResp.ok) {
        const errData = await nfeConfigResp.text().catch(() => "");
        console.error(`[emit-nfe] Falha ao configurar NF-e na Nuvem Fiscal:`, errData);
        return jsonResponse({
          error: `Falha ao configurar NF-e na Nuvem Fiscal. Verifique o certificado digital e tente novamente. Detalhe: ${errData.slice(0, 300)}`,
        }, 400);
      }

      console.log(`[emit-nfe] ✓ Config NF-e criada na Nuvem Fiscal para CNPJ ${cnpjClean}`);
    }
  } catch (configErr: any) {
    console.warn("[emit-nfe] Erro ao verificar/criar config NF-e na Nuvem Fiscal (tentando emitir mesmo assim):", configErr.message);
  }

  console.log(`[emit-nfe] ▶ Enviando para Nuvem Fiscal (NF-e)...`);

  // ─── Emissão NF-e com safeFetch ───
  const nfResp = await safeFetch(`${baseUrl}/nfe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }, 15000);

  const nfData = await parseResponseJsonSafe(nfResp, "emissão NF-e");

  console.log(`[emit-nfe] ◀ Resposta Nuvem Fiscal: status=${nfResp.status} | ${Date.now() - t0}ms`);

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
    const errMsg = validationHint ? `${baseErrMsg} — ${validationHint}` : baseErrMsg;
    console.error(`[emit-nfe] ✗ Erro Nuvem Fiscal [${nfResp.status}]:`, errMsg);

    const rejAccessKey = nfData?.chave || nfData?.chave_acesso || null;
    const rejProtocol = nfData?.protocolo || nfData?.numero_protocolo || null;
    const rejReason = nfData?.motivo || nfData?.xMotivo || errMsg;
    const rejCode = nfData?.codigo_status || nfData?.cStat || null;

    await supabase.from("fiscal_documents").insert({
      company_id, doc_type: "nfe", number: numero, serie: config.serie || 1,
      status: "rejeitada", total_value: vNF, environment: ambiente,
      customer_name: form.dest_name || null, customer_cpf_cnpj: destDoc || null,
      payment_method: mapTPagToLocalPaymentMethod(tPag), access_key: rejAccessKey, protocol_number: rejProtocol,
      rejection_reason: rejCode ? `[${rejCode}] ${rejReason}` : rejReason, is_contingency: false,
    });

    return jsonResponse({ success: false, error: errMsg, rejection_reason: rejReason, details: nfData }, 400);
  }

  // Detectar status
  const emissionStatus = resolveProviderFiscalStatus(nfData);
  const accessKey = emissionStatus.accessKey;
  const nuvemFiscalId = nfData.id || nfData.nuvem_fiscal_id || null;
  const protocolNumber = emissionStatus.protocolNumber;
  const finalStatus = emissionStatus.normalizedStatus;
  const providerReason = formatConsultReason(
    nfData || {},
    finalStatus === "rejeitada"
      ? "NF-e rejeitada pelo provedor fiscal"
      : finalStatus === "pendente"
        ? "NF-e recebida pelo provedor fiscal, aguardando autorização"
        : "",
  );

  // Salvar documento fiscal
  await supabase.from("fiscal_documents").insert({
    company_id, doc_type: "nfe", number: numero, serie: config.serie || 1,
    access_key: accessKey || null, protocol_number: protocolNumber || null,
    status: finalStatus, total_value: vNF, environment: ambiente,
    customer_name: form.dest_name || null, customer_cpf_cnpj: destDoc || null,
    payment_method: mapTPagToLocalPaymentMethod(tPag), is_contingency: emissionStatus.isContingency,
    rejection_reason: finalStatus === "rejeitada" ? providerReason || null : null,
  });

  // ─── Audit log de decisão fiscal ───
  await supabase.from("action_logs").insert({
    company_id,
    action: "fiscal_decision_nfe",
    module: "fiscal",
    details: JSON.stringify({
      numero, finalStatus,
      emitUF, destUF, crt, idDest, indPres, isInterstate,
      applyDifal, destIsContribuinte,
      difalValues: applyDifal && pICMSUFDest > pICMSInter ? {
        pICMSInter, pICMSUFDest, pFCPUFDest,
        totalVICMSUFDest: Math.round(totalVICMSUFDest * 100) / 100,
        totalVFCPUFDest: Math.round(totalVFCPUFDest * 100) / 100,
      } : null,
      totalVNF: vNF,
    }),
  }).then(() => {}).catch((e: any) => console.warn("[emit-nfe] Falha ao registrar audit log:", e.message));

  console.log(`[emit-nfe] ✓ NF-e #${numero} → ${finalStatus} | provider_status=${emissionStatus.statusStr || "(vazio)"} cStat=${emissionStatus.cStatStr || "(vazio)"} | reason=${providerReason || "(vazio)"} | Chave: ${accessKey?.substring(0, 20)}... | RiskScore: ${riskResultNfe.score} | ${Date.now() - t0}ms total`);

  // ─── Registrar risk log NF-e (não-bloqueante, via engine) ───
  supabase.from("fiscal_risk_logs").insert({
    company_id, note_id: accessKey || String(numero), note_type: "nfe",
    score: riskResultNfe.score, level: riskResultNfe.level, reasons: riskResultNfe.reasons, blocked: false,
  }).then(() => {});
  const nfeAlert = shouldGenerateAlert(riskResultNfe);
  if (nfeAlert.generate) {
    supabase.from("fiscal_alerts").insert({
      company_id, severity: nfeAlert.severity, score: riskResultNfe.score,
      title: `NF-e #${numero} com risco ${nfeAlert.severity}`,
      description: `Score: ${riskResultNfe.score}/100`,
      reasons: riskResultNfe.reasons,
    }).then(() => {});
  }

  return jsonResponse({
    success: finalStatus === "autorizada" || finalStatus === "contingencia",
    pending: finalStatus === "pendente",
    status: finalStatus,
    error: finalStatus === "rejeitada" ? providerReason || "NF-e rejeitada pelo provedor fiscal" : undefined,
    rejection_reason: finalStatus === "rejeitada" ? providerReason || undefined : undefined,
    details: nfData || undefined,
    number: numero,
    serie: String(config.serie || 1),
    access_key: accessKey,
    protocol: protocolNumber,
    nuvem_fiscal_id: nuvemFiscalId,
    resolved_items: resolvedItemsForReturn,
    emitente: {
      cpf_cnpj: cnpjClean,
      inscricao_estadual: ieEmitClean || null,
      nome_razao_social: sanitizeSefazText(company.name || company.trade_name, "EMITENTE"),
      nome_fantasia: sanitizeSefazText(company.trade_name || company.name, "EMITENTE"),
      telefone: company.phone || null,
      endereco: {
        logradouro: sanitizeSefazText(company.street || company.address_street || company.address || "Rua não informada", "Rua não informada"),
        numero: String(company.number || company.address_number || "S/N"),
        complemento: company.complement || company.address_complement || null,
        bairro: sanitizeSefazText(company.neighborhood || company.address_neighborhood || "Centro", "Centro"),
        cidade: sanitizeSefazText(company.city || company.address_city || "Não informada", "Não informada"),
        uf: String(company.state || company.address_state || "MA").toUpperCase(),
        cep: String(company.zip_code || company.address_zip || company.cep || "").replace(/\D/g, "") || null,
      },
    },
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
      .select("total, total_value, payments, payment_method, customer_name, client_name, counterpart, customer_doc, customer_cpf")
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
  const normalizedPayments = normalizePaymentsFromSaleData({
    paymentsRaw: saleRow.payments,
    fallbackMethod: saleRow.payment_method,
    fallbackAmount: saleTotal,
  });
  validateDetPagForEmission(normalizedPayments);
  const mainPay = normalizedPayments[0]?.tPag || "99";
  const change = normalizedPayments[0]?.change || 0;
  const fiscalPayments = normalizedPayments.map((payment) => payment.sanitized);

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
      customer_name: String(saleRow.customer_name ?? saleRow.client_name ?? saleRow.counterpart ?? "").trim() || undefined,
      customer_doc: String(saleRow.customer_doc ?? saleRow.customer_cpf ?? "").replace(/\D/g, "") || undefined,
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
  const consultStatus = resolveProviderFiscalStatus(data);
  const normalizedStatus = consultStatus.normalizedStatus;
  const providerReason = formatConsultReason(data, normalizedStatus === "rejeitada" ? "Rejeição confirmada no provedor fiscal" : "");

  if (company_id) {
    const docUpdate: Record<string, unknown> = {
      status: normalizedStatus,
      access_key: data.chave || access_key,
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
    access_key: data.chave || access_key, number: data.numero, rejection_reason: providerReason || undefined, details: data,
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
    const { data: company } = await supabase.from("companies").select("cnpj, parent_company_id")
      .eq("id", company_id).maybeSingle();
    let merged = await resolveCompanyFiscalRowWithParent(
      supabase,
      (company || {}) as Record<string, unknown>,
    );
    merged = await fillCompanyRowFromServicePeerFallback(supabase, merged, String(company_id));
    cnpj = onlyDigits(merged.cnpj);
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
    // health-check Edge Function faz POST sem JWT — evita 401 a cada minuto nos logs
    if (body.health_check === true) {
      return jsonResponse({ ok: true, service: "emit-nfce" });
    }
    const action = body.action || "emit";

    // Detectar chamadas do service_role (ex: process-fiscal-queue / cron)
    const { userId, isServiceCall } = await validateCaller(req);

    // Auth obrigatória para ações destrutivas — mas service_role pode chamar consult_status etc.
    const isAuthRequired = ["emit", "emit_nfe", "cancel", "backup_xmls"].includes(action) || Boolean(body.company_id);
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
      case "emit_nfe":
        return await handleEmitNfe(supabase, body);
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
