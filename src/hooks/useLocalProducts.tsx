import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTS_ACTIVE_OR_LEGACY_NULL } from "@/lib/product-active-filter";
import { useCompany } from "./useCompany";
import { toast } from "sonner";
import type { Product } from "./useProducts";

export type LocalProduct = Product;

export function useLocalProducts() {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["local-products", companyId],
    queryFn: async (): Promise<LocalProduct[]> => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("company_id", companyId)
        .or(PRODUCTS_ACTIVE_OR_LEGACY_NULL)
        .order("name");
      
      if (error) throw error;
      return (data || []) as LocalProduct[];
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

export function useCreateLocalProduct() {
  const qc = useQueryClient();
  const { companyId } = useCompany();

  return useMutation({
    mutationFn: async (product: Partial<Product>) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase
        .from("products")
        .insert({ ...product, company_id: companyId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["local-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto criado");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
