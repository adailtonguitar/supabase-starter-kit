import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

export interface Promotion {
  id: string;
  name: string;
  description?: string;
  promo_type: string;
  discount_percent: number;
  fixed_price: number;
  buy_quantity: number;
  pay_quantity: number;
  scope: string;
  category_name?: string;
  min_quantity: number;
  starts_at: string;
  ends_at?: string;
  active_days?: number[];
  product_ids?: string[];
  is_active: boolean;
}

export function usePromotions() {
  const { companyId } = useCompany();
  const qc = useQueryClient();

  const { data: promotions = [], isLoading: loading } = useQuery({
    queryKey: ["promotions", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("promotions")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      return (data || []) as Promotion[];
    },
    enabled: !!companyId,
  });

  const createPromotion = async (input: any) => {
    if (!companyId) return;
    const { error } = await supabase.from("promotions").insert({ ...input, company_id: companyId });
    if (error) { toast.error(error.message); throw error; }
    toast.success("Promoção criada!");
    qc.invalidateQueries({ queryKey: ["promotions"] });
  };

  const togglePromotion = async (id: string, isActive: boolean) => {
    if (!companyId) return;
    const { error } = await supabase.from("promotions").update({ is_active: isActive }).eq("id", id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao atualizar promoção"); return; }
    qc.invalidateQueries({ queryKey: ["promotions"] });
  };

  const deletePromotion = async (id: string) => {
    if (!companyId) return;
    await supabase.from("promotions").delete().eq("id", id).eq("company_id", companyId);
    toast.success("Promoção excluída");
    qc.invalidateQueries({ queryKey: ["promotions"] });
  };

  return { promotions, loading, createPromotion, togglePromotion, deletePromotion };
}
