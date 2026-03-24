import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";

export interface PurchaseEntry {
  id: string;
  company_id: string;
  access_key: string;
  nfe_number: string | null;
  nfe_series: string | null;
  nfe_model: string | null;
  entry_number: number | null;
  supplier_name: string | null;
  supplier_cnpj: string | null;
  total_value: number | null;
  products_count: number | null;
  status: string | null;
  imported_at: string;
  imported_by: string | null;
  reversal_reason: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
}

export function usePurchaseEntries() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["purchase-entries", companyId],
    queryFn: async (): Promise<PurchaseEntry[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("nfe_imports")
        .select("*")
        .eq("company_id", companyId)
        .order("imported_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PurchaseEntry[];
    },
    enabled: !!companyId,
  });

  const finalizeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("nfe_imports")
        .update({ status: "finalizado" } as Record<string, unknown>)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-entries"] });
      toast.success("Entrada finalizada com sucesso");
    },
    onError: () => toast.error("Erro ao finalizar entrada"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("nfe_imports")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-entries"] });
      toast.success("Entrada removida");
    },
    onError: () => toast.error("Erro ao remover entrada"),
  });

  const reversalMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      // Find the entry to get access_key for stock reversal
      const entry = query.data?.find((e) => e.id === id);
      if (!entry) throw new Error("Entrada não encontrada");

      // 1. Reverse stock: find products imported with this access_key
      if (companyId && entry.access_key) {
        const { data: products } = await supabase
          .from("products")
          .select("id, name, stock_quantity")
          .eq("company_id", companyId)
          .eq("last_import_key" as string, entry.access_key);

        // Register stock movements for reversal
        if (products && products.length > 0) {
          for (const product of products) {
            // Get the original imported quantity from stock_movements
            const { data: movements } = await supabase
              .from("stock_movements")
              .select("quantity")
              .eq("product_id", product.id)
              .eq("type", "entrada")
              .eq("reason", "nfe")
              .order("created_at", { ascending: false })
              .limit(1);

            const qty = movements?.[0]?.quantity || 0;
            if (qty > 0) {
              // Create reversal movement
              await supabase.from("stock_movements").insert({
                product_id: product.id,
                company_id: companyId,
                type: "saida",
                quantity: qty,
                reason: "estorno_nfe",
                notes: `Estorno entrada NF-e ${entry.nfe_number || entry.access_key} - ${reason}`,
              } as Record<string, unknown>);

              // Update stock
              const newQty = Math.max(0, (product.stock_quantity || 0) - qty);
              await supabase
                .from("products")
                .update({ stock_quantity: newQty })
                .eq("id", product.id);
            }
          }
        }
      }

      // 2. Update entry status
      const { error } = await supabase
        .from("nfe_imports")
        .update({
          status: "estornado",
          reversal_reason: reason,
          reversed_at: new Date().toISOString(),
          reversed_by: user?.id || null,
        } as Record<string, unknown>)
        .eq("id", id);
      if (error) throw error;

      // 3. Audit log
      if (companyId) {
        await logAction({
          companyId,
          userId: user?.id,
          action: "estorno_entrada_nfe",
          module: "estoque",
          details: JSON.stringify({
            entry_id: id,
            nfe_number: entry.nfe_number,
            supplier: entry.supplier_name,
            reason,
          }),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-entries"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success("Entrada estornada com sucesso. Estoque revertido.");
    },
    onError: (err) => toast.error(`Erro ao estornar: ${(err as Error).message}`),
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    finalizeEntry: finalizeMutation.mutate,
    deleteEntry: deleteMutation.mutate,
    reverseEntry: (id: string, reason: string) => reversalMutation.mutate({ id, reason }),
    isReversing: reversalMutation.isPending,
  };
}
