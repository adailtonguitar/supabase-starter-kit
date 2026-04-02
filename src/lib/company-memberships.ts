import { supabase } from "@/integrations/supabase/client";

export type CompanyMembershipRow = { company_id: string; is_active: boolean };

/** Parseia retorno JSONB de get_my_company_memberships (array de objetos). */
export function parseMembershipsPayload(data: unknown): CompanyMembershipRow[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.filter(
      (r): r is CompanyMembershipRow =>
        r != null &&
        typeof r === "object" &&
        "company_id" in r &&
        typeof (r as CompanyMembershipRow).company_id === "string",
    );
  }
  if (typeof data === "string") {
    try {
      const p = JSON.parse(data) as unknown;
      return parseMembershipsPayload(p);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Vínculos do usuário atual via RPC (ignora falhas de RLS em company_users).
 * Se a RPC não existir ainda (deploy antigo), faz fallback no SELECT direto.
 */
export async function fetchMyCompanyMemberships(userId: string): Promise<CompanyMembershipRow[]> {
  const { data: raw, error } = await supabase.rpc("get_my_company_memberships");
  if (!error && raw != null) {
    return parseMembershipsPayload(raw);
  }

  const { data: rows, error: qErr } = await supabase
    .from("company_users")
    .select("company_id, is_active")
    .eq("user_id", userId);

  if (qErr || !rows?.length) return [];
  return rows.map((r) => ({
    company_id: r.company_id as string,
    is_active: !!(r as { is_active?: boolean }).is_active,
  }));
}
