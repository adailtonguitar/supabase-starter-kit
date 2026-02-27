import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";

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
  is_active?: boolean;
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

export function useCreateProduct() {
  const queryClient = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (product: Partial<Product>) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase
        .from("products")
        .insert({ ...product, company_id: companyId })
        .select()
        .single();
      if (error) throw error;
      return data as Product;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Product> & { id: string }) => {
      const { data, error } = await supabase
        .from("products")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Product;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Delete dependent records first
      await supabase.from("product_labels" as any).delete().eq("product_id", id);
      await supabase.from("stock_movements" as any).delete().eq("product_id", id);
      await supabase.from("product_lots" as any).delete().eq("product_id", id);
      await supabase.from("sale_items" as any).delete().eq("product_id", id);
      
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto excluído com sucesso");
    },
    onError: (e: Error) => toast.error(`Erro ao excluir: ${e.message}`),
  });
}
