import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

export function useReorderSuggestions() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["reorder-suggestions", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .not("reorder_point", "is", null);
      return (data || []).filter((p: any) => Number(p.stock_quantity) <= Number(p.reorder_point));
    },
    enabled: !!companyId,
  });
}

export function usePurchaseOrders() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["purchase-orders", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("purchase_orders")
        .select("*, suppliers(name, email)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!companyId,
  });
}

export function useCreatePurchaseOrder() {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { supplier_id?: string; created_by: string; items: { product_id: string; quantity: number; unit_cost: number }[] }) => {
      if (!companyId) throw new Error("Sem empresa");
      const totalValue = input.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
      const { data: order, error } = await supabase
        .from("purchase_orders")
        .insert({ company_id: companyId, supplier_id: input.supplier_id || null, status: "rascunho", total_value: totalValue, created_by: input.created_by })
        .select()
        .single();
      if (error) throw error;
      const items = input.items.map((i) => ({ order_id: order.id, product_id: i.product_id, quantity: i.quantity, unit_cost: i.unit_cost, total: i.quantity * i.unit_cost, company_id: companyId }));
      await supabase.from("purchase_order_items").insert(items);
      return order;
    },
    onSuccess: () => {
      toast.success("Pedido de compra criado!");
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdatePurchaseOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: string; [key: string]: any }) => {
      const { id, status, ...rest } = input;
      const { error } = await supabase.from("purchase_orders").update({ status, ...rest }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado!");
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}
