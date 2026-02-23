import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  ncm?: string;
  category?: string;
  price: number;
  cost_price?: number;
  stock_quantity: number;
  min_stock?: number;
  unit: string;
  company_id: string;
}

export function useProducts() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["products", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data || []) as Product[];
    },
    enabled: !!companyId,
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}
