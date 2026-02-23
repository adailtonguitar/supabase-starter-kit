/** Stub: useLocalProducts — falls back to Supabase query */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";
import type { Product } from "./useProducts";

export type LocalProduct = Product;

export function useCreateLocalProduct() {
  const qc = useQueryClient();
  const { companyId } = useCompany();

  return useMutation({
    mutationFn: async (product: any) => {
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
      toast.success("Produto criado");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
