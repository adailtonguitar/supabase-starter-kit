import { supabase } from "@/integrations/supabase/client";

interface AdminQueryParams {
  table: string;
  select?: string;
  filters?: { op: string; column: string; value: any }[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  count_only?: boolean;
}

export async function adminQuery<T = any>(params: AdminQueryParams): Promise<T[]> {
  const { data, error } = await supabase.functions.invoke("admin-query", {
    body: params,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data ?? [];
}

export async function adminCount(table: string, filters?: AdminQueryParams["filters"]): Promise<number> {
  const { data, error } = await supabase.functions.invoke("admin-query", {
    body: { table, count_only: true, filters },
  });
  if (error) throw error;
  return data?.count ?? 0;
}
