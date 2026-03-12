import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";

export interface Quote {
  id: string;
  client_id: string | null;
  client_name: string | null;
  items_json: any[];
  total: number;
  status: string;
  notes: string | null;
  valid_until: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useQuotes({ skipInitialFetch }: { skipInitialFetch?: boolean } = {}) {
  const { companyId } = useCompany();
  const { user } = useAuth();
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

  const createQuote = async (data: any) => {
    if (!companyId) throw new Error("Empresa não encontrada");

    const validUntil = data.validDays
      ? new Date(Date.now() + data.validDays * 86400000).toISOString().split("T")[0]
      : null;

    const { error } = await supabase.from("quotes").insert({
      company_id: companyId,
      client_id: data.clientId || null,
      client_name: data.clientName || null,
      items_json: data.items,
      total: data.total,
      status: "pendente",
      notes: data.notes || null,
      valid_until: validUntil,
      created_by: user?.id || null,
    });

    if (error) throw error;
    logAction({ companyId, userId: user?.id, action: "Orçamento criado", module: "orcamentos", details: `${data.clientName || "Sem cliente"} - R$ ${data.total}` });
    toast.success("Orçamento salvo!");
    qc.invalidateQueries({ queryKey: ["quotes"] });
  };

  const updateQuoteStatus = async (id: string, status: string) => {
    if (!companyId) return;
    await supabase.from("quotes").update({ status }).eq("id", id).eq("company_id", companyId);
    logAction({ companyId, userId: user?.id, action: `Orçamento ${status}`, module: "orcamentos", details: id });
    qc.invalidateQueries({ queryKey: ["quotes"] });
  };

  const deleteQuote = async (id: string) => {
    if (!companyId) return;
    await supabase.from("quotes").delete().eq("id", id).eq("company_id", companyId);
    toast.success("Orçamento excluído");
    qc.invalidateQueries({ queryKey: ["quotes"] });
  };

  return { createQuote, updateQuoteStatus, deleteQuote, quotes, loading };
}
