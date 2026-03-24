import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { logAction } from "@/services/ActionLogger";

export interface ProductLabel {
  id: string;
  product_id: string;
  status: "pendente" | "impressa";
  product?: { name: string; sku: string; barcode?: string; price: number };
}

export function useProductLabels(tab: "pendente" | "impressa" | "todas") {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["product-labels", companyId, tab],
    queryFn: async () => {
      if (!companyId) return [];
      type ProductLabelRow = {
        id: string;
        product_id: string;
        status: "pendente" | "impressa";
        products?: { name: string; sku: string; barcode?: string; price: number } | null;
      };
      let query = supabase
        .from("product_labels")
        .select("id, product_id, status, products(name, sku, barcode, price)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (tab !== "todas") query = query.eq("status", tab);
      const { data } = await query.limit(200);
      return (data || []).map((d: Record<string, unknown>) => ({ ...d, product: (d as { products?: unknown }).products ?? undefined })) as ProductLabel[];
    },
    enabled: !!companyId,
  });
}

export function useMarkLabelsPrinted() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await supabase.from("product_labels").update({ status: "impressa" }).in("id", ids);
      if (companyId) logAction({ companyId, userId: user?.id, action: "Etiquetas marcadas como impressas", module: "produtos", details: `${ids.length} etiqueta(s)` });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-labels"] }),
  });
}

export function useResetLabels() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await supabase.from("product_labels").update({ status: "pendente" }).in("id", ids);
      if (companyId) logAction({ companyId, userId: user?.id, action: "Etiquetas resetadas para pendente", module: "produtos", details: `${ids.length} etiqueta(s)` });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-labels"] }),
  });
}
