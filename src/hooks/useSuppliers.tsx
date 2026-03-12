import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { logAction } from "@/services/ActionLogger";

export function useSuppliers() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("suppliers").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (data: any) => {
      // Only send known columns to avoid schema cache errors
      const { id, created_at, updated_at, ...rest } = data;
      const payload: Record<string, any> = { company_id: companyId };
      const knownCols = ["name","trade_name","cnpj","ie","contact_name","email","phone","notes"];
      for (const k of knownCols) {
        if (rest[k] !== undefined) payload[k] = rest[k];
      }
      const { error } = await supabase.from("suppliers").insert(payload);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      if (companyId) logAction({ companyId, action: "Fornecedor cadastrado", module: "fornecedores", details: (variables as any).name || null });
    },
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (data: any) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { id, created_at, updated_at, company_id, ...rest } = data;
      const payload: Record<string, any> = {};
      const knownCols = ["name","trade_name","cnpj","ie","contact_name","email","phone","notes"];
      for (const k of knownCols) {
        if (rest[k] !== undefined) payload[k] = rest[k];
      }
      const { error } = await supabase.from("suppliers").update(payload).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      if (companyId) logAction({ companyId, action: "Fornecedor atualizado", module: "fornecedores", details: (variables as any).name || (variables as any).id });
    },
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { error } = await supabase.from("suppliers").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      if (companyId) logAction({ companyId, action: "Fornecedor excluído", module: "fornecedores", details: id });
    },
  });
}
