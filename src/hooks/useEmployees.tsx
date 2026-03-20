import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { logAction, buildDiff } from "@/services/ActionLogger";

export interface Employee {
  id: string;
  company_id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  salary?: number | null;
  is_active?: boolean | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export type EmployeeInsert = Omit<Employee, "id" | "company_id" | "created_at" | "updated_at">;

export function useEmployees() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["employees", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("employees").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return data as Employee[];
    },
    enabled: !!companyId,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (e: Omit<EmployeeInsert, "company_id">) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase.from("employees").insert({ ...e, company_id: companyId }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Funcionário criado");
      if (companyId) logAction({ companyId, userId: user?.id, action: "Funcionário criado", module: "funcionarios", details: variables.name || null });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Employee> & { id: string }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      // Fetch old data for diff
      const { data: oldData } = await supabase.from("employees").select("*").eq("id", id).eq("company_id", companyId).single();
      const { data, error } = await supabase.from("employees").update(updates).eq("id", id).eq("company_id", companyId).select().single();
      if (error) throw error;
      return { employee: data, oldData };
    },
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Funcionário atualizado");
      const diff = result?.oldData ? buildDiff(result.oldData, { ...result.oldData, ...variables }, Object.keys(variables).filter(k => k !== "id")) : undefined;
      if (companyId) logAction({ companyId, userId: user?.id, action: "Funcionário atualizado", module: "funcionarios", details: variables.name || variables.id, diff });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { error } = await supabase.from("employees").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Funcionário excluído");
      if (companyId) logAction({ companyId, userId: user?.id, action: "Funcionário excluído", module: "funcionarios", details: id });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}