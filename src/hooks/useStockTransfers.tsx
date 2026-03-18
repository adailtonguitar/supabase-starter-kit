import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { logAction } from "@/services/ActionLogger";
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
        .from("stock_transfers")
        .select("*, stock_transfer_items(*)")
        .or(`from_company_id.eq.${companyId},to_company_id.eq.${companyId}`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      // Fetch company names
      const companyIds = new Set<string>();
      for (const t of (data || []) as Record<string, unknown>[]) {
        companyIds.add(t.from_company_id as string);
        companyIds.add(t.to_company_id as string);
      }

      const { data: companies } = await supabase
        .from("companies")
        .select("id, name")
        .in("id", Array.from(companyIds));

      const nameMap = new Map((companies || []).map((c: Record<string, unknown>) => [c.id as string, c.name as string]));

      return (data || []).map((t: Record<string, unknown>) => ({
        ...t,
        from_company: { name: nameMap.get(t.from_company_id as string) || "?" },
        to_company: { name: nameMap.get(t.to_company_id as string) || "?" },
        items: (t as Record<string, unknown>).stock_transfer_items || [],
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
        .from("stock_transfers")
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
        transfer_id: (transfer as Record<string, unknown>).id as string,
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.product_sku || "",
        quantity: item.quantity,
        unit_cost: item.unit_cost || 0,
      }));

      const { error: itemsError } = await supabase
        .from("stock_transfer_items")
        .insert(items);

      if (itemsError) throw itemsError;

      // Fetch destination company name for movement reason
      const { data: destCompany } = await supabase
        .from("companies")
        .select("name")
        .eq("id", input.to_company_id)
        .single();
      const destName = (destCompany as Record<string, unknown> | null)?.name as string || "filial";

      // Decrement stock from origin company
      for (const item of input.items) {
        const { data: product } = await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", item.product_id)
          .eq("company_id", input.from_company_id)
          .single();

        if (product && item.quantity > ((product as Record<string, unknown>).stock_quantity as number || 0)) {
          throw new Error(`Estoque insuficiente para "${item.product_name}". Disponível: ${(product as Record<string, unknown>).stock_quantity}`);
        }

        if (product) {
          const previousStock = (product as Record<string, unknown>).stock_quantity as number;
          const newStock = Math.max(0, previousStock - item.quantity);
          await supabase
            .from("products")
            .update({ stock_quantity: newStock })
            .eq("id", item.product_id)
            .eq("company_id", input.from_company_id);

          // Register stock movement (saída)
          const { error: movError } = await supabase.from("stock_movements").insert({
            company_id: input.from_company_id,
            product_id: item.product_id,
            type: "saida",
            quantity: item.quantity,
            previous_stock: previousStock,
            new_stock: newStock,
            unit_cost: item.unit_cost || 0,
            reason: `Transferência enviada para ${destName}`,
            reference: (transfer as Record<string, unknown>).id as string,
            performed_by: user.id,
          });
          if (movError) console.error("Erro ao registrar movimentação de saída:", movError);
        } else {
          console.warn("Produto não encontrado na origem para movimentação:", item.product_id, input.from_company_id);
        }
      }

      logAction({ companyId: input.from_company_id, userId: user.id, action: "Transferência de estoque criada", module: "estoque", details: `Para ${destName} - ${input.items.length} item(ns)` });
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

      // Fetch origin company name for movement reason
      const { data: originCompany } = await supabase
        .from("companies")
        .select("name")
        .eq("id", (transfer as any).from_company_id)
        .single();
      const originName = (originCompany as any)?.name || "matriz";

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
          const previousStock = (existingProduct as any).stock_quantity || 0;
          const newStock = previousStock + item.quantity;
          await supabase
            .from("products")
            .update({ stock_quantity: newStock } as any)
            .eq("id", (existingProduct as any).id)
            .eq("company_id", companyId);

          // Register stock movement
          await supabase.from("stock_movements" as any).insert({
            company_id: companyId,
            product_id: (existingProduct as any).id,
            type: "entrada",
            quantity: item.quantity,
            previous_stock: previousStock,
            new_stock: newStock,
            unit_cost: item.unit_cost || 0,
            reason: `Transferência recebida de ${originName} #${transferId.slice(0, 8)}`,
            reference: transferId,
            performed_by: user.id,
          });
        } else {
          // Product doesn't exist — clone from origin
          const { data: sourceProduct } = await supabase
            .from("products")
            .select("*")
            .eq("id", item.product_id)
            .maybeSingle();

          if (sourceProduct) {
            const { id, created_at, updated_at, company_id, ...rest } = sourceProduct as any;
            const { data: newProduct } = await supabase.from("products").insert({
              ...rest,
              company_id: companyId,
              stock_quantity: item.quantity,
            }).select("id").single();

            if (newProduct) {
              await supabase.from("stock_movements" as any).insert({
                company_id: companyId,
                product_id: (newProduct as any).id,
                type: "entrada",
                quantity: item.quantity,
                previous_stock: 0,
                new_stock: item.quantity,
                unit_cost: item.unit_cost || 0,
                reason: `Transferência recebida de ${originName} #${transferId.slice(0, 8)} (produto criado)`,
                reference: transferId,
                performed_by: user.id,
              });
            }
          }
        }
      }
      logAction({ companyId: companyId!, userId: user.id, action: "Transferência de estoque recebida", module: "estoque", details: `ID ${transferId.slice(0, 8)} - ${items.length} item(ns)` });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_transfers"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Transferência recebida! Estoque atualizado automaticamente.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
