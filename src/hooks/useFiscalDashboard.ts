import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";
import { useState, useMemo } from "react";

export interface FiscalMetrics {
  emittedToday: number;
  pending: number;
  processing: number;
  errors: number;
  criticalErrors: boolean;
}

export interface FiscalQueueEntry {
  sale_id: string;
  status: string;
  last_error: string | null;
  attempts: number;
}

export function useFiscalDashboard() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  const todayISO = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const metricsQuery = useQuery({
    queryKey: ["fiscal-metrics", companyId],
    queryFn: async (): Promise<FiscalMetrics> => {
      if (!companyId) return { emittedToday: 0, pending: 0, processing: 0, errors: 0, criticalErrors: false };

      const [emittedRes, pendingRes, processingRes, errorsRes, criticalRes] = await Promise.all([
        supabase
          .from("sales")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .in("status", ["emitida", "autorizada"])
          .gte("created_at", todayISO),
        supabase
          .from("fiscal_queue")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "pending"),
        supabase
          .from("fiscal_queue")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "processing"),
        supabase
          .from("fiscal_queue")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "error"),
        supabase
          .from("fiscal_queue")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "error")
          .gte("attempts", 3),
      ]);

      return {
        emittedToday: emittedRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        processing: processingRes.count ?? 0,
        errors: errorsRes.count ?? 0,
        criticalErrors: (criticalRes.count ?? 0) > 0,
      };
    },
    enabled: !!companyId,
    refetchInterval: 30000,
  });

  const queueMapQuery = useQuery({
    queryKey: ["fiscal-queue-map", companyId],
    queryFn: async (): Promise<Map<string, FiscalQueueEntry>> => {
      if (!companyId) return new Map();
      const { data } = await supabase
        .from("fiscal_queue")
        .select("sale_id, status, last_error, attempts")
        .eq("company_id", companyId)
        .in("status", ["pending", "processing", "error"]);

      const map = new Map<string, FiscalQueueEntry>();
      (data || []).forEach((row: any) => map.set(row.sale_id, row));
      return map;
    },
    enabled: !!companyId,
    refetchInterval: 30000,
  });

  const processQueue = async () => {
    setIsProcessing(true);
    try {
      const { error } = await supabase.functions.invoke("process-fiscal-queue", {
        body: {},
      });
      if (error) throw error;
      toast.success("Fila fiscal processada");
      queryClient.invalidateQueries({ queryKey: ["fiscal-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-queue-map"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao processar fila fiscal");
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    metrics: metricsQuery.data ?? { emittedToday: 0, pending: 0, processing: 0, errors: 0, criticalErrors: false },
    isLoadingMetrics: metricsQuery.isLoading,
    queueMap: queueMapQuery.data ?? new Map(),
    processQueue,
    isProcessing,
  };
}
