import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import type { PaymentMethod } from "@/integrations/supabase/tables";

export interface LocalFinancialEntry {
  id: string;
  type: "pagar" | "receber";
  description: string;
  counterpart?: string;
  category: string;
  amount: number;
  paid_amount?: number;
  due_date: string;
  status: string;
  payment_method?: PaymentMethod | null;
  company_id: string;
}

export function useLocalFinancialEntries(filters?: { type?: "pagar" | "receber"; startDate?: string; endDate?: string }) {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["financial-entries", companyId, filters],
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase.from("financial_entries").select("*").eq("company_id", companyId);
      if (filters?.type) query = query.eq("type", filters.type);
      if (filters?.startDate) query = query.gte("due_date", filters.startDate);
      if (filters?.endDate) query = query.lte("due_date", filters.endDate);
      const { data, error } = await query.order("due_date", { ascending: false });
      
      if (error) throw error;
      return (data || []) as LocalFinancialEntry[];
    },
    enabled: !!companyId,
    refetchOnMount: "always",
    staleTime: 0,
  });
}

export function useDeleteLocalFinancialEntry() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não identificada");
      const { error } = await supabase.from("financial_entries").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-entries"] });
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
    },
  });
}

export function useMarkAsLocalPaid() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (params: { id: string; paid_amount: number; payment_method: PaymentMethod }) => {
      if (!companyId) throw new Error("Empresa não identificada");
      const { error } = await supabase.from("financial_entries").update({
        status: "pago",
        paid_amount: params.paid_amount,
        payment_method: params.payment_method,
        paid_date: new Date().toISOString().split("T")[0],
      }).eq("id", params.id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-entries"] });
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
    },
  });
}
