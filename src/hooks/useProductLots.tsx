import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { logAction } from "@/services/ActionLogger";
import { toast } from "sonner";

export interface ProductLot {
  id: string;
  company_id: string;
  product_id: string;
  lot_number: string;
  manufacture_date: string | null;
  expiry_date: string | null;
  quantity: number;
  unit_cost: number | null;
  supplier: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  products?: { name: string; sku: string };
}

export function useProductLots(productId?: string) {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["product_lots", companyId, productId],
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from("product_lots")
        .select("*, products(name, sku)")
        .eq("company_id", companyId)
        .order("expiry_date", { ascending: true });
      if (productId) query = query.eq("product_id", productId);
      const { data, error } = await query;
      if (error) throw error;
      return data as ProductLot[];
    },
    enabled: !!companyId,
  });
}

export function useExpiringLots(daysAhead = 30) {
  const { companyId } = useCompany();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  return useQuery({
    queryKey: ["expiring_lots", companyId, daysAhead],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("product_lots")
        .select("*, products(name, sku)")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .gt("quantity", 0)
        .not("expiry_date", "is", null)
        .lte("expiry_date", futureDate.toISOString().split("T")[0])
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return data as ProductLot[];
    },
    enabled: !!companyId,
  });
}

export function useCreateProductLot() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (lot: {
      product_id: string;
      lot_number: string;
      manufacture_date?: string;
      expiry_date?: string;
      quantity: number;
      unit_cost?: number;
      supplier?: string;
      notes?: string;
    }) => {
      if (!companyId) throw new Error("Sem empresa");
      const { data, error } = await supabase
        .from("product_lots")
        .insert({ ...lot, company_id: companyId })
        .select()
        .single();
      if (error) throw error;
      logAction({ companyId, userId: user?.id, action: "Lote cadastrado", module: "estoque", details: `Lote ${lot.lot_number} (produto ${lot.product_id})` });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_lots"] });
      qc.invalidateQueries({ queryKey: ["expiring_lots"] });
      toast.success("Lote cadastrado");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteProductLot() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { error } = await supabase.from("product_lots").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
      logAction({ companyId, userId: user?.id, action: "Lote excluído", module: "estoque", details: id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_lots"] });
      qc.invalidateQueries({ queryKey: ["expiring_lots"] });
      toast.success("Lote removido");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
