import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";

export interface FollowUp {
  id: string;
  company_id: string;
  quote_id?: string;
  client_id?: string;
  assigned_to?: string;
  contact_type: "whatsapp" | "phone" | "email" | "visit";
  due_date: string;
  notes?: string;
  status: "pending" | "done" | "skipped" | "rescheduled";
  completed_at?: string;
  created_at: string;
  client?: { name: string; phone?: string };
}

export function useFollowUps(statusFilter?: string) {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["follow_ups", companyId, statusFilter],
    queryFn: async () => {
      if (!companyId) return [];
      let query = (supabase as any)
        .from("follow_ups")
        .select("*, clients(name, phone)")
        .eq("company_id", companyId)
        .order("due_date", { ascending: true });
      if (statusFilter) query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((f: any) => ({ ...f, client: f.clients })) as FollowUp[];
    },
    enabled: !!companyId,
  });
}

export function useCreateFollowUp() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (followUp: Partial<FollowUp>) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { error } = await (supabase as any)
        .from("follow_ups")
        .insert({ ...followUp, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["follow_ups"] }); toast.success("Follow-up agendado"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FollowUp> & { id: string }) => {
      const { error } = await (supabase as any).from("follow_ups").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["follow_ups"] }); },
  });
}
