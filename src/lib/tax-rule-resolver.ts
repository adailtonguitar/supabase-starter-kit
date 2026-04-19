/**
 * Motor tributário desacoplado (fiscal_tax_rules_v2 + RPC resolve_tax_rule).
 *
 * SEGURANÇA:
 *  - NUNCA lança erro: em qualquer falha devolve fallback (CSOSN 102 / CFOP 5102 / PIS·COFINS 49).
 *  - NUNCA sobrescreve valores existentes — use `mergeTaxRule` para preencher só campos vazios.
 *  - NÃO altera emit-nfce. Camada opt-in.
 */
import { supabase } from "@/integrations/supabase/client";

export interface TaxRuleResolved {
  match: string;
  rule_id?: string;
  csosn: string | null;
  cst_icms: string | null;
  cfop: string;
  origem: number;
  cst_pis: string;
  aliq_pis: number;
  cst_cofins: string;
  aliq_cofins: number;
}

const FALLBACK: TaxRuleResolved = {
  match: "fallback",
  csosn: "102",
  cst_icms: null,
  cfop: "5102",
  origem: 0,
  cst_pis: "49",
  aliq_pis: 0,
  cst_cofins: "49",
  aliq_cofins: 0,
};

export interface ResolveTaxRuleInput {
  companyId: string | null | undefined;
  regime?: "simples" | "normal" | "*" | null;
  ufOrigem?: string | null;
  ufDestino?: string | null;
  ncm?: string | null;
  categoriaFiscalTipo?: string | null;
}

export async function resolveTaxRule(input: ResolveTaxRuleInput): Promise<TaxRuleResolved> {
  try {
    const { data, error } = await (supabase.rpc as any)("resolve_tax_rule", {
      p_company_id: input.companyId ?? null,
      p_regime: input.regime ?? "*",
      p_uf_origem: input.ufOrigem ?? "*",
      p_uf_destino: input.ufDestino ?? "*",
      p_ncm: (input.ncm || "").replace(/\D/g, "") || null,
      p_categoria_fiscal_tipo: input.categoriaFiscalTipo ?? null,
    });
    if (error || !data || typeof data !== "object") {
      console.warn("[TAX-RULE] fallback (rpc error)", error?.message);
      return FALLBACK;
    }
    const r = data as any;
    console.info("[TAX-RULE] resolved", { match: r.match, rule_id: r.rule_id });
    return {
      match: String(r.match ?? "fallback"),
      rule_id: r.rule_id,
      csosn: r.csosn ?? null,
      cst_icms: r.cst_icms ?? null,
      cfop: String(r.cfop ?? "5102"),
      origem: Number(r.origem ?? 0),
      cst_pis: String(r.cst_pis ?? "49"),
      aliq_pis: Number(r.aliq_pis ?? 0),
      cst_cofins: String(r.cst_cofins ?? "49"),
      aliq_cofins: Number(r.aliq_cofins ?? 0),
    };
  } catch (e) {
    console.warn("[TAX-RULE] fallback (exception)", e);
    return FALLBACK;
  }
}

/**
 * Mescla a regra resolvida em um produto/item, preenchendo APENAS campos vazios.
 * Nunca sobrescreve valores existentes (anti-regressão).
 */
export function mergeTaxRule<T extends Record<string, any>>(current: T, rule: TaxRuleResolved): T {
  const out: any = { ...current };
  const setIfEmpty = (key: string, val: any) => {
    if (val === null || val === undefined || val === "") return;
    const cur = out[key];
    if (cur === undefined || cur === null || cur === "" || cur === 0) out[key] = val;
  };
  setIfEmpty("csosn", rule.csosn);
  setIfEmpty("cst_icms", rule.cst_icms);
  setIfEmpty("cfop", rule.cfop);
  setIfEmpty("origem", rule.origem);
  setIfEmpty("cst_pis", rule.cst_pis);
  setIfEmpty("aliq_pis", rule.aliq_pis);
  setIfEmpty("cst_cofins", rule.cst_cofins);
  setIfEmpty("aliq_cofins", rule.aliq_cofins);
  return out as T;
}
