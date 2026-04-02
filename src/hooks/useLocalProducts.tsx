/**
 * useLocalProducts — Offline-first product access.
 * Reads from Supabase when online, falls back to IndexedDB cache when offline.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTS_ACTIVE_OR_LEGACY_NULL } from "@/lib/product-active-filter";
import { useCompany } from "./useCompany";
import { cacheSet, cacheGet } from "@/lib/offline-cache";
import { toast } from "sonner";
import type { Product } from "./useProducts";

export type LocalProduct = Product;

export function useLocalProducts() {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["local-products", companyId],
    queryFn: async (): Promise<LocalProduct[]> => {
      if (!companyId) return [];

      // Online: fetch from Supabase and update cache
      if (navigator.onLine) {
        try {
          const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("company_id", companyId)
            .or(PRODUCTS_ACTIVE_OR_LEGACY_NULL)
            .order("name");
          if (error) throw error;
          const products = (data || []) as LocalProduct[];
          // Update IndexedDB cache in background
          cacheSet("products", companyId, products).catch(() => {});
          return products;
        } catch (err) {
          console.warn("[useLocalProducts] Online fetch failed, trying cache:", err);
          // Fall through to cache
        }
      }

      // Offline or fetch failed: read from IndexedDB
      const cached = await cacheGet<LocalProduct[]>("products", companyId);
      if (cached) {
        // console.log(`[useLocalProducts] Serving ${cached.data.length} products from cache (stale: ${cached.stale})`);
        return cached.data;
      }

      return [];
    },
    enabled: !!companyId,
    staleTime: navigator.onLine ? 30_000 : Infinity,
    retry: navigator.onLine ? 1 : 0,
  });
}

export function useCreateLocalProduct() {
  const qc = useQueryClient();
  const { companyId } = useCompany();

  return useMutation({
    mutationFn: async (product: Partial<Product>) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase
        .from("products")
        .insert({ ...product, company_id: companyId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["local-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto criado");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
