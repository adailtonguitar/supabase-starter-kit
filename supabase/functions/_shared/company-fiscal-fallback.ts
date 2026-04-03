import {
  companyRowMeetsReadinessBasics,
  mergeChildCompanyWithParentFiscal,
} from "../../../shared/fiscal/company-fiscal-merge.ts";

const MAX_PARENT_HOPS = 5;

const PARENT_SELECT =
  "cnpj, ie, parent_company_id, crt, address_street, address_number, address_neighborhood, address_city, address_state, address_ibge_code, address_zip";

/**
 * Sobe `parent_company_id` mesclando CNPJ, IE, CRT e endereço fiscal da matriz.
 */
export async function resolveCompanyFiscalRowWithParent(
  supabase: any,
  company: Record<string, unknown> | null | undefined,
): Promise<Record<string, unknown>> {
  let row: Record<string, unknown> = { ...(company || {}) };
  let nextParentId: unknown = row.parent_company_id;

  for (let hop = 0; hop < MAX_PARENT_HOPS; hop++) {
    if (companyRowMeetsReadinessBasics(row)) return row;
    if (!nextParentId || String(nextParentId).trim() === "") return row;

    const { data: parent } = await supabase
      .from("companies")
      .select(PARENT_SELECT)
      .eq("id", String(nextParentId))
      .maybeSingle();

    if (!parent || typeof parent !== "object") return row;

    const p = parent as Record<string, unknown>;
    row = mergeChildCompanyWithParentFiscal(row, p);
    nextParentId = p.parent_company_id;
  }

  return row;
}
