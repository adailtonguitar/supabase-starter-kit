import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

export interface Quote {
  id: string;
  quote_number: number;
  client_name: string | null;
  items_json: any[];
  total: number;
  discount_percent: number;
  discount_value: number;
  status: string;
  notes: string | null;
  valid_until: string | null;
  created_at: string;
}

export function useQuotes({ skipInitialFetch }: { skipInitialFetch?: boolean } = {}) {
  const { companyId } = useCompany();
  const qc = useQueryClient();

  const { data: quotes = [], isLoading: loading } = useQuery({
    queryKey: ["quotes", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("quotes")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      return (data || []) as Quote[];
    },
    enabled: !!companyId && !skipInitialFetch,
  });

  const createQuote = async (_data: any) => {
    console.warn("[useQuotes] createQuote not implemented");
  };

  const updateQuoteStatus = async (id: string, status: string) => {
    await supabase.from("quotes").update({ status }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["quotes"] });
  };

  const deleteQuote = async (id: string) => {
    await supabase.from("quotes").delete().eq("id", id);
    toast.success("Orçamento excluído");
    qc.invalidateQueries({ queryKey: ["quotes"] });
  };

  return { createQuote, updateQuoteStatus, deleteQuote, quotes, loading };
}
