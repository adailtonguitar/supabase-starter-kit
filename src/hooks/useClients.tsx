import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";

export function useClients() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["clients", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("clients").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    refetchOnMount: "always",
    staleTime: 0,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("clients").insert({ ...data, company_id: companyId });
      if (error) throw error;
      if (companyId) logAction({ companyId, userId: user?.id, action: "Cliente cadastrado", module: "clientes", details: data.name || null });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente cadastrado com sucesso");
    },
    onError: (e: Error) => toast.error(`Erro ao cadastrar cliente: ${e.message}`),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (data: any) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { id, ...rest } = data;
      const { error } = await supabase.from("clients").update(rest).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
      logAction({ companyId, userId: user?.id, action: "Cliente atualizado", module: "clientes", details: rest.name || id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente atualizado");
    },
    onError: (e: Error) => toast.error(`Erro ao atualizar cliente: ${e.message}`),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { error } = await supabase.from("clients").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
      logAction({ companyId, userId: user?.id, action: "Cliente excluído", module: "clientes", details: id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente excluído");
    },
    onError: (e: Error) => toast.error(`Erro ao excluir cliente: ${e.message}`),
  });
}
