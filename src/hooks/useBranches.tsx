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
      // 1) Create the company (trigger was disabled — we handle company_users manually)
      const { data: company, error: companyErr } = await supabase
        .from("companies")
        .insert({ name, cnpj: cnpj || null, parent_company_id: parentId } as any)
        .select("id")
        .maybeSingle();

      if (companyErr || !company?.id) {
        throw new Error(companyErr?.message || "Falha ao criar empresa");
      }

      // 2) Link user as admin via SECURITY DEFINER function (bypasses RLS)
      const { error: linkErr } = await supabase.rpc("link_user_to_company" as any, {
        p_company_id: company.id,
        p_user_id: userId,
        p_role: "admin",
      });

      if (linkErr) {
        console.warn("[createBranch] link_user_to_company warning:", linkErr.message);
      }

      return { id: company.id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Filial criada com sucesso!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Update a branch company name/cnpj */
export function useUpdateBranch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ companyId, name, cnpj }: { companyId: string; name: string; cnpj?: string }) => {
      const { error } = await supabase
        .from("companies")
        .update({ name, cnpj: cnpj || null } as any)
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Filial atualizada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Sync products from parent to branch */
export function useSyncProducts() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ fromCompanyId, toCompanyId }: { fromCompanyId: string; toCompanyId: string }) => {
      // Fetch source products
      const { data: sourceProducts, error: fetchErr } = await supabase
        .from("products")
        .select("*")
        .eq("company_id", fromCompanyId)
        .eq("is_active", true);

      if (fetchErr) throw fetchErr;
      if (!sourceProducts || sourceProducts.length === 0) throw new Error("Nenhum produto encontrado na matriz");

      // Get existing products in target to avoid duplicates
      const { data: existingProducts } = await supabase
        .from("products")
        .select("sku, name")
        .eq("company_id", toCompanyId);

      const existingSkus = new Set((existingProducts || []).map((p: any) => p.sku).filter(Boolean));
      const existingNames = new Set((existingProducts || []).map((p: any) => p.name));

      // Filter out duplicates
      const newProducts = sourceProducts.filter((p: any) => {
        if (p.sku && existingSkus.has(p.sku)) return false;
        if (existingNames.has(p.name)) return false;
        return true;
      });

      if (newProducts.length === 0) throw new Error("Todos os produtos já existem na filial");

      // Insert products with new company_id
      const toInsert = newProducts.map((p: any) => {
        const { id, created_at, updated_at, ...rest } = p;
        return { ...rest, company_id: toCompanyId };
      });

      const { error: insertErr } = await supabase.from("products").insert(toInsert);
      if (insertErr) throw insertErr;

      return { synced: toInsert.length };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(`${data.synced} produtos sincronizados!`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Delete a branch company */
export function useDeleteBranch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: string) => {
      const dependentTables = [
        "fiscal_categories", "stock_movements", "financial_entries",
        "sales", "products", "clients", "promotions", "employees",
        "suppliers", "purchase_orders", "quotes",
      ];

      for (const table of dependentTables) {
        try {
          await supabase.from(table).delete().eq("company_id", companyId);
        } catch { /* skip */ }
      }

      const { error, data } = await supabase
        .from("companies")
        .delete()
        .eq("id", companyId)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Falha ao excluir: permissão negada.");

      await supabase.from("company_users").delete().eq("company_id", companyId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Filial excluída com sucesso!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
