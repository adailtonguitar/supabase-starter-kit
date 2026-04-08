import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";
import { logFiscalAudit } from "@/services/FiscalAuditLogger";

export interface FiscalTaxRule {
  id: string;
  company_id: string | null;
  is_global: boolean;
  ncm_prefix: string;
  cest: string | null;
  uf_origem: string;
  uf_destino: string;
  regime: string;
  tem_st: boolean;
  tipo_pis_cofins: "monofasico" | "isento" | "normal";
  aliq_pis: number;
  aliq_cofins: number;
  icms_aliquota: number;
  icms_reducao_base: number;
  mva: number;
  csosn: string | null;
  cst: string | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  prioridade: number;
  descricao: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaxRuleValidation {
  valid: boolean;
  errors: string[];
  alerts: string[];
}

/** Valida regra fiscal antes de salvar */
export function validarTaxRule(rule: Partial<FiscalTaxRule>): TaxRuleValidation {
  const errors: string[] = [];
  const alerts: string[] = [];
  const ncm = (rule.ncm_prefix || "").replace(/\D/g, "");

  if (!ncm || (ncm !== "*" && ncm.length < 2)) {
    errors.push("NCM deve ter no mínimo 2 dígitos ou ser '*'");
  }
  if (rule.uf_origem && rule.uf_origem !== "*" && !/^[A-Z]{2}$/.test(rule.uf_origem)) {
    errors.push(`UF origem inválida: "${rule.uf_origem}"`);
  }
  if (rule.uf_destino && rule.uf_destino !== "*" && !/^[A-Z]{2}$/.test(rule.uf_destino)) {
    errors.push(`UF destino inválida: "${rule.uf_destino}"`);
  }
  if (!rule.regime || !["simples", "normal"].includes(rule.regime)) {
    errors.push("Regime deve ser 'simples' ou 'normal'");
  }
  if (!rule.tem_st && ((rule.mva ?? 0) > 0 || (rule.icms_aliquota ?? 0) > 0)) {
    alerts.push("ST desabilitado mas MVA ou alíquota ICMS preenchidos");
  }
  if (rule.tem_st && (rule.mva ?? 0) <= 0) {
    alerts.push("ST habilitado mas MVA está zerado");
  }
  if (rule.vigencia_fim && rule.vigencia_inicio && rule.vigencia_fim < rule.vigencia_inicio) {
    errors.push("Vigência fim anterior ao início");
  }

  return { valid: errors.length === 0, errors, alerts };
}

export function useFiscalTaxRules() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["fiscal_tax_rules", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("fiscal_tax_rules")
        .select("*")
        .or(`company_id.eq.${companyId},is_global.eq.true`)
        .eq("is_active", true)
        .order("prioridade", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FiscalTaxRule[];
    },
    enabled: !!companyId,
  });
}

export function useCreateFiscalTaxRule() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (rule: Omit<FiscalTaxRule, "id" | "created_at" | "updated_at">) => {
      const validation = validarTaxRule(rule);
      if (!validation.valid) throw new Error(validation.errors.join("; "));
      if (validation.alerts.length > 0) {
        validation.alerts.forEach((a) => toast.warning(a));
      }

      if (!companyId && !rule.is_global) throw new Error("Empresa não encontrada");
      const payload = { ...rule, company_id: rule.is_global ? null : companyId };
      const { data, error } = await supabase.from("fiscal_tax_rules").insert(payload).select().single();
      if (error) throw error;
      const created = data as FiscalTaxRule;

      if (companyId) {
        logFiscalAudit({
          companyId,
          action: "fiscal_tax_rule_CRIADA",
          details: { entity_type: "fiscal_tax_rule", entity_id: created.id, entity_name: `${rule.ncm_prefix} ${rule.regime}`, before: null, after: created },
        });
      }
      return created;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fiscal_tax_rules"] }); toast.success("Regra fiscal criada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateFiscalTaxRule() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FiscalTaxRule> & { id: string }) => {
      const validation = validarTaxRule(updates);
      if (!validation.valid) throw new Error(validation.errors.join("; "));
      if (validation.alerts.length > 0) {
        validation.alerts.forEach((a) => toast.warning(a));
      }

      const { data: before } = await supabase.from("fiscal_tax_rules").select("*").eq("id", id).single();
      const { data, error } = await supabase.from("fiscal_tax_rules").update(updates).eq("id", id).select().single();
      if (error) throw error;
      const after = data as FiscalTaxRule;

      if (companyId) {
        logFiscalAudit({
          companyId,
          action: "fiscal_tax_rule_ALTERADA",
          details: { entity_type: "fiscal_tax_rule", entity_id: id, entity_name: `${after.ncm_prefix} ${after.regime}`, before, after },
        });
      }
      return after;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fiscal_tax_rules"] }); toast.success("Regra fiscal atualizada"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteFiscalTaxRule() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await supabase.from("fiscal_tax_rules").select("*").eq("id", id).single();
      const { error } = await supabase.from("fiscal_tax_rules").delete().eq("id", id);
      if (error) throw error;
      if (companyId) {
        const row = before as FiscalTaxRule | null;
        logFiscalAudit({
          companyId,
          action: "fiscal_tax_rule_EXCLUIDA",
          details: { entity_type: "fiscal_tax_rule", entity_id: id, entity_name: `${row?.ncm_prefix ?? ""} ${row?.regime ?? ""}`, before: row, after: null },
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fiscal_tax_rules"] }); toast.success("Regra fiscal excluída"); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
