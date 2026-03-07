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

      // Decrement stock from origin company
      for (const item of input.items) {
        const { data: product } = await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", item.product_id)
          .eq("company_id", input.from_company_id)
          .single();

        if (product) {
          const newStock = Math.max(0, (product as any).stock_quantity - item.quantity);
          await supabase
            .from("products")
            .update({ stock_quantity: newStock } as any)
            .eq("id", item.product_id)
            .eq("company_id", input.from_company_id);
        }
      }

      return transfer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_transfers"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Transferência criada! Estoque da origem atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useReceiveStockTransfer() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { companyId } = useCompany();

  return useMutation({
    mutationFn: async (transferId: string) => {
      if (!user) throw new Error("Não autenticado");
      if (!companyId) throw new Error("Empresa não encontrada");

      // Fetch transfer with items
      const { data: transfer, error: fetchErr } = await supabase
        .from("stock_transfers" as any)
        .select("*, stock_transfer_items(*)")
        .eq("id", transferId)
        .single();
      if (fetchErr) throw fetchErr;
      if ((transfer as any).to_company_id !== companyId) throw new Error("Transferência não pertence a esta empresa");

      // Update transfer status
      const { error } = await supabase
        .from("stock_transfers" as any)
        .update({
          status: "received",
          received_by: user.id,
          received_at: new Date().toISOString(),
        })
        .eq("id", transferId)
        .eq("to_company_id", companyId);

      if (error) throw error;

      // Increment stock in destination company
      const items = (transfer as any).stock_transfer_items || [];
      for (const item of items) {
        // Try to find product in destination by SKU first, then by ID
        let existingProduct: any = null;

        if (item.product_sku) {
          const { data } = await supabase
            .from("products")
            .select("id, stock_quantity")
            .eq("company_id", companyId)
            .eq("sku", item.product_sku)
            .maybeSingle();
          existingProduct = data;
        }

        if (!existingProduct) {
          const { data } = await supabase
            .from("products")
            .select("id, stock_quantity")
            .eq("id", item.product_id)
            .eq("company_id", companyId)
            .maybeSingle();
          existingProduct = data;
        }

        if (!existingProduct && item.product_name) {
          const { data } = await supabase
            .from("products")
            .select("id, stock_quantity")
            .eq("company_id", companyId)
            .eq("name", item.product_name)
            .maybeSingle();
          existingProduct = data;
        }

        if (existingProduct) {
          const newStock = ((existingProduct as any).stock_quantity || 0) + item.quantity;
          await supabase
            .from("products")
            .update({ stock_quantity: newStock } as any)
            .eq("id", (existingProduct as any).id)
            .eq("company_id", companyId);
        } else {
          // Product doesn't exist — clone from origin
          const { data: sourceProduct } = await supabase
            .from("products")
            .select("*")
            .eq("id", item.product_id)
            .maybeSingle();

          if (sourceProduct) {
            const { id, created_at, updated_at, company_id, ...rest } = sourceProduct as any;
            await supabase.from("products").insert({
              ...rest,
              company_id: companyId,
              stock_quantity: item.quantity,
            });
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_transfers"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Transferência recebida! Estoque atualizado automaticamente.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
