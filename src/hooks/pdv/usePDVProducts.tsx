import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PDVProduct } from "@/hooks/usePDV";
import { PRODUCTS_ACTIVE_OR_LEGACY_NULL } from "@/lib/product-active-filter";

export function usePDVProducts(companyId: string | null) {
  const [products, setProducts] = useState<PDVProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const loadProducts = useCallback(async () => {
    if (!companyId) return;
    setLoadingProducts(true);

    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("company_id", companyId)
        .or(PRODUCTS_ACTIVE_OR_LEGACY_NULL)
        .order("name");

      if (error) throw error;
      setProducts((data || []) as PDVProduct[]);
    } catch (err) {
      console.error("[usePDVProducts] Error loading products:", err);
    } finally {
      setLoadingProducts(false);
    }
  }, [companyId]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  useEffect(() => {
    if (!companyId) return;
    const interval = setInterval(() => { loadProducts(); }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [companyId, loadProducts]);

  const refreshProducts = useCallback(() => { loadProducts(); }, [loadProducts]);

  const decrementLocalStock = useCallback((soldItems: Array<{ id: string; quantity: number }>) => {
    setProducts(prev => prev.map(p => {
      const sold = soldItems.find(c => c.id === p.id);
      return sold ? { ...p, stock_quantity: Math.max(0, p.stock_quantity - sold.quantity) } : p;
    }));
  }, []);

  return { products, loadingProducts, refreshProducts, decrementLocalStock };
}
