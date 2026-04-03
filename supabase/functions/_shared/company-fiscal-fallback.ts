import { fiscalDigits, mergeChildCompanyWithParentFiscal } from "../../../shared/fiscal/company-fiscal-merge.ts";

/**
 * Se `companies` é filial sem CNPJ/IE, busca matriz e mescla só esses campos (service role).
 */
export async function resolveCompanyFiscalRowWithParent(
  supabase: any,
  company: Record<string, unknown> | null | undefined,
): Promise<Record<string, unknown>> {
  const base = { ...(company || {}) };
  const pid = base.parent_company_id;
  if (!pid || String(pid).trim() === "") return base;

  const hasCnpj = fiscalDigits(base.cnpj).length > 0;
  const hasIe =
    fiscalDigits(base.ie).length >= 2 || fiscalDigits(base.state_registration).length >= 2;
  if (hasCnpj && hasIe) return base;

  const { data: parent } = await supabase
    .from("companies")
    .select("cnpj, ie, state_registration")
    .eq("id", String(pid))
    .maybeSingle();

  return mergeChildCompanyWithParentFiscal(
    base,
    parent && typeof parent === "object" ? (parent as Record<string, unknown>) : null,
  );
}
