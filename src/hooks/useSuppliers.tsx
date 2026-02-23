import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const { id, created_at, updated_at, company_id, ...rest } = data;
      const payload: Record<string, any> = {};
      const knownCols = ["name","trade_name","cnpj","ie","contact_name","email","phone","notes"];
      for (const k of knownCols) {
        if (rest[k] !== undefined) payload[k] = rest[k];
      }
      const { error } = await supabase.from("suppliers").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}
