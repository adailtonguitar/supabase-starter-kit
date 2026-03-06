import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface Return {
  id: string;
  company_id: string;
  sale_id: string;
  client_name?: string;
  reason: string;
  reason_category: string;
  type: "troca" | "devolucao";
  status: "aberto" | "em_analise" | "aprovado" | "recusado" | "concluido";
  refund_amount: number;
  refund_method?: string;
  stock_returned: boolean;
  notes?: string;
  created_by?: string;
  created_at: string;
  resolved_at?: string;
  items?: ReturnItem[];
}

export interface ReturnItem {
  id: string;
  return_id: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  condition: "bom" | "avariado" | "defeituoso" | "usado";
}

export function useReturns(statusFilter?: string) {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["returns", companyId, statusFilter],
    queryFn: async () => {
      if (!companyId) return [];
      let query = (supabase as any)
        .from("returns")
        .select("*, return_items(*)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (statusFilter) query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        items: r.return_items || [],
      })) as Return[];
    },
    enabled: !!companyId,
  });
}

export function useCreateReturn() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (ret: Omit<Partial<Return>, 'items'> & { items: { product_id?: string | null; product_name: string; quantity: number; condition: string }[] }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { items, ...retData } = ret;
      const { data, error } = await (supabase as any)
        .from("returns")
        .insert({ ...retData, company_id: companyId, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      if (items?.length) {
        const retItems = items.map((item) => ({ return_id: data.id, ...item }));
        await (supabase as any).from("return_items").insert(retItems);
      }
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["returns"] }); toast.success("Troca/devolução registrada"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Return> & { id: string }) => {
      const { error } = await (supabase as any).from("returns").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["returns"] }); toast.success("Status atualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });
}
