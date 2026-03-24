/**
 * usePDVPromotions — Loads active promotions for the company.
 */
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PromotionRecord } from "@/integrations/supabase/fiscal.types";

export function usePDVPromotions(companyId: string | null) {
  const [activePromos, setActivePromos] = useState<PromotionRecord[]>([]);

  const loadPromotions = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data } = await supabase
        .from("promotions")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true);
      setActivePromos((data || []) as PromotionRecord[]);
    } catch {}
  }, [companyId]);

  useEffect(() => { loadPromotions(); }, [loadPromotions]);

  return { activePromos };
}
