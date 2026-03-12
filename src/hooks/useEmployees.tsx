import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";

export type Employee = any;
export type EmployeeInsert = any;

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
  return useMutation({
    mutationFn: async (e: Omit<EmployeeInsert, "company_id">) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase.from("employees").insert({ ...e, company_id: companyId }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Funcionário criado"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Employee> & { id: string }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase.from("employees").update(updates).eq("id", id).eq("company_id", companyId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Funcionário atualizado"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { error } = await supabase.from("employees").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Funcionário excluído"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}