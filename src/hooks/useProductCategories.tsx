import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";

export interface ProductCategory {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  [key: string]: any;
}

export function useProductCategories() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["product_categories", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("product_categories" as any).select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return data as ProductCategory[];
    },
    enabled: !!companyId,
  });
}

export function useCreateProductCategory() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (c: any) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase.from("product_categories" as any).insert({ ...c, company_id: companyId }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["product_categories"] }); toast.success("Categoria criada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateProductCategory() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase.from("product_categories" as any).update(updates).eq("id", id).eq("company_id", companyId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["product_categories"] }); toast.success("Categoria atualizada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteProductCategory() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { error } = await supabase.from("product_categories" as any).delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["product_categories"] }); toast.success("Categoria excluída"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
