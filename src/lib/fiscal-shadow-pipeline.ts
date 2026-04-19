/**
 * fiscal-shadow-pipeline — Camada SHADOW (observação + sugestão segura)
 *
 * REGRAS ABSOLUTAS:
 *  - NÃO altera XML.
 *  - NÃO altera emit-nfce.
 *  - NÃO sobrescreve campos manuais existentes.
 *  - NÃO bloqueia emissão.
 *  - Em qualquer falha → retorna o item original intacto.
 *
 * Modo padrão: SHADOW (apenas log). Para aplicar merge seguro de campos vazios,
 * passe `apply: true` (preenche SOMENTE campos vazios / fallback genérico).
 */
import { resolveCfop } from "../../shared/fiscal/cfop/resolve-cfop";
import { resolveTaxRule, type TaxRuleResolved } from "./tax-rule-resolver";
import { recordFiscalAuditEvent } from "./fiscal-audit-store";

export interface ShadowItemInput {
  product_id?: string | null;
  /** Tipo de item (revenda | producao). Se ausente, helper assume revenda. */
  tipo_item?: string | null;
  ncm?: string | null;
  cfop?: string | null;
  cfop_manual?: string | null;
  csosn?: string | null;
  cst_icms?: string | null;
  origem?: number | string | null;
  cst_pis?: string | null;
  cst_cofins?: string | null;
  /** Categoria fiscal (opcional, melhora match no RPC). */
  categoria_fiscal_tipo?: string | null;
}

export interface ShadowContext {
  companyId: string | null | undefined;
  regime: "simples" | "normal" | "*";
  ufOrigem?: string | null;
  ufDestino?: string | null;
}

export interface ShadowResult<T extends ShadowItemInput> {
  item: T;                                 // item final (igual ao original em modo shadow)
  cfop_suggestion: string;
  tax_rule?: TaxRuleResolved;
  applied_fields: string[];
  skipped_fields: string[];
  divergences: Array<{ field: string; current: any; suggested: any }>;
}

/** Considera valor "vazio ou fallback genérico" — passível de preenchimento seguro. */
function isEmptyOrGeneric(field: string, value: any): boolean {
  if (value === null || value === undefined || value === "") return true;
  const s = String(value).trim();
  if (s === "") return true;
  // Fallbacks genéricos conhecidos
  if (field === "cst_pis" || field === "cst_cofins") return s === "49";
  if (field === "csosn") return s === "102";
  if (field === "cfop") return s === "5102";
  return false;
}

/**
 * Roda o pipeline shadow para UM item.
 * - Sempre loga (CFOP_PIPELINE + TAX_RULE_PIPELINE).
 * - Se apply=true: faz merge seguro (somente campos vazios/fallback genérico).
 * - Nunca lança.
 */
export async function runShadowPipeline<T extends ShadowItemInput>(
  item: T,
  ctx: ShadowContext,
  opts: { apply?: boolean } = {},
): Promise<ShadowResult<T>> {
  const out: ShadowResult<T> = {
    item,
    cfop_suggestion: "",
    applied_fields: [],
    skipped_fields: [],
    divergences: [],
  };
  const apply = opts.apply === true;
  let applyReason = "shadow_only";

  // --- ETAPA 1: CFOP shadow ---
  let cfopSuggested = "";
  try {
    const cfopResult = resolveCfop({
      cfop_manual: item.cfop_manual ?? null,
      tipo_item: item.tipo_item ?? null,
    });
    cfopSuggested = cfopResult.cfop;
    out.cfop_suggestion = cfopSuggested;
    const current = (item.cfop ?? "").toString().trim();
    const hasManual = !!(item.cfop_manual && String(item.cfop_manual).trim());

    // 🚨 BLOQUEIO DE SEGURANÇA FISCAL: CFOP de ST (54xx) NUNCA é auto-aplicado.
    // ST exige análise manual (MVA, CEST, protocolo). Aplicar automaticamente
    // gera risco fiscal crítico (cobrança duplicada/indevida de ICMS-ST).
    const isST = !!cfopSuggested && cfopSuggested.startsWith("54");
    if (isST) {
      console.log({
        type: "CFOP_ST_BLOCK",
        produto_id: item.product_id ?? null,
        cfop_atual: current || null,
        cfop_sugerido: cfopSuggested,
        blocked: true,
        reason: "st_detected",
      });
    }

    // Regra estrita: aplica somente se vazio OU exatamente "5102" (fallback genérico)
    // E NUNCA se houver cfop_manual. E NUNCA se sugestão for ST.
    const cfopApplicable = !hasManual && !isST && (!current || current === "5102");
    const willApply = apply && cfopApplicable && !!cfopSuggested && cfopSuggested !== current;

    if (current && current !== cfopSuggested) {
      out.divergences.push({ field: "cfop", current, suggested: cfopSuggested });
    }
    if (willApply) {
      (out.item as any).cfop = cfopSuggested;
      out.applied_fields.push("cfop");
    } else if (current && current !== cfopSuggested) {
      out.skipped_fields.push("cfop");
    }
    console.log({
      type: "CFOP_PIPELINE",
      produto_id: item.product_id ?? null,
      cfop_atual: current || null,
      cfop_sugerido: cfopSuggested,
      applied: willApply,
      blocked_st: isST,
      source: cfopResult.source,
    });
  } catch (e) {
    console.warn("[CFOP_PIPELINE] erro shadow (ignorado)", e);
  }

  // --- ETAPA 1.5: CFOP REVENDA FIX ---
  // Cobre:
  //   (a) 5101→5102 / 6101→6102 (produção→revenda)
  //   (b) Flip interno↔interestadual baseado em UF (5xxx↔6xxx) para CFOPs de revenda comuns
  // Fail-safe absoluto: try/catch local, nunca lança, mantém CFOP original em erro.
  // PROIBIDO: alterar ST (54xx/64xx), CFOP manual, ou CFOPs fora da whitelist segura.
  try {
    const isManual = !!(item.cfop_manual && String(item.cfop_manual).trim());
    const current = ((out.item as any).cfop ?? "").toString().trim();
    const suggested = out.cfop_suggestion || "";
    const isSTSuggested = !!suggested && (suggested.startsWith("54") || suggested.startsWith("64"));
    const isSTCurrent = /^(54|64)\d{2}$/.test(current);

    // Interstate detection: ambas UFs preenchidas e diferentes
    const ufO = (ctx.ufOrigem || "").trim().toUpperCase();
    const ufD = (ctx.ufDestino || "").trim().toUpperCase();
    const isInterstate = !!ufO && !!ufD && ufO !== ufD;

    // Whitelist de CFOPs de revenda seguros para flip 5↔6
    const SAFE_FLIP = new Set([
      "5101", "5102", "5103", "5104", "5105", "5106",
      "6101", "6102", "6103", "6104", "6105", "6106",
    ]);

    let novoCfop = current;
    let motivo: "no_change" | "fix_revenda_interna" | "fix_revenda_interestadual" | "flip_to_interstate" | "flip_to_internal" = "no_change";

    if (!isManual && !isSTSuggested && !isSTCurrent) {
      // (a) produção → revenda
      if (current === "5101") {
        novoCfop = "5102";
        motivo = "fix_revenda_interna";
      } else if (current === "6101") {
        novoCfop = "6102";
        motivo = "fix_revenda_interestadual";
      }

      // (b) flip de prefixo conforme destino
      if (SAFE_FLIP.has(novoCfop)) {
        if (isInterstate && novoCfop.startsWith("5")) {
          const flipped = `6${novoCfop.slice(1)}`;
          if (SAFE_FLIP.has(flipped)) {
            novoCfop = flipped;
            motivo = motivo === "no_change" ? "flip_to_interstate" : motivo;
          }
        } else if (!isInterstate && ufO && ufD && novoCfop.startsWith("6")) {
          const flipped = `5${novoCfop.slice(1)}`;
          if (SAFE_FLIP.has(flipped)) {
            novoCfop = flipped;
            motivo = motivo === "no_change" ? "flip_to_internal" : motivo;
          }
        }
      }
    }

    if (motivo !== "no_change" && novoCfop !== current && apply) {
      (out.item as any).cfop = novoCfop;
      if (!out.applied_fields.includes("cfop")) out.applied_fields.push("cfop");
      applyReason = motivo;
      console.log({
        type: "CFOP_FIX_APPLIED",
        produto_id: item.product_id ?? null,
        cfop_original: current,
        cfop_novo: novoCfop,
        reason: motivo,
        uf_origem: ufO || null,
        uf_destino: ufD || null,
        isInterstate,
      });
    } else if (motivo !== "no_change" && novoCfop !== current) {
      console.log({
        type: "CFOP_FIX_SHADOW",
        produto_id: item.product_id ?? null,
        cfop_original: current,
        cfop_sugerido_fix: novoCfop,
        reason: motivo,
        applied: false,
        isInterstate,
      });
    }
  } catch (e) {
    console.warn("[CFOP_FIX] erro ignorado (fail-safe)", e);
  }

  // --- ETAPA 2: resolve_tax_rule (sugestão) ---
  try {
    const rule = await resolveTaxRule({
      companyId: ctx.companyId,
      regime: ctx.regime,
      ufOrigem: ctx.ufOrigem ?? "*",
      ufDestino: ctx.ufDestino ?? "*",
      ncm: item.ncm ?? null,
      categoriaFiscalTipo: item.categoria_fiscal_tipo ?? null,
    });
    out.tax_rule = rule;

    // CFOP NÃO entra aqui — já foi tratado na ETAPA 1 com regra estrita.
    const candidates: Array<[string, any]> = [
      ["csosn", rule.csosn],
      ["cst_icms", rule.cst_icms],
      ["origem", rule.origem],
      ["cst_pis", rule.cst_pis],
      ["cst_cofins", rule.cst_cofins],
    ];

    for (const [field, suggested] of candidates) {
      if (suggested === null || suggested === undefined || suggested === "") continue;
      const current = (item as any)[field];
      const empty = isEmptyOrGeneric(field, current);
      if (current !== undefined && current !== null && String(current) !== "" && String(current) !== String(suggested)) {
        out.divergences.push({ field, current, suggested });
      }
      if (apply && empty) {
        (out.item as any)[field] = suggested;
        out.applied_fields.push(field);
      } else if (!empty && String(current) !== String(suggested)) {
        out.skipped_fields.push(field);
      }
    }

    console.log({
      type: "TAX_RULE_PIPELINE",
      produto_id: item.product_id ?? null,
      match: rule.match,
      rule_id: rule.rule_id ?? null,
      applied_fields: out.applied_fields,
      skipped_fields: out.skipped_fields,
      divergences: out.divergences,
      source: "rpc",
    });

    applyReason = apply
      ? (out.applied_fields.length > 0 ? "auto_applied_safe" : "no_safe_fields")
      : "shadow_only";
  } catch (e) {
    console.warn("[TAX_RULE_PIPELINE] fallback (ignorado)", e);
    applyReason = "rpc_failed_fail_safe";
  }

  // --- LOG OBRIGATÓRIO: AUTO_APPLY_DECISION ---
  // ST tem precedência sobre qualquer outra razão (risco fiscal crítico).
  const stBlocked = !!out.cfop_suggestion && out.cfop_suggestion.startsWith("54");
  const finalReason = stBlocked ? "st_blocked" : applyReason;
  console.log({
    type: "AUTO_APPLY_DECISION",
    produto_id: item.product_id ?? null,
    applied_fields: out.applied_fields,
    skipped_fields: out.skipped_fields,
    reason: finalReason,
  });

  // Persistência local read-only para o Painel de Auditoria Fiscal.
  // Fail-safe: nunca interfere na emissão.
  recordFiscalAuditEvent({
    produto_id: item.product_id ?? null,
    cfop_atual: (item.cfop ?? null) as any,
    cfop_sugerido: out.cfop_suggestion || null,
    applied: out.applied_fields.length > 0,
    applied_fields: out.applied_fields,
    skipped_fields: out.skipped_fields,
    divergences: out.divergences,
    reason: finalReason,
  });

  return out;
}

/** Versão batch — mesmo contrato seguro. */
export async function runShadowPipelineBatch<T extends ShadowItemInput>(
  items: T[],
  ctx: ShadowContext,
  opts: { apply?: boolean } = {},
): Promise<ShadowResult<T>[]> {
  const results: ShadowResult<T>[] = [];
  for (const it of items) {
    try {
      results.push(await runShadowPipeline(it, ctx, opts));
    } catch (e) {
      console.warn("[SHADOW_PIPELINE] item falhou (ignorado)", e);
      results.push({
        item: it,
        cfop_suggestion: "",
        applied_fields: [],
        skipped_fields: [],
        divergences: [],
      });
    }
  }
  return results;
}
