import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { CashSessionService } from "@/services/CashSessionService";
import { logAction, buildDiff } from "@/services/ActionLogger";

export interface FinancialEntry {
  id: string;
  company_id: string;
  type: "pagar" | "receber";
  description: string;
  category?: string;
  reference?: string;
  counterpart?: string | null;
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
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
      qc.invalidateQueries({ queryKey: ["financial-entries"] });
      toast.success("Lançamento criado");
      if (companyId) logAction({ companyId, userId: user?.id, action: `Lançamento ${variables.type} criado`, module: "financeiro", details: variables.description || null });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateFinancialEntry() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FinancialEntry> & { id: string }) => {
      if (!companyId) throw new Error("Sem permissão");
      // Fetch old data for diff
      const { data: oldData } = await supabase
        .from("financial_entries")
        .select("*")
        .eq("id", id)
        .eq("company_id", companyId)
        .single();

      const { data, error } = await supabase
        .from("financial_entries")
        .update(updates)
        .eq("id", id)
        .eq("company_id", companyId)
        .select()
        .single();
      if (error) throw error;
      return { entry: data, oldData };
    },
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
      qc.invalidateQueries({ queryKey: ["financial-entries"] });
      toast.success("Lançamento atualizado");
      const diff = result.oldData ? buildDiff(result.oldData, { ...result.oldData, ...variables }, Object.keys(variables).filter(k => k !== "id")) : undefined;
      if (companyId) logAction({ companyId, userId: user?.id, action: "Lançamento financeiro atualizado", module: "financeiro", details: variables.id, diff });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteFinancialEntry() {
  const qc = useQueryClient();
  const { companyId } = useCompany();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Sem permissão");
      const { error } = await supabase.from("financial_entries").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
      qc.invalidateQueries({ queryKey: ["financial-entries"] });
      toast.success("Lançamento excluído");
      if (companyId) logAction({ companyId, action: "Lançamento financeiro excluído", module: "financeiro", details: id });
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
      if (!companyId) throw new Error("Sem permissão");
      const { data: entry, error: fetchErr } = await supabase
        .from("financial_entries")
        .select("type, reference, description")
        .eq("id", id)
        .eq("company_id", companyId)
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
        .eq("company_id", companyId)
        .select()
        .single();
      if (error) throw error;

      if (entry.type === "receber" && companyId && user) {
        const session = await CashSessionService.getCurrentSession(companyId);
        if (session) {
          const method = payment_method || "dinheiro";
          const { error: movErr } = await supabase.from("cash_movements").insert({
            company_id: companyId,
            session_id: session.id,
            type: "suprimento" as any,
            amount: paid_amount,
            performed_by: user.id,
            payment_method: method as any,
            description: `Recebimento: ${entry.description}`,
            sale_id: entry.reference || null,
          });
          if (movErr) throw new Error(`Pagamento registrado, mas falha ao lançar no caixa: ${movErr.message}`);

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
            const { error: sessErr } = await supabase
              .from("cash_sessions")
              .update({
                [paymentField]: Number((sessionData as any)[paymentField] || 0) + paid_amount,
                total_suprimento: Number(sessionData.total_suprimento || 0) + paid_amount,
              })
              .eq("id", session.id);
            if (sessErr) throw new Error(`Pagamento registrado, mas falha ao atualizar sessão do caixa: ${sessErr.message}`);
          }
        }
      }

      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
      qc.invalidateQueries({ queryKey: ["financial-entries"] });
      qc.invalidateQueries({ queryKey: ["cash_sessions"] });
      qc.invalidateQueries({ queryKey: ["cash_movements"] });
      toast.success("Marcado como pago e registrado no caixa");
      if (companyId) logAction({ companyId, userId: user?.id, action: "Lançamento marcado como pago", module: "financeiro", details: `R$ ${variables.paid_amount} - ${variables.payment_method || ""}` });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}