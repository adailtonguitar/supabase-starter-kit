import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";

export function useCarriers() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["carriers", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("carriers").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });
}

export function useCreateCarrier() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (d: any) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { id, created_at, updated_at, ...rest } = d;
      const { error } = await supabase.from("carriers").insert({ ...rest, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["carriers"] }); toast.success("Transportadora criada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateCarrier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: any) => {
      const { id, created_at, updated_at, company_id, ...rest } = d;
      const { error } = await supabase.from("carriers").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["carriers"] }); toast.success("Transportadora atualizada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteCarrier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("carriers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["carriers"] }); toast.success("Transportadora excluída"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
