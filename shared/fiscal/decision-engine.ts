/**
 * Fiscal Decision Engine — Motor de Decisão Fiscal Centralizado
 * 
 * Responsável por:
 * 1. Resolução automática de CFOP baseado no cenário
 * 2. Detecção e cálculo obrigatório de DIFAL (EC 87/2015)
 * 3. Validação de coerência idDest × indPres
 * 4. Fail-safe: bloqueia emissão duvidosa
 * 
 * REGRA DE OURO: Se qualquer regra fiscal não puder ser determinada com certeza,
 * a emissão é BLOQUEADA. Nunca emitir nota "duvidosa".
 */

// ─── Tipos de entrada ───

export interface DecisionEmitente {
  uf: string;
  crt: number; // 1=Simples, 2=Simples Excesso, 3=Normal
}

export interface DecisionDestinatario {
  uf: string;
  doc: string;           // CPF ou CNPJ (apenas dígitos)
  ie?: string;           // Inscrição Estadual
  indIEDest?: number;    // 1=contribuinte, 2=isento, 9=não contribuinte
}

export interface DecisionProduto {
  name: string;
  ncm: string;
  cfop?: string;       // CFOP base cadastrado
  valor: number;
  cst?: string;
  csosn?: string;
  origem?: number;
  aliqIcms?: number;
}

export interface DecisionVenda {
  presenceType?: number; // 1=presencial, 2=internet, 3=telefone, 9=outros
  modelo: 55 | 65;       // NF-e ou NFC-e
}

export interface TaxRuleData {
  aliq_interestadual: number;
  aliq_interna_destino: number;
  fcp_percent: number;
}

// ─── Tipos de saída ───

export interface DifalCalculation {
  applies: boolean;
  vBCUFDest: number;
  pFCPUFDest: number;
  pICMSUFDest: number;
  pICMSInter: number;
  pICMSInterPart: number;
  vFCPUFDest: number;
  vICMSUFDest: number;
  vICMSUFRemet: number;
}

export interface FiscalDecision {
  cfop: string;
  idDest: number;
  indPres: number;
  isInterstate: boolean;
  requiresDifal: boolean;
  difal: DifalCalculation;
  icmsType: string;           // "normal" | "simples" | "st"
  appliedRules: string[];     // Descrição das regras aplicadas
}

export interface IntegrityIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  field?: string;
  autoFixed?: boolean;
  fixApplied?: string;
}

export interface IntegrityResult {
  valid: boolean;
  issues: IntegrityIssue[];
  decision?: FiscalDecision;
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  details: Record<string, unknown>;
  difalApplied: boolean;
  blocked: boolean;
  blockReason?: string;
}

// ─── Constantes ───

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

const VALID_UFS = new Set([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
  "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
  "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
]);

// ─── Funções auxiliares ───

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function getDefaultInterstateRate(ufOrigem: string, ufDestino: string): number {
  if (ufOrigem === ufDestino) return 0;
  if (SUL_SUDESTE.has(ufOrigem) && !SUL_SUDESTE.has(ufDestino)) return 7;
  return 12;
}

function resolveEffectiveFcpPercent(ufDestino: string, explicitPercent?: number | null): number {
  const uf = ufDestino.toUpperCase().trim();
  if (uf === "PI") return 0; // PI não tem FCP — previne Rejeição 793
  if (typeof explicitPercent === "number" && Number.isFinite(explicitPercent)) return explicitPercent;
  return FCP_UF[uf] || 0;
}

function isConsumidorFinal(dest: DecisionDestinatario): boolean {
  const doc = (dest.doc || "").replace(/\D/g, "");
  // CPF = sempre consumidor final
  if (doc.length === 11) return true;
  // indIEDest = 9 = não contribuinte = consumidor final
  if (dest.indIEDest === 9) return true;
  // CNPJ sem IE = não contribuinte
  const ie = (dest.ie || "").replace(/\D/g, "");
  if (doc.length === 14 && ie.length < 2) return true;
  return false;
}

function isContribuinte(dest: DecisionDestinatario): boolean {
  if (dest.indIEDest === 1) return true;
  const ie = (dest.ie || "").replace(/\D/g, "");
  const doc = (dest.doc || "").replace(/\D/g, "");
  return doc.length === 14 && ie.length >= 2;
}

// ─── 1. MOTOR DE DECISÃO FISCAL ───

export function makeFiscalDecision(
  emitente: DecisionEmitente,
  destinatario: DecisionDestinatario | null,
  produto: DecisionProduto,
  venda: DecisionVenda,
  taxRule?: TaxRuleData | null,
): FiscalDecision {
  const emitUF = (emitente.uf || "").toUpperCase().trim();
  const destUF = (destinatario?.uf || "").toUpperCase().trim();
  const appliedRules: string[] = [];

  // 1. Operação interna vs interestadual
  const isInterstate = destUF.length === 2 && VALID_UFS.has(destUF) && emitUF !== destUF;
  const idDest = isInterstate ? 2 : 1;
  appliedRules.push(`idDest=${idDest} (${isInterstate ? "interestadual" : "interna"})`);

  // 2. indPres — auto-correção para coerência
  let indPres = Number(venda.presenceType) || 1;
  if (![1, 2, 3, 4, 9].includes(indPres)) indPres = 1;

  // Regra de coerência: interestadual + presencial = auto-corrigir para não-presencial
  if (isInterstate && indPres === 1) {
    indPres = 2; // Internet/não presencial
    appliedRules.push("indPres auto-corrigido de 1→2 (interestadual não pode ser presencial)");
  }

  // NFC-e (mod 65) é sempre presencial ou teleentrega
  if (venda.modelo === 65 && ![1, 4].includes(indPres)) {
    indPres = 1;
    appliedRules.push("indPres forçado para 1 (NFC-e presencial)");
  }

  // 3. CFOP automático
  let cfop = (produto.cfop || "5102").trim();
  if (!/^\d{4}$/.test(cfop)) cfop = "5102";

  if (isInterstate && cfop.startsWith("5")) {
    const newCfop = "6" + cfop.substring(1);
    appliedRules.push(`CFOP auto-corrigido ${cfop}→${newCfop} (operação interestadual)`);
    cfop = newCfop;
  } else if (!isInterstate && cfop.startsWith("6")) {
    const newCfop = "5" + cfop.substring(1);
    appliedRules.push(`CFOP auto-corrigido ${cfop}→${newCfop} (operação interna)`);
    cfop = newCfop;
  }

  // NFC-e bloqueio de CFOP interestadual
  if (venda.modelo === 65 && !cfop.startsWith("5")) {
    const newCfop = "5" + cfop.substring(1);
    appliedRules.push(`CFOP forçado ${cfop}→${newCfop} (NFC-e só aceita 5xxx)`);
    cfop = newCfop;
  }

  // 4. Regime tributário
  const isSimples = emitente.crt === 1 || emitente.crt === 2;
  const icmsType = isSimples ? "simples" : "normal";

  // 5. DIFAL — EC 87/2015
  const requiresDifal = isInterstate && destinatario !== null && isConsumidorFinal(destinatario) && !isContribuinte(destinatario);
  let difal: DifalCalculation = {
    applies: false, vBCUFDest: 0, pFCPUFDest: 0, pICMSUFDest: 0,
    pICMSInter: 0, pICMSInterPart: 100, vFCPUFDest: 0,
    vICMSUFDest: 0, vICMSUFRemet: 0,
  };

  if (requiresDifal) {
    const aliqInter = taxRule?.aliq_interestadual ?? getDefaultInterstateRate(emitUF, destUF);
    const aliqInterna = taxRule?.aliq_interna_destino ?? (ALIQ_INTERNA_UF[destUF] || 18);
    const fcp = resolveEffectiveFcpPercent(destUF, taxRule?.fcp_percent ?? null);

    if (aliqInterna > aliqInter) {
      const vBCUFDest = round2(produto.valor);
      const difalTotal = round2(vBCUFDest * (aliqInterna - aliqInter) / 100);
      const vFCPUFDest = round2(vBCUFDest * fcp / 100);
      const vICMSUFDest = difalTotal; // 100% destino desde 2019
      const vICMSUFRemet = 0;

      difal = {
        applies: true,
        vBCUFDest,
        pFCPUFDest: fcp,
        pICMSUFDest: aliqInterna,
        pICMSInter: aliqInter,
        pICMSInterPart: 100,
        vFCPUFDest,
        vICMSUFDest,
        vICMSUFRemet,
      };
      appliedRules.push(`DIFAL aplicado: aliqInter=${aliqInter}% aliqInterna=${aliqInterna}% FCP=${fcp}%`);
    } else {
      appliedRules.push(`DIFAL não aplicável: aliqInterna(${aliqInterna}) <= aliqInter(${aliqInter})`);
    }
  } else if (isInterstate && destinatario) {
    appliedRules.push("DIFAL não aplicável: destinatário é contribuinte ICMS");
  }

  return {
    cfop,
    idDest,
    indPres,
    isInterstate,
    requiresDifal,
    difal,
    icmsType,
    appliedRules,
  };
}

// ─── 2. VALIDAÇÃO DE INTEGRIDADE FISCAL ───

export function validateFiscalIntegrity(
  emitente: DecisionEmitente,
  destinatario: DecisionDestinatario | null,
  produtos: DecisionProduto[],
  venda: DecisionVenda,
  taxRule?: TaxRuleData | null,
): IntegrityResult {
  const issues: IntegrityIssue[] = [];
  const emitUF = (emitente.uf || "").toUpperCase().trim();
  const destUF = (destinatario?.uf || "").toUpperCase().trim();
  const isInterstate = destUF.length === 2 && VALID_UFS.has(destUF) && emitUF !== destUF;

  // ── Validação do emitente ──
  if (!VALID_UFS.has(emitUF)) {
    issues.push({
      code: "EMIT_UF_INVALID",
      severity: "error",
      message: `UF do emitente "${emitUF}" inválida.`,
      field: "emitente.uf",
    });
  }

  if (![1, 2, 3].includes(emitente.crt)) {
    issues.push({
      code: "EMIT_CRT_INVALID",
      severity: "error",
      message: `CRT "${emitente.crt}" inválido. Deve ser 1 (Simples), 2 (Simples Excesso) ou 3 (Normal).`,
      field: "emitente.crt",
    });
  }

  // ── Validação do destinatário ──
  if (venda.modelo === 55 && !destinatario) {
    issues.push({
      code: "DEST_REQUIRED_NFE",
      severity: "error",
      message: "Destinatário é obrigatório para NF-e (modelo 55).",
      field: "destinatario",
    });
  }

  if (destinatario) {
    const doc = (destinatario.doc || "").replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14) {
      issues.push({
        code: "DEST_DOC_INVALID",
        severity: "error",
        message: `CPF/CNPJ do destinatário inválido (${doc.length} dígitos).`,
        field: "destinatario.doc",
      });
    }

    if (isInterstate && !VALID_UFS.has(destUF)) {
      issues.push({
        code: "DEST_UF_INVALID",
        severity: "error",
        message: `UF do destinatário "${destUF}" inválida para operação interestadual.`,
        field: "destinatario.uf",
      });
    }

    // ── Regra 1: idDest=2 + indPres=1 ──
    const rawIndPres = Number(venda.presenceType) || 1;
    if (isInterstate && rawIndPres === 1) {
      issues.push({
        code: "INTERSTATE_PRESENCIAL",
        severity: "warning",
        message: "Operação interestadual marcada como presencial. indPres será auto-corrigido para 2 (não presencial).",
        field: "venda.presenceType",
        autoFixed: true,
        fixApplied: "indPres: 1 → 2",
      });
    }

    // ── Regra 2: CPF + interestadual → forçar DIFAL ──
    if (isInterstate && doc.length === 11) {
      const aliqInter = taxRule?.aliq_interestadual ?? getDefaultInterstateRate(emitUF, destUF);
      const aliqInterna = taxRule?.aliq_interna_destino ?? (ALIQ_INTERNA_UF[destUF] || 18);
      if (aliqInterna > aliqInter) {
        issues.push({
          code: "DIFAL_REQUIRED_CPF",
          severity: "warning",
          message: `DIFAL será aplicado obrigatoriamente: CPF + operação interestadual (${emitUF}→${destUF}).`,
          field: "difal",
        });
      }
    }

    // ── Regra: CNPJ sem IE + interestadual → DIFAL obrigatório ──
    if (isInterstate && doc.length === 14 && !isContribuinte(destinatario)) {
      issues.push({
        code: "DIFAL_REQUIRED_CNPJ_SEM_IE",
        severity: "warning",
        message: `DIFAL será aplicado: CNPJ sem IE (não contribuinte) + operação interestadual (${emitUF}→${destUF}).`,
        field: "difal",
      });
    }
  }

  // ── Validação dos produtos ──
  for (let i = 0; i < produtos.length; i++) {
    const p = produtos[i];
    const ncm = (p.ncm || "").replace(/\D/g, "");

    if (!ncm || ncm.length !== 8 || ncm === "00000000") {
      issues.push({
        code: "PROD_NCM_INVALID",
        severity: "error",
        message: `Item ${i + 1} ("${p.name}"): NCM "${ncm || "(vazio)"}" inválido. Necessário 8 dígitos.`,
        field: `produtos[${i}].ncm`,
      });
    }

    const cfop = (p.cfop || "5102").trim();
    if (!/^\d{4}$/.test(cfop)) {
      issues.push({
        code: "PROD_CFOP_INVALID",
        severity: "error",
        message: `Item ${i + 1} ("${p.name}"): CFOP "${cfop}" inválido.`,
        field: `produtos[${i}].cfop`,
      });
    }

    // ── Regra 3: CFOP incompatível com cenário ──
    if (/^\d{4}$/.test(cfop)) {
      if (isInterstate && cfop.startsWith("5")) {
        issues.push({
          code: "CFOP_WRONG_DIRECTION",
          severity: "warning",
          message: `Item ${i + 1} ("${p.name}"): CFOP "${cfop}" é interno mas operação é interestadual. Será auto-corrigido para 6${cfop.substring(1)}.`,
          field: `produtos[${i}].cfop`,
          autoFixed: true,
          fixApplied: `${cfop} → 6${cfop.substring(1)}`,
        });
      }
      if (!isInterstate && cfop.startsWith("6")) {
        issues.push({
          code: "CFOP_WRONG_DIRECTION",
          severity: "warning",
          message: `Item ${i + 1} ("${p.name}"): CFOP "${cfop}" é interestadual mas operação é interna. Será auto-corrigido para 5${cfop.substring(1)}.`,
          field: `produtos[${i}].cfop`,
          autoFixed: true,
          fixApplied: `${cfop} → 5${cfop.substring(1)}`,
        });
      }
      if (venda.modelo === 65 && !cfop.startsWith("5")) {
        issues.push({
          code: "CFOP_NFCE_INTERSTATE",
          severity: "error",
          message: `Item ${i + 1} ("${p.name}"): NFC-e (mod 65) não aceita CFOP interestadual "${cfop}".`,
          field: `produtos[${i}].cfop`,
          autoFixed: true,
          fixApplied: `${cfop} → 5${cfop.substring(1)}`,
        });
      }
    }

    // Origem
    const origem = p.origem;
    if (origem === undefined || origem === null || origem < 0 || origem > 8) {
      issues.push({
        code: "PROD_ORIGEM_INVALID",
        severity: "error",
        message: `Item ${i + 1} ("${p.name}"): Origem "${origem}" inválida. Aceito: 0 a 8.`,
        field: `produtos[${i}].origem`,
      });
    }

    // Valor
    if (!p.valor || p.valor <= 0) {
      issues.push({
        code: "PROD_VALOR_ZERO",
        severity: "error",
        message: `Item ${i + 1} ("${p.name}"): Valor do produto inválido (${p.valor}).`,
        field: `produtos[${i}].valor`,
      });
    }
  }

  // ── Fail-safe: NF-e interestadual sem UF destino ──
  if (venda.modelo === 55 && destinatario && !destUF) {
    issues.push({
      code: "DEST_UF_MISSING",
      severity: "error",
      message: "UF do destinatário é obrigatória para NF-e. Preencha o endereço completo.",
      field: "destinatario.uf",
    });
  }

  const hasErrors = issues.some(i => i.severity === "error");

  // Se válido, calcular a decisão fiscal
  let decision: FiscalDecision | undefined;
  if (!hasErrors && produtos.length > 0) {
    // Usar o primeiro produto como referência para a decisão global
    decision = makeFiscalDecision(emitente, destinatario, produtos[0], venda, taxRule);
  }

  return {
    valid: !hasErrors,
    issues,
    decision,
  };
}

// ─── 3. AUDIT LOG BUILDER ───

export function buildFiscalAuditEntry(params: {
  action: string;
  emitente: DecisionEmitente;
  destinatario: DecisionDestinatario | null;
  modelo: 55 | 65;
  decision?: FiscalDecision;
  integrityResult?: IntegrityResult;
  blocked: boolean;
  blockReason?: string;
}): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    action: params.action,
    details: {
      emitUF: params.emitente.uf,
      destUF: params.destinatario?.uf || null,
      destDoc: params.destinatario?.doc ? `***${(params.destinatario.doc || "").slice(-4)}` : null,
      modelo: params.modelo,
      crt: params.emitente.crt,
      cfop: params.decision?.cfop || null,
      idDest: params.decision?.idDest || null,
      indPres: params.decision?.indPres || null,
      isInterstate: params.decision?.isInterstate || false,
      requiresDifal: params.decision?.requiresDifal || false,
      difalValues: params.decision?.difal.applies ? {
        vBCUFDest: params.decision.difal.vBCUFDest,
        vICMSUFDest: params.decision.difal.vICMSUFDest,
        vFCPUFDest: params.decision.difal.vFCPUFDest,
      } : null,
      appliedRules: params.decision?.appliedRules || [],
      issues: params.integrityResult?.issues.map(i => ({
        code: i.code,
        severity: i.severity,
        autoFixed: i.autoFixed || false,
      })) || [],
    },
    difalApplied: params.decision?.difal.applies || false,
    blocked: params.blocked,
    blockReason: params.blockReason,
  };
}
