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
    const willApply = apply && !current && !!cfopSuggested;
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
      source: cfopResult.source,
    });
  } catch (e) {
    console.warn("[CFOP_PIPELINE] erro shadow (ignorado)", e);
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

    const candidates: Array<[string, any]> = [
      ["csosn", rule.csosn],
      ["cst_icms", rule.cst_icms],
      ["origem", rule.origem],
      ["cst_pis", rule.cst_pis],
      ["cst_cofins", rule.cst_cofins],
      // cfop só preenchido se vazio (regra do prompt)
      ["cfop", rule.cfop],
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
  } catch (e) {
    console.warn("[TAX_RULE_PIPELINE] fallback (ignorado)", e);
  }

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
