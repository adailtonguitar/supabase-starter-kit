import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";
import { logFiscalAudit } from "@/services/FiscalAuditLogger";

export interface TaxRuleByNcmRow {
  id: string;
  company_id: string;
  ncm: string;
  uf_origem: string;
  uf_destino: string;
  regime: "simples" | "normal";
  tipo_cliente: string;
  cst: string | null;
  csosn: string | null;
  icms_aliquota: number;
  icms_reducao_base: number;
  icms_st: boolean;
  mva: number;
  fcp: number;
  observacoes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useTaxRulesByNcm() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["tax_rules_by_ncm", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("tax_rules_by_ncm")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("ncm");
      if (error) throw error;
      return (data ?? []) as TaxRuleByNcmRow[];
    },
    enabled: !!companyId,
  });
}

export function useCreateTaxRuleByNcm() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (rule: Omit<TaxRuleByNcmRow, "id" | "company_id" | "created_at" | "updated_at">) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase
        .from("tax_rules_by_ncm")
        .insert({ ...rule, company_id: companyId })
        .select()
        .single();
      if (error) throw error;
      const created = data as TaxRuleByNcmRow;
      logFiscalAudit({
        companyId,
        action: "tax_rule_ncm_CRIADA",
        details: { entity_type: "tax_rules_by_ncm", entity_id: created.id, ncm: rule.ncm, after: created },
      });
      return created;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tax_rules_by_ncm"] }); toast.success("Regra tributária criada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateTaxRuleByNcm() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TaxRuleByNcmRow> & { id: string }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data: before } = await supabase.from("tax_rules_by_ncm").select("*").eq("id", id).single();
      const { data, error } = await supabase.from("tax_rules_by_ncm").update(updates).eq("id", id).select().single();
      if (error) throw error;
      const afterRow = data as TaxRuleByNcmRow;
      logFiscalAudit({
        companyId,
        action: "tax_rule_ncm_ALTERADA",
        details: { entity_type: "tax_rules_by_ncm", entity_id: id, before, after: afterRow },
      });
      return afterRow;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tax_rules_by_ncm"] }); toast.success("Regra tributária atualizada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteTaxRuleByNcm() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data: before } = await supabase.from("tax_rules_by_ncm").select("*").eq("id", id).single();
      const { error } = await supabase.from("tax_rules_by_ncm").delete().eq("id", id);
      if (error) throw error;
      logFiscalAudit({
        companyId,
        action: "tax_rule_ncm_EXCLUIDA",
        details: { entity_type: "tax_rules_by_ncm", entity_id: id, before, after: null },
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tax_rules_by_ncm"] }); toast.success("Regra tributária excluída"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
