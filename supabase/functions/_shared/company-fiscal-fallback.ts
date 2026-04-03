import {
  companyRowMeetsReadinessBasics,
  mergeChildCompanyWithParentFiscal,
} from "../../../shared/fiscal/company-fiscal-merge.ts";

const MAX_PARENT_HOPS = 5;

const PARENT_SELECT =
  "cnpj, ie, parent_company_id, crt, address_street, address_number, address_neighborhood, address_city, address_state, address_ibge_code, address_zip";

/** Mesmas colunas usadas em fiscal-readiness (emit / fila) para carregar peers. */
const PEER_COMPANY_SELECT =
  "id, cnpj, ie, state_registration, parent_company_id, crt, address_street, address_number, address_neighborhood, address_city, address_state, address_ibge_code, street, number, neighborhood, city, state, ibge_code, city_code";

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

/**
 * Espelha `fillCompanyRowFromMembershipPeers` do app: quando não há cadeia `parent_company_id`,
 * completa CNPJ/CRT/endereço a partir de outra empresa à qual o **mesmo usuário** pertence
 * (vínculo direto matriz↔filial ou conta com 2 empresas e uma completa).
 * Usa service role (fila / emit-nfce), sem `auth.uid()` na RPC.
 */
export async function fillCompanyRowFromServicePeerFallback(
  supabase: any,
  row: Record<string, unknown>,
  currentCompanyId: string,
): Promise<Record<string, unknown>> {
  if (companyRowMeetsReadinessBasics(row)) return row;

  const { data: members } = await supabase
    .from("company_users")
    .select("user_id")
    .eq("company_id", currentCompanyId)
    .eq("is_active", true)
    .limit(100);

  const userIds = [...new Set(
    (members || []).map((m: { user_id?: string }) => String(m.user_id || "").trim()).filter(Boolean),
  )];
  if (userIds.length === 0) return row;

  for (const uid of userIds) {
    const { data: ms } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", uid)
      .eq("is_active", true);

    const activeIds = (ms || []).map((m: { company_id?: string }) => String(m.company_id || "").trim()).filter(Boolean);
    const peerIds = activeIds.filter((id) => id && id !== currentCompanyId);
    if (peerIds.length === 0) continue;

    const base = { ...row, id: row.id ?? currentCompanyId };
    const map = new Map<string, Record<string, unknown>>();
    map.set(currentCompanyId, base);

    const peerRows: Record<string, unknown>[] = [];
    for (const oid of peerIds) {
      const { data: prow } = await supabase
        .from("companies")
        .select(PEER_COMPANY_SELECT)
        .eq("id", oid)
        .maybeSingle();
      if (!prow || typeof prow !== "object") continue;
      const resolved = await resolveCompanyFiscalRowWithParent(supabase, prow as Record<string, unknown>);
      const pid = String(resolved.id ?? oid);
      map.set(pid, resolved);
      peerRows.push(resolved);
    }

    const isDirectlyLinked = (a: string, b: string): boolean => {
      const ca = map.get(a);
      const cb = map.get(b);
      if (!ca || !cb) return false;
      return String(ca.parent_company_id || "") === b || String(cb.parent_company_id || "") === a;
    };

    const basicsOk = peerRows.filter((p) => companyRowMeetsReadinessBasics(p));
    const linkedDonor = basicsOk.find((p) => isDirectlyLinked(currentCompanyId, String(p.id ?? "")));

    let donor: Record<string, unknown> | null = linkedDonor ?? null;
    if (!donor && activeIds.length === 2 && basicsOk.length === 1) {
      donor = basicsOk[0];
    }

    if (donor) {
      const merged = mergeChildCompanyWithParentFiscal(base, donor);
      if (companyRowMeetsReadinessBasics(merged)) return merged;
    }
  }

  return row;
}
