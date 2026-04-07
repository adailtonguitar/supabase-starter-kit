/**
 * Tax Classification Engine — Motor de Classificação Tributária por NCM
 * 
 * Determina automaticamente CST/CSOSN, alíquota, redução de base,
 * ST e regra fiscal aplicada com base em NCM, UF e regime tributário.
 */

// ─── Tipos ───

export interface TaxRuleByNcm {
  id?: string;
  ncm: string;
  uf_origem: string;
  uf_destino: string;        // "*" = qualquer
  regime: "simples" | "normal";
  tipo_cliente: "cpf" | "cnpj_contribuinte" | "cnpj_nao_contribuinte" | "*";
  cst: string | null;        // para regime normal
  csosn: string | null;      // para simples
  icms_aliquota: number;
  icms_reducao_base: number;  // percentual de redução (0–100)
  icms_st: boolean;
  mva: number;               // MVA% para ST
  fcp: number;
  observacoes: string | null;
}

export interface TaxClassificationInput {
  ncm: string;
  uf_origem: string;
  uf_destino: string;
  crt: number;              // 1=Simples, 2=Simples Excesso, 3=Normal
  tipo_cliente: "cpf" | "cnpj_contribuinte" | "cnpj_nao_contribuinte";
  valor: number;
}

export interface TaxClassificationResult {
  cst_or_csosn: string;
  icms_type: "normal" | "st" | "isento" | "reducao" | "st_reducao";
  aliquota: number;
  base_calculo: number;
  base_reduzida: boolean;
  icms_valor: number;
  icms_st: boolean;
  icms_st_base: number;
  icms_st_valor: number;
  mva: number;
  fcp: number;
  applied_rule_id: string | null;
  fallback_used: boolean;
  warnings: string[];
}

// ─── Fallback seguro ───

function buildFallback(input: TaxClassificationInput): TaxClassificationResult {
  const isSimples = input.crt === 1 || input.crt === 2;
  return {
    cst_or_csosn: isSimples ? "102" : "00",
    icms_type: "normal",
    aliquota: 0,
    base_calculo: input.valor,
    base_reduzida: false,
    icms_valor: 0,
    icms_st: false,
    icms_st_base: 0,
    icms_st_valor: 0,
    mva: 0,
    fcp: 0,
    applied_rule_id: null,
    fallback_used: true,
    warnings: [`NCM ${input.ncm} sem regra tributária definida — fallback seguro aplicado`],
  };
}

// ─── Busca de regra ───

export function findBestRule(rules: TaxRuleByNcm[], input: TaxClassificationInput): TaxRuleByNcm | null {
  const ncm = (input.ncm || "").replace(/\D/g, "").trim();
  const regime = (input.crt === 1 || input.crt === 2) ? "simples" : "normal";
  const ufO = input.uf_origem.toUpperCase().trim();
  const ufD = input.uf_destino.toUpperCase().trim();

  // Score-based matching: more specific = higher score
  let bestRule: TaxRuleByNcm | null = null;
  let bestScore = -1;

  for (const rule of rules) {
    const rNcm = (rule.ncm || "").replace(/\D/g, "").trim();
    
    // NCM must match (exact or prefix)
    if (!ncm.startsWith(rNcm) && rNcm !== "*") continue;
    
    // Regime must match
    if (rule.regime !== regime) continue;

    let score = 0;

    // UF origem
    if (rule.uf_origem === ufO) score += 10;
    else if (rule.uf_origem === "*") score += 1;
    else continue;

    // UF destino
    if (rule.uf_destino === ufD) score += 10;
    else if (rule.uf_destino === "*") score += 1;
    else continue;

    // Tipo cliente
    if (rule.tipo_cliente === input.tipo_cliente) score += 5;
    else if (rule.tipo_cliente === "*") score += 1;
    else continue;

    // NCM length (more specific = better)
    score += rNcm.length;

    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  return bestRule;
}

// ─── Engine Principal ───

export function classifyTaxByNCM(
  input: TaxClassificationInput,
  rules: TaxRuleByNcm[],
): TaxClassificationResult {
  const warnings: string[] = [];
  const ncm = (input.ncm || "").replace(/\D/g, "").trim();

  // Validação básica
  if (!ncm || ncm.length < 2) {
    return {
      ...buildFallback(input),
      warnings: ["NCM ausente ou inválido — fallback aplicado"],
    };
  }

  const rule = findBestRule(rules, input);

  if (!rule) {
    return buildFallback(input);
  }

  const isSimples = input.crt === 1 || input.crt === 2;
  
  // Regra 1 — CST ou CSOSN por regime
  const cst_or_csosn = isSimples
    ? (rule.csosn || "102")
    : (rule.cst || "00");

  // Regra 3 — Redução de base
  const reducao = rule.icms_reducao_base > 0 ? rule.icms_reducao_base / 100 : 0;
  const baseCalculo = round2(input.valor * (1 - reducao));
  const base_reduzida = reducao > 0;

  // ICMS próprio
  const aliquota = rule.icms_aliquota;
  const icmsValor = round2(baseCalculo * aliquota / 100);

  // Regra 2 — Substituição Tributária
  let icms_st = rule.icms_st;
  let icms_st_base = 0;
  let icms_st_valor = 0;

  if (icms_st && rule.mva > 0) {
    icms_st_base = round2(input.valor * (1 + rule.mva / 100));
    const stTotal = round2(icms_st_base * aliquota / 100);
    icms_st_valor = Math.max(0, round2(stTotal - icmsValor));
  }

  // Determinar tipo
  let icms_type: TaxClassificationResult["icms_type"] = "normal";
  if (icms_st && base_reduzida) icms_type = "st_reducao";
  else if (icms_st) icms_type = "st";
  else if (base_reduzida) icms_type = "reducao";
  else if (aliquota === 0) icms_type = "isento";

  return {
    cst_or_csosn,
    icms_type,
    aliquota,
    base_calculo: baseCalculo,
    base_reduzida,
    icms_valor: icmsValor,
    icms_st,
    icms_st_base,
    icms_st_valor,
    mva: rule.mva,
    fcp: rule.fcp,
    applied_rule_id: rule.id || null,
    fallback_used: false,
    warnings,
  };
}

// ─── Validação de consistência ───

export interface TaxValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export function validateTaxClassification(result: TaxClassificationResult): TaxValidationError[] {
  const errors: TaxValidationError[] = [];

  if (result.fallback_used) {
    errors.push({
      field: "ncm",
      message: result.warnings[0] || "NCM sem regra tributária",
      severity: "warning",
    });
  }

  if (result.icms_st && result.mva <= 0) {
    errors.push({
      field: "mva",
      message: "ST ativo mas MVA não definido — cálculo ST impossível",
      severity: "error",
    });
  }

  if (result.aliquota < 0 || result.aliquota > 100) {
    errors.push({
      field: "aliquota",
      message: `Alíquota fora do range válido: ${result.aliquota}%`,
      severity: "error",
    });
  }

  if (result.icms_st_valor < 0) {
    errors.push({
      field: "icms_st_valor",
      message: "Valor de ICMS-ST negativo — regra inconsistente",
      severity: "error",
    });
  }

  return errors;
}

export function hasCriticalTaxErrors(errors: TaxValidationError[]): boolean {
  return errors.some(e => e.severity === "error");
}

// ─── Helper ───

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── Audit helper ───

export interface TaxAuditEntry {
  ncm: string;
  rule_id: string | null;
  classification: string; // icms_type
  fallback: boolean;
  cst_or_csosn: string;
  aliquota: number;
  st_applied: boolean;
}

export function buildTaxAuditEntry(input: TaxClassificationInput, result: TaxClassificationResult): TaxAuditEntry {
  return {
    ncm: input.ncm,
    rule_id: result.applied_rule_id,
    classification: result.icms_type,
    fallback: result.fallback_used,
    cst_or_csosn: result.cst_or_csosn,
    aliquota: result.aliquota,
    st_applied: result.icms_st,
  };
}
