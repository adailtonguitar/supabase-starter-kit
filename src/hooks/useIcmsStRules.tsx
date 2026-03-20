import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";
import { logFiscalAudit } from "@/services/FiscalAuditLogger";

export interface IcmsStRule {
  id: string;
  company_id: string;
  fiscal_category_id: string | null;
  uf_origin: string;
  uf_destination: string;
  mva_original: number;
  mva_adjusted: number | null;
  icms_internal_rate: number;
  icms_interstate_rate: number;
  ncm: string | null;
  cest: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useIcmsStRules() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["icms_st_rules", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("icms_st_rules")
        .select("*")
        .eq("company_id", companyId)
        .order("uf_destination");
      if (error) throw error;
      return (data ?? []) as IcmsStRule[];
    },
    enabled: !!companyId,
  });
}

export function useCreateIcmsStRule() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (rule: Omit<IcmsStRule, "id" | "company_id" | "created_at" | "updated_at">) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase
        .from("icms_st_rules")
        .insert({ ...rule, company_id: companyId })
        .select()
        .single();
      if (error) throw error;

      const created = data as IcmsStRule | null;
      if (!created?.id) throw new Error("Falha ao criar regra ICMS-ST (id ausente)");

      logFiscalAudit({
        companyId,
        action: "icms_st_rule_CRIADA",
        details: { entity_type: "icms_st_rule", entity_id: created.id, entity_name: `${rule.uf_origin}→${rule.uf_destination}`, before: null, after: created },
      });
      return created;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["icms_st_rules"] }); toast.success("Regra ICMS-ST criada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateIcmsStRule() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<IcmsStRule> & { id: string }) => {
      const { data: before } = await supabase.from("icms_st_rules").select("*").eq("id", id).single();
      const { data, error } = await supabase.from("icms_st_rules").update(updates).eq("id", id).select().single();
      if (error) throw error;
      if (companyId) {
        const beforeRow = before as IcmsStRule | null;
        const afterRow = data as IcmsStRule | null;
        if (!afterRow) throw new Error("Falha ao atualizar regra ICMS-ST");

        logFiscalAudit({
          companyId,
          action: "icms_st_rule_ALTERADA",
          details: { entity_type: "icms_st_rule", entity_id: id, entity_name: `${afterRow.uf_origin}→${afterRow.uf_destination}`, before: beforeRow, after: afterRow },
        });
      }
      return data as IcmsStRule;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["icms_st_rules"] }); toast.success("Regra ICMS-ST atualizada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteIcmsStRule() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await supabase.from("icms_st_rules").select("*").eq("id", id).single();
      const { error } = await supabase.from("icms_st_rules").delete().eq("id", id);
      if (error) throw error;
      if (companyId) {
        const beforeRow = before as IcmsStRule | null;
        logFiscalAudit({
          companyId,
          action: "icms_st_rule_EXCLUIDA",
          details: { entity_type: "icms_st_rule", entity_id: id, entity_name: `${beforeRow?.uf_origin ?? ""}→${beforeRow?.uf_destination ?? ""}`, before: beforeRow, after: null },
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["icms_st_rules"] }); toast.success("Regra ICMS-ST excluída"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
