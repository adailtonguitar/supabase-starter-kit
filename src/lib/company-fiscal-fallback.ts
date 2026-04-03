import { supabase } from "@/integrations/supabase/client";
import { fiscalDigits, mergeChildCompanyWithParentFiscal } from "../../shared/fiscal/company-fiscal-merge";

/** Filial sem CNPJ/IE: mescla da matriz (mesma regra do Edge). */
export async function resolveCompanyFiscalRowWithParent(
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
