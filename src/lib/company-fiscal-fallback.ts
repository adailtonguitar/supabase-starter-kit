import { supabase } from "@/integrations/supabase/client";
import { fetchMyCompanyMemberships } from "@/lib/company-memberships";
import {
  companyRowMeetsReadinessBasics,
  mergeChildCompanyWithParentFiscal,
  pickPeerDonorForFiscalMerge,
  supplementCnpjFromRowTextFields,
} from "../../shared/fiscal/company-fiscal-merge";

const MAX_PARENT_HOPS = 5;

const PARENT_SELECT =
  "cnpj, ie, state_registration, parent_company_id, crt, address_street, address_number, address_neighborhood, address_city, address_state, address_ibge_code, address_zip";

export async function resolveCompanyFiscalRowWithParent(
  company: Record<string, unknown> | null | undefined,
): Promise<Record<string, unknown>> {
  let row: Record<string, unknown> = supplementCnpjFromRowTextFields({ ...(company || {}) });
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

/**
 * Quando a filial não tem `parent_company_id` (ou RLS bloqueou o pai), tenta completar
 * CNPJ/CRT/endereço/IBGE a partir de **outra empresa** do mesmo usuário:
 * - vínculo direto matriz↔filial (parent em qualquer sentido), ou
 * - conta com só 2 empresas e uma delas tem cadastro fiscal completo (caso comum de hierarquia quebrada).
 */
export async function fillCompanyRowFromMembershipPeers(
  row: Record<string, unknown>,
  currentCompanyId: string,
): Promise<Record<string, unknown>> {
  if (companyRowMeetsReadinessBasics(row)) return row;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return row;

  let memberships: { company_id: string; is_active: boolean }[];
  try {
    memberships = await fetchMyCompanyMemberships(user.id);
  } catch {
    return row;
  }

  const activeIds = memberships.filter((m) => m.is_active).map((m) => m.company_id);
  const peerIds = activeIds.filter((id) => id !== currentCompanyId);
  if (peerIds.length === 0) return row;

  const map = new Map<string, Record<string, unknown>>();
  const base = { ...row, id: row.id ?? currentCompanyId };
  map.set(String(currentCompanyId), base);

  const peerRows: Record<string, unknown>[] = [];
  for (const oid of peerIds) {
    const { data, error } = await supabase.rpc("get_company_record", { p_company_id: oid });
    if (error || data == null || typeof data !== "object") continue;
    const pr = data as Record<string, unknown>;
    const resolved = await resolveCompanyFiscalRowWithParent(pr);
    const pid = String(resolved.id ?? oid);
    map.set(pid, resolved);
    peerRows.push(resolved);
  }

  const donor = pickPeerDonorForFiscalMerge(currentCompanyId, activeIds, peerRows, map);
  if (!donor) return base;

  return mergeChildCompanyWithParentFiscal(base, donor);
}
