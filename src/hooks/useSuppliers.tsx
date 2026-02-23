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
      const { error } = await supabase.from("suppliers").insert({ ...data, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const { id, ...rest } = data;
      const { error } = await supabase.from("suppliers").update(rest).eq("id", id);
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
