/**
 * Tax Classification Engine — Motor de Classificação Tributária por NCM
 * 
 * Score-based matching com pontuação precisa por NCM, UF, regime e tipo de cliente.
 * Fail-safe: score < 50 → fallback com warning.
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

export type ConfidenceLevel = "high" | "medium" | "low";

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
  match_score?: number;
  match_log?: MatchDecisionLog;
  confidence_level: ConfidenceLevel;
  confidence_reason: string;
}

// ─── Match Decision Log ───

export interface RuleCandidateScore {
  rule_id: string | null;
  ncm: string;
  score: number;
  breakdown: string[];
}

export interface MatchDecisionLog {
  chosen_score: number;
  chosen_rule_id: string | null;
  reason: string;
  top_candidates: RuleCandidateScore[];
}

// ─── Fallback seguro ───

function buildFallback(input: TaxClassificationInput, reason?: string): TaxClassificationResult {
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
    warnings: [reason || `NCM ${input.ncm} sem regra tributária definida — fallback seguro aplicado`],
    match_score: 0,
    confidence_level: "low",
    confidence_reason: "Fallback — nenhuma regra aplicável encontrada",
  };
}

// ─── Confidence Level ───

function computeConfidence(rule: TaxRuleByNcm, ncm: string): { level: ConfidenceLevel; reason: string } {
  const rNcm = (rule.ncm || "").replace(/\D/g, "").trim();
  const isNcmExact = rNcm === ncm && rNcm.length === 8;
  const isNcmPartial = !isNcmExact && rNcm !== "*" && rNcm.length >= 4;
  const isNcmWild = rNcm === "*" || rNcm.length < 4;
  const isUfOrigExact = rule.uf_origem !== "*";
  const isUfDestExact = rule.uf_destino !== "*";
  const isTipoExact = rule.tipo_cliente !== "*";

  // HIGH: NCM exato + ambas UFs exatas + tipo exato
  if (isNcmExact && isUfOrigExact && isUfDestExact && isTipoExact) {
    return { level: "high", reason: "NCM exato, UFs exatas, tipo cliente exato" };
  }
  // HIGH: NCM exato + pelo menos 2 campos exatos
  const exactCount = (isUfOrigExact ? 1 : 0) + (isUfDestExact ? 1 : 0) + (isTipoExact ? 1 : 0);
  if (isNcmExact && exactCount >= 2) {
    return { level: "high", reason: "NCM exato com boa especificidade de UF/tipo" };
  }

  // MEDIUM: NCM parcial (4+ dígitos) + pelo menos uma UF exata
  if (isNcmPartial && (isUfOrigExact || isUfDestExact)) {
    return { level: "medium", reason: "NCM parcial com pelo menos uma UF exata" };
  }
  // MEDIUM: NCM exato mas campos genéricos
  if (isNcmExact && exactCount < 2) {
    return { level: "medium", reason: "NCM exato mas UFs/tipo genéricos" };
  }

  // LOW: wildcard ou NCM < 4 dígitos ou múltiplos campos genéricos
  const genericCount = (isNcmWild ? 1 : 0) + (!isUfOrigExact ? 1 : 0) + (!isUfDestExact ? 1 : 0) + (!isTipoExact ? 1 : 0);
  if (isNcmWild || genericCount >= 3) {
    return { level: "low", reason: isNcmWild ? "NCM wildcard ou muito curto" : "Múltiplos campos genéricos" };
  }

  return { level: "medium", reason: "Especificidade parcial" };
}

// ─── Score-based Rule Matching ───

const MIN_SCORE_THRESHOLD = 50;

interface ScoredRule {
  rule: TaxRuleByNcm;
  score: number;
  breakdown: string[];
}

function scoreRule(rule: TaxRuleByNcm, ncm: string, ufO: string, ufD: string, regime: string, tipoCliente: string): ScoredRule | null {
  const rawNcm = (rule.ncm || "").trim();
  const rNcm = rawNcm === "*" ? "*" : rawNcm.replace(/\D/g, "").trim();
  const breakdown: string[] = [];
  let score = 0;

  // ── NCM matching ──
  if (rNcm === "*") {
    score += 10;
    breakdown.push("NCM genérico (*): +10");
  } else if (rNcm === ncm) {
    score += 100;
    breakdown.push(`NCM exato (${rNcm}): +100`);
  } else if (ncm.startsWith(rNcm) && rNcm.length >= 4) {
    score += 60;
    breakdown.push(`NCM parcial (${rNcm}→${ncm}): +60`);
  } else if (ncm.startsWith(rNcm) && rNcm.length >= 2) {
    score += 30;
    breakdown.push(`NCM prefixo curto (${rNcm}): +30`);
  } else {
    return null; // NCM não compatível
  }

  // ── Regime ──
  if (rule.regime !== regime) return null; // obrigatório
  score += 40;
  breakdown.push(`Regime ${regime}: +40`);

  // ── UF origem ──
  if (rule.uf_origem === ufO) {
    score += 30;
    breakdown.push(`UF origem exata (${ufO}): +30`);
  } else if (rule.uf_origem === "*") {
    score += 5;
    breakdown.push("UF origem genérica (*): +5");
  } else {
    return null; // UF incompatível
  }

  // ── UF destino ──
  if (rule.uf_destino === ufD) {
    score += 30;
    breakdown.push(`UF destino exata (${ufD}): +30`);
  } else if (rule.uf_destino === "*") {
    score += 5;
    breakdown.push("UF destino genérica (*): +5");
  } else {
    return null; // UF incompatível
  }

  // ── Tipo cliente ──
  if (rule.tipo_cliente === tipoCliente) {
    score += 30;
    breakdown.push(`Tipo cliente exato (${tipoCliente}): +30`);
  } else if (rule.tipo_cliente === "*") {
    score += 5;
    breakdown.push("Tipo cliente genérico (*): +5");
  } else {
    return null; // tipo incompatível
  }

  return { rule, score, breakdown };
}

export function findBestRule(
  rules: TaxRuleByNcm[],
  input: TaxClassificationInput,
): { rule: TaxRuleByNcm | null; log: MatchDecisionLog } {
  const ncm = (input.ncm || "").replace(/\D/g, "").trim();
  const regime = (input.crt === 1 || input.crt === 2) ? "simples" : "normal";
  const ufO = input.uf_origem.toUpperCase().trim();
  const ufD = input.uf_destino.toUpperCase().trim();

  const scored: ScoredRule[] = [];

  for (const rule of rules) {
    const result = scoreRule(rule, ncm, ufO, ufD, regime, input.tipo_cliente);
    if (result) scored.push(result);
  }

  // Sort descending by score, then by NCM specificity (longer = better), then UF specificity
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aNcmLen = (a.rule.ncm || "").replace(/\D/g, "").length;
    const bNcmLen = (b.rule.ncm || "").replace(/\D/g, "").length;
    if (bNcmLen !== aNcmLen) return bNcmLen - aNcmLen;
    const aUfSpec = (a.rule.uf_origem !== "*" ? 1 : 0) + (a.rule.uf_destino !== "*" ? 1 : 0);
    const bUfSpec = (b.rule.uf_origem !== "*" ? 1 : 0) + (b.rule.uf_destino !== "*" ? 1 : 0);
    return bUfSpec - aUfSpec;
  });

  const top3: RuleCandidateScore[] = scored.slice(0, 3).map(s => ({
    rule_id: s.rule.id || null,
    ncm: s.rule.ncm,
    score: s.score,
    breakdown: s.breakdown,
  }));

  const best = scored[0] || null;

  const log: MatchDecisionLog = {
    chosen_score: best?.score || 0,
    chosen_rule_id: best?.rule.id || null,
    reason: !best
      ? "Nenhuma regra compatível encontrada"
      : best.score < MIN_SCORE_THRESHOLD
        ? `Score ${best.score} abaixo do mínimo (${MIN_SCORE_THRESHOLD}) — fallback aplicado`
        : `Regra ${best.rule.id || best.rule.ncm} selecionada com score ${best.score}`,
    top_candidates: top3,
  };

  // Fail-safe: score abaixo do threshold → fallback
  if (!best || best.score < MIN_SCORE_THRESHOLD) {
    return { rule: null, log };
  }

  return { rule: best.rule, log };
}

// ─── Engine Principal ───

export function classifyTaxByNCM(
  input: TaxClassificationInput,
  rules: TaxRuleByNcm[],
): TaxClassificationResult {
  const ncm = (input.ncm || "").replace(/\D/g, "").trim();

  if (!ncm || ncm.length < 2) {
    return {
      ...buildFallback(input, "NCM ausente ou inválido — fallback aplicado"),
    };
  }

  const { rule, log } = findBestRule(rules, input);

  if (!rule) {
    const fb = buildFallback(input);
    if (log.chosen_score > 0 && log.chosen_score < MIN_SCORE_THRESHOLD) {
      fb.warnings.push(`Regra fraca encontrada (score: ${log.chosen_score}/${MIN_SCORE_THRESHOLD}) — fallback forçado`);
    }
    fb.match_log = log;
    return fb;
  }

  // ── Confidence check ──
  const confidence = computeConfidence(rule, ncm);

  // LOW confidence → forçar fallback com warning
  if (confidence.level === "low") {
    const fb = buildFallback(input, `Regra com baixa confiança — revisão recomendada (${confidence.reason})`);
    fb.match_log = log;
    fb.confidence_level = "low";
    fb.confidence_reason = confidence.reason;
    fb.warnings.push(`Regra ${rule.id || rule.ncm} descartada por confiança baixa (score: ${log.chosen_score}, motivo: ${confidence.reason})`);
    return fb;
  }

  const isSimples = input.crt === 1 || input.crt === 2;
  const cst_or_csosn = isSimples ? (rule.csosn || "102") : (rule.cst || "00");

  // Redução de base
  const reducao = rule.icms_reducao_base > 0 ? rule.icms_reducao_base / 100 : 0;
  const baseCalculo = round2(input.valor * (1 - reducao));
  const base_reduzida = reducao > 0;

  // ICMS próprio
  const aliquota = rule.icms_aliquota;
  const icmsValor = round2(baseCalculo * aliquota / 100);

  // ST
  let icms_st = rule.icms_st;
  let icms_st_base = 0;
  let icms_st_valor = 0;
  if (icms_st && rule.mva > 0) {
    icms_st_base = round2(input.valor * (1 + rule.mva / 100));
    const stTotal = round2(icms_st_base * aliquota / 100);
    icms_st_valor = Math.max(0, round2(stTotal - icmsValor));
  }

  let icms_type: TaxClassificationResult["icms_type"] = "normal";
  if (icms_st && base_reduzida) icms_type = "st_reducao";
  else if (icms_st) icms_type = "st";
  else if (base_reduzida) icms_type = "reducao";
  else if (aliquota === 0) icms_type = "isento";

  const warnings: string[] = [];
  if (confidence.level === "medium") {
    warnings.push(`Confiança média na regra tributária: ${confidence.reason}`);
  }

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
    match_score: log.chosen_score,
    match_log: log,
    confidence_level: confidence.level,
    confidence_reason: confidence.reason,
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
  classification: string;
  fallback: boolean;
  cst_or_csosn: string;
  aliquota: number;
  st_applied: boolean;
  match_score: number;
  top_candidates: RuleCandidateScore[];
  confidence_level: ConfidenceLevel;
  confidence_reason: string;
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
    match_score: result.match_score || 0,
    top_candidates: result.match_log?.top_candidates || [],
    confidence_level: result.confidence_level,
    confidence_reason: result.confidence_reason,
  };
}
