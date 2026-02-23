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
      return (data || []) as Sale[];
    },
    enabled: !!companyId,
  });
}
