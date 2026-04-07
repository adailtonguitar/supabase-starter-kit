import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";

export interface FiscalRiskLog {
  id: string;
  company_id: string;
  note_id: string | null;
  note_type: string;
  score: number;
  level: string;
  reasons: string[];
  blocked: boolean;
  created_at: string;
}

export interface FiscalAlert {
  id: string;
  company_id: string;
  risk_log_id: string | null;
  severity: "warning" | "critical";
  title: string;
  description: string | null;
  reasons: string[];
  score: number;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export function useFiscalRiskLogs(limit = 50) {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["fiscal_risk_logs", companyId, limit],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("fiscal_risk_logs")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as FiscalRiskLog[];
    },
    enabled: !!companyId,
  });
}

export function useFiscalRiskMetrics() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["fiscal_risk_metrics", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("fiscal_risk_logs")
        .select("score, level, blocked, created_at")
        .eq("company_id", companyId)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;

      const logs = data ?? [];
      const total = logs.length;
      if (total === 0) return { total: 0, avgScore: 0, highRiskPct: 0, criticalCount: 0, blockedCount: 0, byLevel: { low: 0, medium: 0, high: 0, critical: 0 } };

      const byLevel = { low: 0, medium: 0, high: 0, critical: 0 };
      let totalScore = 0;
      let blockedCount = 0;
      for (const log of logs) {
        totalScore += log.score;
        if (log.blocked) blockedCount++;
        if (log.level in byLevel) byLevel[log.level as keyof typeof byLevel]++;
      }

      return {
        total,
        avgScore: Math.round(totalScore / total * 10) / 10,
        highRiskPct: Math.round((byLevel.high + byLevel.critical) / total * 100 * 10) / 10,
        criticalCount: byLevel.critical,
        blockedCount,
        byLevel,
      };
    },
    enabled: !!companyId,
  });
}

export function useFiscalAlerts(unresolvedOnly = true) {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["fiscal_alerts", companyId, unresolvedOnly],
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from("fiscal_alerts")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (unresolvedOnly) query = query.eq("is_resolved", false);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as FiscalAlert[];
    },
    enabled: !!companyId,
  });
}

export function useResolveFiscalAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("fiscal_alerts")
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal_alerts"] });
      toast.success("Alerta resolvido");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
