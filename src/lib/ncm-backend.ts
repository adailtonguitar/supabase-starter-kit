import { safeRpc } from "@/integrations/supabase/client";

export type NcmBackendRow = {
  ncm: string;
  description: string;
  starts_on: string | null;
  ends_on: string | null;
};

function cleanNcm(ncm: string): string {
  return ncm.trim().replace(/[^0-9]/g, "");
}

export async function lookupNcmBackend(
  ncmRaw: string,
): Promise<{ found: true; row: NcmBackendRow } | { found: false; row: null }> {
  const ncm = cleanNcm(ncmRaw);
  if (ncm.length !== 8) return { found: false, row: null };

  const res = await safeRpc<NcmBackendRow[]>("lookup_ncm", { p_ncm: ncm });
  if (!res.success) return { found: false, row: null };

  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row?.ncm) return { found: false, row: null };

  return { found: true, row };
}

