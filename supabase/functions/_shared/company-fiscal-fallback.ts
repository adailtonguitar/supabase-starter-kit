import { fiscalDigits, mergeChildCompanyWithParentFiscal } from "../../../shared/fiscal/company-fiscal-merge.ts";

const MAX_PARENT_HOPS = 5;

function cnpjSufficient(value: unknown): boolean {
  return fiscalDigits(value).length >= 14;
}

function ieSufficient(row: Record<string, unknown>): boolean {
  return fiscalDigits(row.ie).length >= 2 || fiscalDigits(row.state_registration).length >= 2;
}

/**
 * Sobe a cadeia `parent_company_id` mesclando CNPJ/IE (filial → matriz → …).
 * Um único nível não basta quando há empresa “intermediária” sem CNPJ.
 */
export async function resolveCompanyFiscalRowWithParent(
  supabase: any,
  company: Record<string, unknown> | null | undefined,
): Promise<Record<string, unknown>> {
  let row: Record<string, unknown> = { ...(company || {}) };
  let nextParentId: unknown = row.parent_company_id;

  for (let hop = 0; hop < MAX_PARENT_HOPS; hop++) {
    if (cnpjSufficient(row.cnpj) && ieSufficient(row)) return row;
    if (!nextParentId || String(nextParentId).trim() === "") return row;

    const { data: parent } = await supabase
      .from("companies")
      .select("cnpj, ie, state_registration, parent_company_id")
      .eq("id", String(nextParentId))
      .maybeSingle();

    if (!parent || typeof parent !== "object") return row;

    const p = parent as Record<string, unknown>;
    row = mergeChildCompanyWithParentFiscal(row, p);
    nextParentId = p.parent_company_id;
  }

  return row;
}
