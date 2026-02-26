import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface Branch {
  id: string;
  name: string;
  cnpj?: string;
  parent_company_id: string | null;
  is_parent: boolean;
  logo_url?: string;
}

/** Returns all companies the current user has access to, with hierarchy info */
export function useBranches() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["branches", user?.id],
    queryFn: async (): Promise<Branch[]> => {
      if (!user) return [];

      // Get all companies this user belongs to
      const { data: cuData } = await supabase
        .from("company_users")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (!cuData || cuData.length === 0) return [];

      const companyIds = cuData.map((cu: any) => cu.company_id);

      const { data: companies } = await supabase
        .from("companies")
        .select("id, name, cnpj, parent_company_id, logo_url")
        .in("id", companyIds);

      if (!companies) return [];

      // Also fetch children of these companies (filiais que o user pode não estar diretamente)
      const { data: children } = await supabase
        .from("companies")
        .select("id, name, cnpj, parent_company_id, logo_url")
        .in("parent_company_id", companyIds);

      const allCompanies = new Map<string, any>();
      for (const c of companies) allCompanies.set(c.id, c);
      if (children) {
        for (const c of children) allCompanies.set(c.id, c);
      }

      return Array.from(allCompanies.values()).map((c: any) => ({
        id: c.id,
        name: c.name || "Sem nome",
        cnpj: c.cnpj,
        parent_company_id: c.parent_company_id,
        is_parent: !c.parent_company_id,
        logo_url: c.logo_url,
      }));
    },
    enabled: !!user,
  });
}

/** Set a company as branch of another */
export function useSetParentCompany() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ companyId, parentId }: { companyId: string; parentId: string | null }) => {
      const { error } = await supabase
        .from("companies")
        .update({ parent_company_id: parentId } as any)
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Hierarquia atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Create a new branch company linked to the current parent */
export function useCreateBranch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, cnpj, parentId, userId }: { name: string; cnpj?: string; parentId: string; userId: string }) => {
      // 1) Create the company
      const { data: company, error: companyErr } = await supabase
        .from("companies")
        .insert({ name, cnpj: cnpj || null, parent_company_id: parentId } as any)
        .select("id")
        .single();
      if (companyErr) throw companyErr;

      // 2) Link current user as admin
      const { error: cuErr } = await supabase
        .from("company_users")
        .insert({ company_id: company.id, user_id: userId, role: "admin", is_active: true });
      if (cuErr) throw cuErr;

      return company;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Filial criada com sucesso!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Delete a branch company */
export function useDeleteBranch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: string) => {
      // Delete the company FIRST (while user still has RLS access via company_users)
      const { error, data } = await supabase
        .from("companies")
        .delete()
        .eq("id", companyId)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Falha ao excluir: permissão negada pelo banco de dados.");

      // company_users rows should cascade or we clean up
      await supabase
        .from("company_users")
        .delete()
        .eq("company_id", companyId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Filial excluída com sucesso!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
