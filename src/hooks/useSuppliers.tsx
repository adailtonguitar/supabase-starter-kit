import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { logAction, buildDiff } from "@/services/ActionLogger";

type SupplierInput = {
  id?: string;
  created_at?: string;
  updated_at?: string;
  company_id?: string;
  name?: string | null;
  trade_name?: string | null;
  cnpj?: string | null;
  ie?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

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
    mutationFn: async (data: SupplierInput) => {
      // Only send known columns to avoid schema cache errors
      const { id, created_at, updated_at, ...rest } = data;
      const payload: Record<string, unknown> = { company_id: companyId };
      const knownCols: (keyof SupplierInput)[] = ["name", "trade_name", "cnpj", "ie", "contact_name", "email", "phone", "notes"];
      for (const k of knownCols) {
        if (rest[k] !== undefined) payload[k] = rest[k];
      }
      const { error } = await supabase.from("suppliers").insert(payload);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      if (companyId) logAction({ companyId, action: "Fornecedor cadastrado", module: "fornecedores", details: variables.name || null });
    },
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (data: SupplierInput & { id: string }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { id, created_at, updated_at, company_id, ...rest } = data;
      const knownCols: (keyof SupplierInput)[] = ["name", "trade_name", "cnpj", "ie", "contact_name", "email", "phone", "notes"];
      const payload: Record<string, unknown> = {};
      for (const k of knownCols) {
        if (rest[k] !== undefined) payload[k] = rest[k];
      }

      // Fetch old data for diff
      const { data: oldData } = await supabase.from("suppliers").select("*").eq("id", id).eq("company_id", companyId).single();

      const { error } = await supabase.from("suppliers").update(payload).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
      return { oldData };
    },
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      const diff = result?.oldData ? buildDiff(result.oldData, { ...result.oldData, ...variables }, Object.keys(variables).filter(k => !["id","created_at","updated_at","company_id"].includes(k))) : undefined;
      if (companyId) logAction({ companyId, userId: user?.id, action: "Fornecedor atualizado", module: "fornecedores", details: variables.name || variables.id, diff });
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
