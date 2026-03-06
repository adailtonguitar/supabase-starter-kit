import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";

export type ShowroomStatus = "montado" | "desmontado" | "danificado" | "reposicao";

export interface ShowroomItem {
  id: string;
  product_id: string;
  status: ShowroomStatus;
  location: string;
  notes: string;
  is_mostruario: boolean;
  mostruario_discount: number;
  updated_at: string;
}

export function useShowroomItems() {
  const { companyId } = useCompany();
  const [items, setItems] = useState<ShowroomItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("showroom_items")
        .select("*")
        .eq("company_id", companyId);
      if (error) throw error;
      setItems((data as any[]) || []);
    } catch (e: any) {
      console.error("[useShowroomItems]", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const upsert = async (productId: string, updates: Partial<Omit<ShowroomItem, "id" | "product_id">>) => {
    if (!companyId) return;
    const { error } = await supabase.from("showroom_items").upsert({
      company_id: companyId,
      product_id: productId,
      ...updates,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "company_id,product_id" });
    if (error) { toast.error("Erro ao atualizar exposição"); return; }
    fetch();
  };

  const getByProductId = (productId: string): ShowroomItem | undefined => {
    return items.find(i => i.product_id === productId);
  };

  return { items, loading, upsert, getByProductId, refresh: fetch };
}
