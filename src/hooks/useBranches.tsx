import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTS_ACTIVE_OR_LEGACY_NULL } from "@/lib/product-active-filter";
import { fetchMyCompanyMemberships } from "@/lib/company-memberships";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";

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

      type CompanyRow = {
        id: string;
        name: string | null;
        cnpj: string | null;
        parent_company_id: string | null;
        logo_url: string | null;
      };

      // Mesma fonte que useCompany: RPC bypassa RLS em company_users (SELECT direto pode vir []).
      let memberships: Awaited<ReturnType<typeof fetchMyCompanyMemberships>>;
      try {
        memberships = await fetchMyCompanyMemberships(user.id);
      } catch {
        return [];
      }
      const companyIds = memberships.filter((m) => m.is_active).map((m) => m.company_id);
      if (companyIds.length === 0) return [];

      let companies: CompanyRow[] | null = (
        await supabase
          .from("companies")
          .select("id, name, cnpj, parent_company_id, logo_url")
          .in("id", companyIds)
      ).data;

      // Fallback: em alguns ambientes o .in() pode retornar vazio com RLS/postgrest; busca por id evita Filiais “sem matriz”.
      if (!companies?.length && companyIds.length > 0) {
        const oneByOne: CompanyRow[] = [];
        for (const cid of companyIds) {
          const { data: row } = await supabase
            .from("companies")
            .select("id, name, cnpj, parent_company_id, logo_url")
            .eq("id", cid)
            .maybeSingle();
          if (row) oneByOne.push(row as CompanyRow);
        }
        companies = oneByOne;
      }

      // REST ainda vazio: mesmo padrão de Empresa/Fiscal — RPC bypassa RLS em companies.
      if (!companies?.length && companyIds.length > 0) {
        const fromRpc: CompanyRow[] = [];
        for (const cid of companyIds) {
          const { data: raw, error: rpcErr } = await supabase.rpc("get_company_record", { p_company_id: cid });
          if (rpcErr || raw == null || typeof raw !== "object") continue;
          const r = raw as Record<string, unknown>;
          fromRpc.push({
            id: String(r.id ?? cid),
            name: (r.name as string) ?? null,
            cnpj: (r.cnpj as string) ?? null,
            parent_company_id: (r.parent_company_id as string) ?? null,
            logo_url: (r.logo_url as string) ?? null,
          });
        }
        companies = fromRpc.length ? fromRpc : null;
      }

      if (!companies?.length) return [];

      const { data: children } = await supabase
        .from("companies")
        .select("id, name, cnpj, parent_company_id, logo_url")
        .in("parent_company_id", companyIds);

      const allCompanies = new Map<string, CompanyRow>();
      for (const c of companies) allCompanies.set(c.id, c);
      if (children) {
        for (const c of children) allCompanies.set(c.id, c);
      }

      const accessible = new Set(companyIds);

      return Array.from(allCompanies.values()).map((c) => {
        // Matriz na UI = raiz na hierarquia que o usuário enxerga.
        // Legado/onboarding: parent_company_id aponta para UUID inacessível ou lixo → ainda é "matriz" para não sumir da lista.
        const parentInTree = Boolean(c.parent_company_id && accessible.has(c.parent_company_id));
        return {
          id: c.id,
          name: c.name || "Sem nome",
          cnpj: c.cnpj ?? undefined,
          parent_company_id: c.parent_company_id,
          is_parent: !parentInTree,
          logo_url: c.logo_url ?? undefined,
        };
      });
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
        .update({ parent_company_id: parentId })
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
      const { data: company, error: companyErr } = await supabase
        .from("companies")
        .insert({ name, cnpj: cnpj || null, parent_company_id: parentId })
        .select("id")
        .maybeSingle();

      if (companyErr || !company?.id) {
        throw new Error(companyErr?.message || "Falha ao criar empresa");
      }

      const { error: linkErr } = await supabase.rpc("link_user_to_company", {
        p_company_id: company.id,
        p_user_id: userId,
        p_role: "admin",
      });

      if (linkErr) {
        console.warn("[createBranch] link_user_to_company warning:", linkErr.message);
      }

      logAction({ companyId: parentId, userId, action: "Filial criada", module: "filiais", details: name });
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
        .update({ name, cnpj: cnpj || null })
        .eq("id", companyId);
      if (error) throw error;
      logAction({ companyId, action: "Filial editada", module: "filiais", details: name });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Filial atualizada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Sync products from parent to branch.
 * GOVERNANCE: Only the matrix (parent) can push products to branches.
 * Supports local price margin per branch.
 */
export function useSyncProducts() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ fromCompanyId, toCompanyId, priceMarginPct = 0 }: { 
      fromCompanyId: string; 
      toCompanyId: string;
      priceMarginPct?: number;
    }) => {
      type CompanyParentRow = { id: string; parent_company_id: string | null };
      type ProductLiteRow = { sku: string | null; name: string | null };
      type SourceProductRow = {
        id: string;
        created_at: string;
        updated_at: string;
        stock_quantity: number | null;
        sku: string | null;
        name: string | null;
        price: number | null;
        [key: string]: unknown;
      };

      // GOVERNANCE: Verify fromCompanyId is a parent (matrix) company
      const { data: fromCompany } = await supabase
        .from("companies")
        .select("id, parent_company_id")
        .eq("id", fromCompanyId)
        .single();

      if (!fromCompany) throw new Error("Empresa origem não encontrada");
      if ((fromCompany as CompanyParentRow).parent_company_id) {
        throw new Error("Apenas a matriz pode sincronizar produtos para filiais. Filiais não podem puxar dados.");
      }

      // Verify toCompanyId is a child of fromCompanyId
      const { data: toCompany } = await supabase
        .from("companies")
        .select("id, parent_company_id")
        .eq("id", toCompanyId)
        .single();

      if (!toCompany || (toCompany as CompanyParentRow).parent_company_id !== fromCompanyId) {
        throw new Error("A empresa destino não é filial desta matriz");
      }

      // Fetch source products
      const { data: sourceProducts, error: fetchErr } = await supabase
        .from("products")
        .select("*")
        .eq("company_id", fromCompanyId)
        .or(PRODUCTS_ACTIVE_OR_LEGACY_NULL);

      if (fetchErr) throw fetchErr;
      if (!sourceProducts || sourceProducts.length === 0) throw new Error("Nenhum produto encontrado na matriz");

      // Get existing products in target to avoid duplicates
      const { data: existingProducts } = await supabase
        .from("products")
        .select("sku, name")
        .eq("company_id", toCompanyId);

      const existingSkus = new Set(
        ((existingProducts || []) as ProductLiteRow[])
          .map((p) => p.sku)
          .filter((v): v is string => Boolean(v))
      );
      const existingNames = new Set(
        ((existingProducts || []) as ProductLiteRow[])
          .map((p) => p.name)
          .filter((v): v is string => Boolean(v))
      );

      // Filter out duplicates
      const newProducts = (sourceProducts as SourceProductRow[]).filter((p) => {
        if (p.sku && existingSkus.has(p.sku)) return false;
        if (existingNames.has(p.name)) return false;
        return true;
      });

      if (newProducts.length === 0) throw new Error("Todos os produtos já existem na filial");

      // Insert products with new company_id, applying price margin
      const marginMultiplier = 1 + (priceMarginPct / 100);
      const toInsert = newProducts.map((p) => {
        const { id, created_at, updated_at, stock_quantity, ...rest } = p;
        return { 
          ...rest, 
          company_id: toCompanyId,
          stock_quantity: 0, // Branch starts with zero stock
          price: Math.round((Number(rest.price || 0)) * marginMultiplier * 100) / 100,
        };
      });

      const { error: insertErr } = await supabase.from("products").insert(toInsert);
      if (insertErr) throw insertErr;

      return { synced: toInsert.length };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(`${data.synced} produtos sincronizados com estoque zerado!`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Auto-sync: push a single new product to all branches of the parent */
export async function autoSyncProductToBranches(productId: string, parentCompanyId: string) {
  try {
    type BranchRow = { id: string };
    type ProductRow = {
      id: string;
      created_at: string;
      updated_at: string;
      stock_quantity: number | null;
      company_id: string;
      sku: string | null;
      name: string | null;
      [key: string]: unknown;
    };

    // Get all branches of this parent
    const { data: branches } = await supabase
      .from("companies")
      .select("id")
      .eq("parent_company_id", parentCompanyId);

    if (!branches || branches.length === 0) return;

    // Get the product
    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("company_id", parentCompanyId)
      .single();

    if (!product) return;

    for (const branch of branches as BranchRow[]) {
      // Check if already exists
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("company_id", branch.id)
        .or(`sku.eq.${(product as ProductRow).sku || "NONE"},name.eq.${(product as ProductRow).name}`)
        .maybeSingle();

      if (existing) continue;

      const { id, created_at, updated_at, stock_quantity, company_id, ...rest } = product as ProductRow;
      await supabase.from("products").insert({
        ...rest,
        company_id: branch.id,
        stock_quantity: 0,
      });
    }
  } catch (err) {
    console.warn("[autoSync] Erro ao sincronizar produto para filiais:", err);
  }
}

/** Delete a branch company */
export function useDeleteBranch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: string) => {
      // Use the SECURITY DEFINER function that handles all FK dependencies
      const { error } = await supabase.rpc("admin_delete_company", {
        p_company_id: companyId,
        p_allow_non_demo: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Filial excluída com sucesso!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
