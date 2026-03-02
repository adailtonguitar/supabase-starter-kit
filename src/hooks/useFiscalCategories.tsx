import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";
import { logFiscalAudit } from "@/services/FiscalAuditLogger";

export interface FiscalCategory {
  id: string;
  company_id: string;
  name: string;
  regime: "simples_nacional" | "lucro_presumido" | "lucro_real";
  operation_type: "interna" | "interestadual";
  product_type: "normal" | "st";
  ncm: string | null;
  cest: string | null;
  cfop: string;
  csosn: string | null;
  cst_icms: string | null;
  icms_rate: number;
  icms_st_rate: number | null;
  mva: number | null;
  pis_rate: number;
  cofins_rate: number;
  ipi_rate: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type FiscalCategoryInsert = Omit<FiscalCategory, "id" | "company_id" | "created_at" | "updated_at">;

export function useFiscalCategories() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["fiscal_categories", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("fiscal_categories" as any)
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as unknown as FiscalCategory[];
    },
    enabled: !!companyId,
  });
}

export function useCreateFiscalCategory() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (c: Partial<FiscalCategoryInsert> & { name: string }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase
        .from("fiscal_categories" as any)
        .insert({ ...c, company_id: companyId } as any)
        .select()
        .single();
      if (error) throw error;
      logFiscalAudit({
        companyId,
        action: "fiscal_category_CRIADA",
        details: { entity_type: "fiscal_category", entity_id: (data as any).id, entity_name: c.name, before: null, after: data },
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fiscal_categories"] }); toast.success("Categoria fiscal criada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateFiscalCategory() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FiscalCategory> & { id: string }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data: before } = await supabase.from("fiscal_categories" as any).select("*").eq("id", id).eq("company_id", companyId).single();
      const { data, error } = await supabase.from("fiscal_categories" as any).update(updates as any).eq("id", id).eq("company_id", companyId).select().single();
      if (error) throw error;
      if (companyId) {
        logFiscalAudit({
          companyId,
          action: "fiscal_category_ALTERADA",
          details: { entity_type: "fiscal_category", entity_id: id, entity_name: (data as any).name, before, after: data },
        });
      }
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fiscal_categories"] }); toast.success("Categoria fiscal atualizada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteFiscalCategory() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data: before } = await supabase.from("fiscal_categories" as any).select("*").eq("id", id).eq("company_id", companyId).single();
      const { error } = await supabase.from("fiscal_categories" as any).delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
      if (companyId) {
        logFiscalAudit({
          companyId,
          action: "fiscal_category_EXCLUIDA",
          details: { entity_type: "fiscal_category", entity_id: id, entity_name: (before as any)?.name, before, after: null },
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fiscal_categories"] }); toast.success("Categoria fiscal excluída"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
