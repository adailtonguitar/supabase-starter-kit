import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";
import { useAuth } from "./useAuth";

export function useCardAdmins() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["card_administrators", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("card_administrators").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });
}

export function useCreateCardAdmin() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (d: any) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { id, created_at, updated_at, ...rest } = d;
      const { error } = await supabase.from("card_administrators").insert({ ...rest, company_id: companyId });
      if (error) throw error;
      logAction({ companyId, userId: user?.id, action: "Administradora de cartão criada", module: "configuracoes", details: rest.name });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["card_administrators"] }); toast.success("Administradora criada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateCardAdmin() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (d: any) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { id, created_at, updated_at, company_id, ...rest } = d;
      const { error } = await supabase.from("card_administrators").update(rest).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
      logAction({ companyId, userId: user?.id, action: "Administradora de cartão editada", module: "configuracoes", details: rest.name || id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["card_administrators"] }); toast.success("Administradora atualizada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteCardAdmin() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { error } = await supabase.from("card_administrators").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
      logAction({ companyId, userId: user?.id, action: "Administradora de cartão excluída", module: "configuracoes", details: id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["card_administrators"] }); toast.success("Administradora excluída"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
