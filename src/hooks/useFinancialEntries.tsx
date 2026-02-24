import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { CashSessionService } from "@/services/CashSessionService";

export interface FinancialEntry {
  id: string;
  company_id: string;
  type: "pagar" | "receber";
  description: string;
  category?: string;
  reference?: string;
  amount: number;
  due_date: string;
  paid_date?: string | null;
  paid_amount?: number | null;
  payment_method?: string | null;
  status: string;
  notes?: string | null;
  created_by: string;
  created_at: string;
  updated_at?: string;
  cost_center_id?: string | null;
  recurrence?: string | null;
  recurrence_end?: string | null;
  parent_entry_id?: string | null;
  bank_account?: string | null;
}

export type FinancialEntryInsert = Omit<FinancialEntry, "id" | "created_at" | "updated_at">;

export function useFinancialEntries(filters?: {
  type?: "pagar" | "receber";
  status?: string;
  startDate?: string;
  endDate?: string;
}) {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["financial_entries", companyId, filters],
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from("financial_entries")
        .select("*")
        .eq("company_id", companyId)
        .order("due_date", { ascending: true });

      if (filters?.type) query = query.eq("type", filters.type);
      if (filters?.status) query = query.eq("status", filters.status as any);
      if (filters?.startDate) query = query.gte("due_date", filters.startDate);
      if (filters?.endDate) query = query.lte("due_date", filters.endDate);

      const { data, error } = await query;
      if (error) throw error;
      return data as FinancialEntry[];
    },
    enabled: !!companyId,
  });
}

export function useCreateFinancialEntry() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (entry: Omit<FinancialEntryInsert, "company_id" | "created_by">) => {
      if (!companyId || !user) throw new Error("Sem permissão");
      const { data, error } = await supabase
        .from("financial_entries")
        .insert({ ...entry, company_id: companyId, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
      toast.success("Lançamento criado");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateFinancialEntry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FinancialEntry> & { id: string }) => {
      const { data, error } = await supabase
        .from("financial_entries")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
      toast.success("Lançamento atualizado");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteFinancialEntry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
      toast.success("Lançamento excluído");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useMarkAsPaid() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, paid_amount, payment_method }: { id: string; paid_amount: number; payment_method?: string }) => {
      const { data: entry, error: fetchErr } = await supabase
        .from("financial_entries")
        .select("type, reference, description")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      const { data, error } = await supabase
        .from("financial_entries")
        .update({
          status: "pago" as any,
          paid_amount,
          paid_date: new Date().toISOString().split("T")[0],
          payment_method,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      if (entry.type === "receber" && companyId && user) {
        try {
          const session = await CashSessionService.getCurrentSession(companyId);
          if (session) {
            const method = payment_method || "dinheiro";
            await supabase.from("cash_movements").insert({
              company_id: companyId,
              session_id: session.id,
              type: "suprimento" as any,
              amount: paid_amount,
              performed_by: user.id,
              payment_method: method as any,
              description: `Recebimento: ${entry.description}`,
              sale_id: entry.reference || null,
            });

            const paymentField = method === "dinheiro" ? "total_dinheiro"
              : method === "pix" ? "total_pix"
              : method === "debito" ? "total_debito"
              : method === "credito" ? "total_credito"
              : "total_outros";

            const { data: sessionData } = await supabase
              .from("cash_sessions")
              .select(`${paymentField}, total_suprimento`)
              .eq("id", session.id)
              .single();

            if (sessionData) {
              await supabase
                .from("cash_sessions")
                .update({
                  [paymentField]: Number((sessionData as any)[paymentField] || 0) + paid_amount,
                  total_suprimento: Number(sessionData.total_suprimento || 0) + paid_amount,
                })
                .eq("id", session.id);
            }
          }
        } catch (cashErr) {
          console.warn("Não foi possível registrar no caixa:", cashErr);
        }
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
      qc.invalidateQueries({ queryKey: ["cash_sessions"] });
      qc.invalidateQueries({ queryKey: ["cash_movements"] });
      toast.success("Marcado como pago e registrado no caixa");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}