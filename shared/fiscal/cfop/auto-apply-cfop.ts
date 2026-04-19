/**
 * auto-apply-cfop — Camada de decisão segura para auto-aplicação de CFOP.
 *
 * REGRAS ABSOLUTAS:
 *   • NÃO altera XML. NÃO altera emit-nfce. NÃO bloqueia emissão.
 *   • Default = sugestão apenas (compatível com comportamento atual).
 *   • Auto-aplicação SOMENTE quando feature flag ON + métricas validadas + safety rules OK.
 *
 * Casos suportados (apenas com flag ON):
 *   1. CFOP vazio                       → aplica
 *   2. CFOP === padrão antigo (5101) e produto é revenda → aplica (correção segura)
 *   3. CFOP já correto                  → mantém
 *   4. CFOP manual diferente            → mantém (apenas sugere)
 *
 * Safety (NUNCA auto-aplica):
 *   • CFOP atual ou sugerido envolve ST (5/6/7 4xx)
 *   • Operação interestadual (sugerido começa com 6 ou 7)
 *   • taxa_aceitacao < 0.95  OU  volume < 30
 */

import { resolveCfop, type ResolveCfopInput, type ResolveCfopResult } from "./resolve-cfop";
import { isAutoCfopEnabled } from "./cfop-feature-flag";
import { appendLog, getAcceptanceMetrics } from "./cfop-suggestion-log";

const MIN_VOLUME = 30;
const MIN_ACCEPTANCE = 0.95;
const LEGACY_DEFAULT_CFOPS = new Set(["5101"]); // padrão antigo aplicado incorretamente em revenda

const ST_CFOP_REGEX = /^[567]4\d{2}$/; // 5400-5499, 6400-6499, 7400-7499 = ST
const INTERSTATE_PREFIX = new Set(["6", "7"]);

export type AutoApplyDecision =
  | "applied_empty"
  | "applied_legacy_fix"
  | "kept_correct"
  | "kept_manual"
  | "kept_disabled"
  | "kept_unsafe_st"
  | "kept_unsafe_interstate"
  | "kept_low_confidence";

export interface AutoApplyInput {
  companyId: string;
  userId: string | null;
  productId: string;
  /** CFOP atual gravado no produto (pode ser vazio). */
  currentCfop: string | null | undefined;
  /** Dados para resolver sugestão. */
  produto: ResolveCfopInput;
}

export interface AutoApplyResult {
  cfop: string;            // valor final a usar (NUNCA vazio)
  changed: boolean;        // se mudou em relação ao currentCfop
  decision: AutoApplyDecision;
  suggestion: ResolveCfopResult;
  reason: string;
}

function isStCfop(cfop: string | null | undefined): boolean {
  if (!cfop) return false;
  return ST_CFOP_REGEX.test(cfop);
}

function isInterstate(cfop: string | null | undefined): boolean {
  if (!cfop) return false;
  return INTERSTATE_PREFIX.has(cfop.charAt(0));
}

function normalizeCfop(v: string | null | undefined): string {
  return (v ?? "").toString().replace(/\D/g, "");
}

/**
 * Decide o CFOP final SEM modificar o produto (puro).
 * Quem chama deve aplicar e persistir o log.
 */
export function decideAutoApplyCfop(input: AutoApplyInput): AutoApplyResult {
  const suggestion = resolveCfop(input.produto);
  const current = normalizeCfop(input.currentCfop);
  const enabled = isAutoCfopEnabled(input.companyId);

  // Flag desligada → sempre mantém comportamento atual
  if (!enabled) {
    const final = current || suggestion.cfop;
    return {
      cfop: final,
      changed: false,
      decision: "kept_disabled",
      suggestion,
      reason: "auto_cfop_enabled=false (somente sugestão)",
    };
  }

  // Safety: nunca auto-aplica em ST ou interestadual
  if (isStCfop(current) || isStCfop(suggestion.cfop)) {
    return {
      cfop: current || suggestion.cfop,
      changed: false,
      decision: "kept_unsafe_st",
      suggestion,
      reason: "CFOP envolve ST — auto-aplicação bloqueada por segurança",
    };
  }
  if (isInterstate(current) || isInterstate(suggestion.cfop)) {
    return {
      cfop: current || suggestion.cfop,
      changed: false,
      decision: "kept_unsafe_interstate",
      suggestion,
      reason: "Operação interestadual — auto-aplicação bloqueada por segurança",
    };
  }

  // Métricas: exige volume + taxa de aceitação
  const m = getAcceptanceMetrics(input.companyId);
  const trustOk = m.total >= MIN_VOLUME && m.taxa_aceitacao >= MIN_ACCEPTANCE;

  // Caso 4: CFOP manual diferente da sugestão (e válido) → respeita
  if (current && current !== suggestion.cfop && !LEGACY_DEFAULT_CFOPS.has(current)) {
    return {
      cfop: current,
      changed: false,
      decision: "kept_manual",
      suggestion,
      reason: "CFOP manual respeitado",
    };
  }

  // Caso 3: já está correto
  if (current === suggestion.cfop) {
    return {
      cfop: current,
      changed: false,
      decision: "kept_correct",
      suggestion,
      reason: "CFOP já correto",
    };
  }

  // Casos 1 e 2: aplicáveis, mas só se a confiança histórica for suficiente
  if (!trustOk) {
    return {
      cfop: current || suggestion.cfop,
      changed: false,
      decision: "kept_low_confidence",
      suggestion,
      reason: `Confiança insuficiente (volume=${m.total}/${MIN_VOLUME}, taxa=${(m.taxa_aceitacao * 100).toFixed(1)}%/${MIN_ACCEPTANCE * 100}%)`,
    };
  }

  // Caso 1: CFOP vazio → aplica
  if (!current) {
    return {
      cfop: suggestion.cfop,
      changed: true,
      decision: "applied_empty",
      suggestion,
      reason: "CFOP estava vazio",
    };
  }

  // Caso 2: CFOP é padrão antigo (5101) mas produto é revenda → corrige
  if (LEGACY_DEFAULT_CFOPS.has(current) && suggestion.cfop !== current) {
    return {
      cfop: suggestion.cfop,
      changed: true,
      decision: "applied_legacy_fix",
      suggestion,
      reason: `CFOP legado ${current} corrigido para ${suggestion.cfop}`,
    };
  }

  // Fallback defensivo
  return {
    cfop: current,
    changed: false,
    decision: "kept_correct",
    suggestion,
    reason: "Sem ação aplicável",
  };
}

/**
 * Versão com side-effect: decide + persiste log local de telemetria.
 * Use ANTES de montar o payload fiscal. NÃO modifica produto no banco.
 */
export function autoApplyCfop(input: AutoApplyInput): AutoApplyResult {
  const result = decideAutoApplyCfop(input);
  appendLog({
    company_id: input.companyId,
    user_id: input.userId,
    product_id: input.productId,
    cfop_sugerido: result.suggestion.cfop,
    cfop_original: normalizeCfop(input.currentCfop) || null,
    foi_aplicado: result.changed,
    usuario_alterou_depois: false,
  });
  return result;
}
