import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { logAction, buildDiff } from "@/services/ActionLogger";
import { useAuth } from "@/hooks/useAuth";

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

type PromotionInput = Omit<Promotion, "id"> & {
  description?: string;
  ends_at?: string;
  active_days?: number[];
  product_ids?: string[];
};

export function usePromotions() {
  const { companyId } = useCompany();
  const { user } = useAuth();
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

  const createPromotion = async (input: PromotionInput) => {
    if (!companyId) return;
    const { error } = await supabase.from("promotions").insert({ ...input, company_id: companyId });
    if (error) { toast.error(error.message); throw error; }
    logAction({ companyId, userId: user?.id, action: "Promoção criada", module: "promocoes", details: input.name });
    toast.success("Promoção criada!");
    qc.invalidateQueries({ queryKey: ["promotions"] });
  };

  const togglePromotion = async (id: string, isActive: boolean) => {
    if (!companyId) return;
    const { data: oldData } = await supabase.from("promotions").select("is_active").eq("id", id).eq("company_id", companyId).single();
    const { error } = await supabase.from("promotions").update({ is_active: isActive }).eq("id", id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao atualizar promoção"); return; }
    const diff = oldData ? buildDiff(oldData, { is_active: isActive }, ["is_active"]) : undefined;
    logAction({ companyId, userId: user?.id, action: isActive ? "Promoção ativada" : "Promoção desativada", module: "promocoes", details: id, diff });
    qc.invalidateQueries({ queryKey: ["promotions"] });
  };

  const deletePromotion = async (id: string) => {
    if (!companyId) return;
    await supabase.from("promotions").delete().eq("id", id).eq("company_id", companyId);
    logAction({ companyId, userId: user?.id, action: "Promoção excluída", module: "promocoes", details: id });
    toast.success("Promoção excluída");
    qc.invalidateQueries({ queryKey: ["promotions"] });
  };

  return { promotions, loading, createPromotion, togglePromotion, deletePromotion };
}
