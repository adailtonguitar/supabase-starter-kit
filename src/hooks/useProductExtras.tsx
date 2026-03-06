import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";

export interface Volume {
  id: string;
  label: string;
  dimensions?: string;
  weight?: string;
}

export interface Variation {
  id: string;
  type: "cor" | "tecido" | "tamanho";
  value: string;
  priceAdjust?: number;
}

export interface FurnitureExtra {
  volumes: Volume[];
  variations: Variation[];
}

export function useProductExtras() {
  const { companyId } = useCompany();
  const [extras, setExtras] = useState<Record<string, FurnitureExtra>>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("product_extras")
        .select("product_id, volumes, variations")
        .eq("company_id", companyId);
      if (error) throw error;
      const map: Record<string, FurnitureExtra> = {};
      (data || []).forEach((row: any) => {
        map[row.product_id] = {
          volumes: (row.volumes as Volume[]) || [],
          variations: (row.variations as Variation[]) || [],
        };
      });
      setExtras(map);
    } catch (e) {
      console.error("[useProductExtras]", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const getExtras = useCallback((productId: string): FurnitureExtra => {
    return extras[productId] || { volumes: [], variations: [] };
  }, [extras]);

  const updateExtras = useCallback(async (productId: string, update: Partial<FurnitureExtra>) => {
    if (!companyId) return;
    const current = extras[productId] || { volumes: [], variations: [] };
    const merged = { ...current, ...update };

    // Optimistic update
    setExtras(prev => ({ ...prev, [productId]: merged }));

    try {
      const { error } = await supabase
        .from("product_extras")
        .upsert({
          company_id: companyId,
          product_id: productId,
          volumes: merged.volumes as any,
          variations: merged.variations as any,
          updated_at: new Date().toISOString(),
        }, { onConflict: "company_id,product_id" });
      if (error) throw error;
    } catch (e) {
      console.error("[useProductExtras] save error", e);
      // Revert on error
      setExtras(prev => ({ ...prev, [productId]: current }));
    }
  }, [companyId, extras]);

  return { extras, loading, getExtras, updateExtras };
}
