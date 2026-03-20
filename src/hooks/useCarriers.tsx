import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";
import { useAuth } from "./useAuth";

interface CarrierInput {
  id?: string;
  created_at?: string;
  updated_at?: string;
  company_id?: string;
  name?: string | null;
  [key: string]: unknown;
}

export function useCarriers() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["carriers", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("carriers").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });
}

export function useCreateCarrier() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (d: CarrierInput) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { id, created_at, updated_at, ...rest } = d;
      const { error } = await supabase.from("carriers").insert({ ...rest, company_id: companyId });
      if (error) throw error;
      logAction({ companyId, userId: user?.id, action: "Transportadora criada", module: "configuracoes", details: rest.name });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["carriers"] }); toast.success("Transportadora criada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateCarrier() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (d: CarrierInput & { id: string }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { id, created_at, updated_at, company_id, ...rest } = d;
      const { error } = await supabase.from("carriers").update(rest).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
      logAction({ companyId, userId: user?.id, action: "Transportadora editada", module: "configuracoes", details: rest.name || id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["carriers"] }); toast.success("Transportadora atualizada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteCarrier() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { error } = await supabase.from("carriers").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
      logAction({ companyId, userId: user?.id, action: "Transportadora excluída", module: "configuracoes", details: id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["carriers"] }); toast.success("Transportadora excluída"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
