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
  try {
    const { data, error } = await supabase.functions.invoke("admin-query", {
      body: params,
    });
    if (error) {
      console.warn("[adminQuery] edge error:", error.message || error);
      return [];
    }
    if (data?.error) {
      console.warn("[adminQuery] data error:", data.error);
      return [];
    }
    return data?.data ?? [];
  } catch (e) {
    console.warn("[adminQuery] caught:", e);
    return [];
  }
}

export async function adminCount(table: string, filters?: AdminQueryParams["filters"]): Promise<number> {
  try {
    const { data, error } = await supabase.functions.invoke("admin-query", {
      body: { table, count_only: true, filters },
    });
    if (error) return 0;
    return data?.count ?? 0;
  } catch {
    return 0;
  }
}
