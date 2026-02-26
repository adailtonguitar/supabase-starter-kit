import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface StockTransfer {
  id: string;
  from_company_id: string;
  to_company_id: string;
  status: "pending" | "in_transit" | "received" | "cancelled";
  notes?: string;
  created_by?: string;
  received_by?: string;
  created_at: string;
  received_at?: string;
  from_company?: { name: string };
  to_company?: { name: string };
  items?: StockTransferItem[];
}

export interface StockTransferItem {
  id: string;
  transfer_id: string;
  product_id: string;
  product_name: string;
  product_sku?: string;
  quantity: number;
  unit_cost: number;
}

export function useStockTransfers() {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["stock_transfers", companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from("stock_transfers" as any)
        .select("*, stock_transfer_items(*)")
        .or(`from_company_id.eq.${companyId},to_company_id.eq.${companyId}`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      // Fetch company names
      const companyIds = new Set<string>();
      for (const t of (data || [])) {
        companyIds.add((t as any).from_company_id);
        companyIds.add((t as any).to_company_id);
      }

      const { data: companies } = await supabase
        .from("companies")
        .select("id, name")
        .in("id", Array.from(companyIds));

      const nameMap = new Map((companies || []).map((c: any) => [c.id, c.name]));

      return (data || []).map((t: any) => ({
        ...t,
        from_company: { name: nameMap.get(t.from_company_id) || "?" },
        to_company: { name: nameMap.get(t.to_company_id) || "?" },
        items: t.stock_transfer_items || [],
      })) as StockTransfer[];
    },
    enabled: !!companyId,
  });
}

export function useCreateStockTransfer() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      from_company_id: string;
      to_company_id: string;
      notes?: string;
      items: { product_id: string; product_name: string; product_sku?: string; quantity: number; unit_cost?: number }[];
    }) => {
      if (!user) throw new Error("Não autenticado");

      const { data: transfer, error } = await supabase
        .from("stock_transfers" as any)
        .insert({
          from_company_id: input.from_company_id,
          to_company_id: input.to_company_id,
          notes: input.notes,
          status: "pending",
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      const items = input.items.map((item) => ({
        transfer_id: (transfer as any).id,
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.product_sku || "",
        quantity: item.quantity,
        unit_cost: item.unit_cost || 0,
      }));

      const { error: itemsError } = await supabase
        .from("stock_transfer_items" as any)
        .insert(items);

      if (itemsError) throw itemsError;

      return transfer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_transfers"] });
      toast.success("Transferência criada com sucesso");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useReceiveStockTransfer() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (transferId: string) => {
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase
        .from("stock_transfers" as any)
        .update({
          status: "received",
          received_by: user.id,
          received_at: new Date().toISOString(),
        })
        .eq("id", transferId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_transfers"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Transferência recebida! Estoque atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
