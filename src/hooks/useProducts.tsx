import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { autoSyncProductToBranches } from "./useBranches";
import { recordPriceChange } from "@/lib/price-history";
import { logAction, buildDiff } from "@/services/ActionLogger";

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
  const { user } = useAuth();
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
      if (companyId && data?.id) {
        autoSyncProductToBranches(data.id, companyId);
      }
      if (companyId) logAction({ companyId, userId: user?.id, action: "Produto criado", module: "produtos", details: data?.name || null });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Product> & { id: string }) => {
      if (!companyId) throw new Error("Empresa não encontrada");

      // Fetch current product for diff and price history tracking
      const { data: oldData } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .eq("company_id", companyId)
        .single();

      const { data, error } = await supabase
        .from("products")
        .update(updates)
        .eq("id", id)
        .eq("company_id", companyId)
        .select()
        .single();
      if (error) throw error;

      // Record price changes automatically
      if (oldData) {
        if (updates.price !== undefined && oldData.price !== updates.price) {
          recordPriceChange({
            company_id: companyId,
            product_id: id,
            field_changed: "price",
            old_value: oldData.price || 0,
            new_value: updates.price,
            source: "manual",
          });
        }
        if (updates.cost_price !== undefined && oldData.cost_price !== updates.cost_price) {
          recordPriceChange({
            company_id: companyId,
            product_id: id,
            field_changed: "cost_price",
            old_value: oldData.cost_price || 0,
            new_value: updates.cost_price,
            source: "manual",
          });
        }
      }

      return { product: data as Product, oldData };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      const diff = result.oldData ? buildDiff(result.oldData, { ...result.oldData, ...variables }, Object.keys(variables).filter(k => k !== "id")) : undefined;
      if (companyId) logAction({ companyId, userId: user?.id, action: "Produto atualizado", module: "produtos", details: variables.name || variables.id, diff });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
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
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto excluído com sucesso");
      if (companyId) logAction({ companyId, userId: user?.id, action: "Produto excluído", module: "produtos", details: id });
    },
    onError: (e: Error) => toast.error(`Erro ao excluir: ${e.message}`),
  });
}
