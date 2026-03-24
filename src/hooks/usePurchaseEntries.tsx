import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";

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
}

export function usePurchaseEntries() {
  const { companyId } = useCompany();
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

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    finalizeEntry: finalizeMutation.mutate,
    deleteEntry: deleteMutation.mutate,
  };
}
