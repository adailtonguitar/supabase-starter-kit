import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";
import { autoSyncProductToBranches } from "./useBranches";

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
  image_url?: string;
  shelf_location?: string;
  voltage?: string;
  warranty_months?: number;
  serial_number?: string;
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
        .eq("is_active", true)
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      // Auto-sync: push new product to all branches if this is a matrix company
      if (companyId && data?.id) {
        autoSyncProductToBranches(data.id, companyId);
      }
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Product> & { id: string }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase
        .from("products")
        .update(updates)
        .eq("id", id)
        .eq("company_id", companyId)
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
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      // Delete dependent records — but NOT sale_items (preserves sales history)
      await supabase.from("product_labels" as any).delete().eq("product_id", id).eq("company_id", companyId);
      await supabase.from("stock_movements" as any).delete().eq("product_id", id).eq("company_id", companyId);
      await supabase.from("product_lots" as any).delete().eq("product_id", id).eq("company_id", companyId);
      
      // Soft-delete: deactivate product instead of hard delete to preserve referential integrity
      const { error } = await supabase.from("products").update({ is_active: false } as any).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto excluído com sucesso");
    },
    onError: (e: Error) => toast.error(`Erro ao excluir: ${e.message}`),
  });
}
