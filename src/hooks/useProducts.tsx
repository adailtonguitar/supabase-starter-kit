import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { autoSyncProductToBranches } from "./useBranches";
import { recordPriceChange } from "@/lib/price-history";
import { logAction, buildDiff } from "@/services/ActionLogger";
import { PRODUCTS_ACTIVE_OR_LEGACY_NULL } from "@/lib/product-active-filter";
import { ensureValidSku, sanitizeSkuInput, SKU_REGEX } from "@/lib/sku-sanitizer";

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  fiscal_category_id?: string;
  ncm?: string;
  cfop?: string;
  csosn?: string;
  cst_icms?: string;
  aliq_icms?: number;
  cst_pis?: string;
  aliq_pis?: number;
  cst_cofins?: string;
  aliq_cofins?: number;
  cest?: string;
  gtin_tributavel?: string;
  origem?: number;
  category?: string;
  price: number;
  cost_price?: number;
  stock_quantity: number;
  min_stock?: number;
  unit: string;
  company_id: string;
  is_active?: boolean;
  image_url?: string;
  shelf_location?: string;
  voltage?: string;
  warranty_months?: number;
  serial_number?: string;
}

/**
 * Paginated product fetching — loads PAGE_SIZE products per request.
 * Use `fetchNextPage` / `hasNextPage` for infinite scroll.
 */
const PRODUCTS_PAGE_SIZE = 100;

export function useProducts() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["products", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      // Paginated fetch to avoid loading thousands of products at once
      const allProducts: Product[] = [];
      let from = 0;
      let keepFetching = true;

      while (keepFetching) {
        const { data, error } = await supabase
          .from("products")
          .select("id,name,sku,barcode,fiscal_category_id,ncm,cfop,csosn,cst_icms,origem,category,price,cost_price,stock_quantity,min_stock,unit,company_id,is_active,image_url,shelf_location,voltage,warranty_months,serial_number")
          .eq("company_id", companyId)
          .or(PRODUCTS_ACTIVE_OR_LEGACY_NULL)
          .order("name")
          .range(from, from + PRODUCTS_PAGE_SIZE - 1);
        if (error) throw error;
        const batch = (data || []) as Product[];
        allProducts.push(...batch);
        if (batch.length < PRODUCTS_PAGE_SIZE) {
          keepFetching = false;
        } else {
          from += PRODUCTS_PAGE_SIZE;
        }
      }

      return allProducts;
    },
    enabled: !!companyId,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (product: Partial<Product>) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      // Blindagem final: garante SKU válido antes do INSERT (constraint products_sku_format_chk)
      const safeSku = ensureValidSku(product.sku);
      const { data, error } = await supabase
        .from("products")
        .insert({ ...product, sku: safeSku, company_id: companyId })
        .select()
        .single();
      if (error) throw error;
      return data as Product;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      if (companyId && data?.id) {
        autoSyncProductToBranches(data.id, companyId);
      }
      if (companyId) logAction({ companyId, userId: user?.id, action: "Produto criado", module: "produtos", details: data?.name || null });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Product> & { id: string }) => {
      if (!companyId) throw new Error("Empresa não encontrada");

      // Fetch current product for diff and price history tracking
      const { data: oldData } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .eq("company_id", companyId)
        .single();

      // Blindagem: se o caller mandou SKU, sanitiza antes do UPDATE.
      // (Se não mandou, NÃO toca no SKU existente.)
      const safeUpdates = { ...updates };
      if (Object.prototype.hasOwnProperty.call(updates, "sku")) {
        safeUpdates.sku = ensureValidSku(updates.sku);
      }

      const { data, error } = await supabase
        .from("products")
        .update(safeUpdates)
        .eq("id", id)
        .eq("company_id", companyId)
        .select()
        .single();
      if (error) throw error;

      // Record price changes automatically
      if (oldData) {
        if (updates.price !== undefined && oldData.price !== updates.price) {
          recordPriceChange({
            company_id: companyId,
            product_id: id,
            field_changed: "price",
            old_value: oldData.price || 0,
            new_value: updates.price,
            source: "manual",
          });
        }
        if (updates.cost_price !== undefined && oldData.cost_price !== updates.cost_price) {
          recordPriceChange({
            company_id: companyId,
            product_id: id,
            field_changed: "cost_price",
            old_value: oldData.cost_price || 0,
            new_value: updates.cost_price,
            source: "manual",
          });
        }
      }

      return { product: data as Product, oldData };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      const diff = result.oldData ? buildDiff(result.oldData, { ...result.oldData, ...variables }, Object.keys(variables).filter(k => k !== "id")) : undefined;
      if (companyId) logAction({ companyId, userId: user?.id, action: "Produto atualizado", module: "produtos", details: variables.name || variables.id, diff });
    },
  });
}

export function useBulkUpdateProducts() {
  const queryClient = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (updates: Array<{ id: string; data: Partial<Product> }>) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      if (!updates.length) return { updatedCount: 0, auditRows: [] as Array<{ id: string; name?: string; diff: ReturnType<typeof buildDiff> }> };

      let updatedCount = 0;
      const auditRows: Array<{ id: string; name?: string; diff: ReturnType<typeof buildDiff> }> = [];
      for (const item of updates) {
        const { data: oldData, error: oldError } = await supabase
          .from("products")
          .select("*")
          .eq("id", item.id)
          .eq("company_id", companyId)
          .single();
        if (oldError) throw oldError;

        // Blindagem em lote: sanitiza SKU se presente no payload
        const safeItemData = { ...item.data };
        if (Object.prototype.hasOwnProperty.call(item.data, "sku")) {
          safeItemData.sku = ensureValidSku(item.data.sku);
        }

        const { error } = await supabase
          .from("products")
          .update(safeItemData)
          .eq("id", item.id)
          .eq("company_id", companyId);
        if (error) throw error;

        const nextData = { ...(oldData || {}), ...(item.data || {}) } as Record<string, unknown>;
        const diff = buildDiff(
          (oldData || {}) as Record<string, unknown>,
          nextData,
          Object.keys(item.data || {}),
        );
        auditRows.push({
          id: item.id,
          name: (oldData as { name?: string } | null)?.name,
          diff,
        });
        updatedCount += 1;
      }

      return { updatedCount, auditRows };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`${result.updatedCount} produto(s) atualizados com sugestão fiscal`);
      if (companyId) {
        const summary = result.auditRows
          .slice(0, 10)
          .map((row) => `${row.name || row.id}: ${row.diff.map((entry) => `${entry.field}=${String(entry.to ?? "")}`).join(", ")}`)
          .join(" | ");

        logAction({
          companyId,
          userId: user?.id,
          action: "Produtos atualizados em lote",
          module: "produtos",
          details: `${result.updatedCount} produto(s) com sugestão fiscal${summary ? ` | ${summary}` : ""}`,
          diff: result.auditRows.flatMap((row) =>
            row.diff.map((entry) => ({
              field: `${row.name || row.id}.${entry.field}`,
              from: entry.from,
              to: entry.to,
            })),
          ),
        });
      }
    },
    onError: (e: Error) => toast.error(`Erro ao atualizar em lote: ${e.message}`),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      // Delete dependent records — but NOT sale_items (preserves sales history)
      await supabase.from("product_labels").delete().eq("product_id", id).eq("company_id", companyId);
      await supabase.from("stock_movements").delete().eq("product_id", id).eq("company_id", companyId);
      await supabase.from("product_lots").delete().eq("product_id", id).eq("company_id", companyId);
      
      // Soft-delete: deactivate product instead of hard delete to preserve referential integrity
      const { error } = await supabase.from("products").update({ is_active: false }).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto excluído com sucesso");
      if (companyId) logAction({ companyId, userId: user?.id, action: "Produto excluído", module: "produtos", details: id });
    },
    onError: (e: Error) => toast.error(`Erro ao excluir: ${e.message}`),
  });
}
