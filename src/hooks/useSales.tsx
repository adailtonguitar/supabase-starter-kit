import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";

export interface Sale {
  id: string;
  number?: number;
  payment_method?: string;
  total_value: number;
  status: string;
  created_at: string;
  items_json?: any;
  customer_name?: string;
  access_key?: string;
  company_id: string;
}

export function useSales(limit = 50) {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["sales", companyId, limit],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      // Map DB columns to interface expected by Vendas page
      return (data || []).map((row: any) => ({
        id: row.id,
        number: row.sale_number || row.number,
        payment_method: extractPaymentMethod(row.payments),
        total_value: row.total ?? row.total_value ?? 0,
        status: row.status || "completed",
        created_at: row.created_at,
        items_json: row.items ?? row.items_json,
        customer_name: row.client_name ?? row.customer_name,
        access_key: row.access_key,
        company_id: row.company_id,
      })) as Sale[];
    },
    enabled: !!companyId,
  });
}

function extractPaymentMethod(payments: any): string {
  try {
    const arr = Array.isArray(payments) ? payments : typeof payments === "string" ? JSON.parse(payments) : [];
    if (arr.length > 0) return arr[0].method || "";
  } catch {}
  return "";
}
