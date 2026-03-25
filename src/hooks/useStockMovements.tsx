import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";

export function useStockMovements(productId?: string) {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["stock_movements", companyId, productId],
    queryFn: async () => {
      if (!companyId) return [];

      type StockMovementType = "entrada" | "saida" | "ajuste" | "venda" | "devolucao";
      type StockMovementRow = {
        id: string;
        company_id: string;
        product_id: string;
        type: StockMovementType;
        quantity: number;
        previous_stock: number;
        new_stock: number;
        created_at: string;
        reason?: string | null;
        reference?: string | null;
        products?: { name: string; sku: string } | null;
      };
      type TransferRow = { id: string };

      // Main query: movements belonging to this company
      let query = supabase
        .from("stock_movements")
        .select("*, products(name, sku)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (productId) query = query.eq("product_id", productId);
      const { data, error } = await query;
      if (error) throw error;

      // Also fetch transfer movements from other companies that reference transfers involving this company
      const { data: relatedTransfers } = await supabase
        .from("stock_transfers")
        .select("id")
        .or(`from_company_id.eq.${companyId},to_company_id.eq.${companyId}`);

      const transferIds = ((relatedTransfers ?? []) as TransferRow[]).map((t) => t.id);

      if (transferIds.length > 0) {
        let relatedQuery = supabase
          .from("stock_movements")
          .select("*, products(name, sku)")
          .neq("company_id", companyId)
          .in("reference", transferIds)
          .order("created_at", { ascending: false })
          .limit(100);
        if (productId) relatedQuery = relatedQuery.eq("product_id", productId);
        const { data: relatedData } = await relatedQuery;

        if (relatedData && relatedData.length > 0) {
          // Merge and sort by date
          const all = [
            ...((data ?? []) as StockMovementRow[]),
            ...((relatedData ?? []) as StockMovementRow[]),
          ];
          all.sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          );
          return all;
        }
      }

      return (data ?? []) as StockMovementRow[];
    },
    enabled: !!companyId,
  });
}

export function useCreateStockMovement() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (movement: {
      product_id: string;
      type: "entrada" | "saida" | "ajuste" | "venda" | "devolucao";
      quantity: number;
      unit_cost?: number;
      reason?: string;
      reference?: string;
      acquisition_type?: "cnpj" | "cpf" | null;
    }) => {
      if (!companyId || !user) throw new Error("Sem permissão");

      const { data: product, error: pErr } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", movement.product_id)
        .eq("company_id", companyId)
        .single();
      if (pErr) throw pErr;

      const previous = Number(product?.stock_quantity ?? 0);
      let newStock: number;

      switch (movement.type) {
        case "entrada":
        case "devolucao":
          newStock = previous + movement.quantity;
          break;
        case "saida":
        case "venda":
          newStock = previous - movement.quantity;
          if (newStock < 0) throw new Error(`Estoque insuficiente. Disponível: ${previous}, solicitado: ${movement.quantity}`);
          break;
        case "ajuste":
          newStock = movement.quantity;
          break;
        default:
          newStock = previous;
      }

      const insertData: Record<string, unknown> = {
        company_id: companyId,
        product_id: movement.product_id,
        type: movement.type,
        quantity: movement.type === "ajuste" ? Math.abs(movement.quantity - previous) : movement.quantity,
        previous_stock: previous,
        new_stock: newStock,
        unit_cost: movement.unit_cost,
        reason: movement.reason,
        reference: movement.reference,
        performed_by: user.id,
      };
      if (movement.acquisition_type) {
        insertData.acquisition_type = movement.acquisition_type;
      }

      const { data, error } = await supabase
        .from("stock_movements")
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;

      // Update product stock_quantity
      const { error: stockErr } = await supabase
        .from("products")
        .update({ stock_quantity: newStock })
        .eq("id", movement.product_id)
        .eq("company_id", companyId);
      if (stockErr) throw stockErr;

      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      toast.success("Movimentação registrada");
      if (companyId) logAction({ companyId, userId: user?.id, action: `Mov. estoque: ${variables.type}`, module: "estoque", details: `Qtd: ${variables.quantity} - ${variables.reason || ""}` });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
