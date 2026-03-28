/**
 * usePDVProducts — Product loading, caching, and refresh for the POS.
 */
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cacheSet, cacheGet } from "@/lib/offline-cache";
import { toast } from "sonner";
import type { PDVProduct } from "@/hooks/usePDV";

export function usePDVProducts(companyId: string | null) {
  const [products, setProducts] = useState<PDVProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const loadProducts = useCallback(async () => {
    if (!companyId) return;
    setLoadingProducts(true);

    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, sku, barcode, price, cost_price, stock_quantity, unit, category, ncm, image_url, cfop, csosn, cst_icms, origem, cst_pis, cst_cofins, aliq_icms, cest, mva, reorder_point")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name");

        if (data && data.length > 0) {
          setProducts(data as PDVProduct[]);
          cacheSet("pdv_products", companyId, data).catch(() => {});
        } else if (error) {
          throw error;
        }
      } else {
        throw new Error("offline");
      }
    } catch {
      const cached = await cacheGet<PDVProduct[]>("pdv_products", companyId);
      if (cached?.data && cached.data.length > 0) {
        setProducts(cached.data);
        if (!navigator.onLine) {
          toast.info("Produtos carregados do cache offline", { id: "pdv-offline-products" });
        }
      }
    }

    setLoadingProducts(false);
  }, [companyId]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Refresh every 2 minutes
  useEffect(() => {
    if (!companyId) return;
    const interval = setInterval(() => { loadProducts(); }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [companyId, loadProducts]);

  const refreshProducts = useCallback(() => { loadProducts(); }, [loadProducts]);

  /** Update local stock after a sale (optimistic). */
  const decrementLocalStock = useCallback((soldItems: Array<{ id: string; quantity: number }>) => {
    setProducts(prev => prev.map(p => {
      const sold = soldItems.find(c => c.id === p.id);
      return sold ? { ...p, stock_quantity: Math.max(0, p.stock_quantity - sold.quantity) } : p;
    }));
  }, []);

  return { products, loadingProducts, refreshProducts, decrementLocalStock };
}
