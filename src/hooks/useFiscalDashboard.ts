import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getFunctionErrorMessage } from "@/lib/get-function-error-message";
import { invokeEdgeFunctionWithAuth } from "@/lib/invoke-edge-function-with-auth";
import { useCompany } from "./useCompany";
import { toast } from "sonner";
import { useState, useMemo } from "react";

export interface FiscalMetrics {
  emittedToday: number;
  pending: number;
  processing: number;
  errors: number;
  deadLetter: number;
  criticalErrors: boolean;
  avgProcessingMs: number | null;
  errorRate: number;
  queueSize: number;
}

export interface FiscalQueueEntry {
  id: string;
  sale_id: string;
  status: string;
  last_error: string | null;
  attempts: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  next_retry_at: string | null;
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
      if (!companyId) return { emittedToday: 0, pending: 0, processing: 0, errors: 0, deadLetter: 0, criticalErrors: false, avgProcessingMs: null, errorRate: 0, queueSize: 0 };

      const [emittedDocsRes, queueEntriesRes, doneToday] = await Promise.all([
        supabase
          .from("fiscal_documents")
          .select("id, access_key")
          .eq("company_id", companyId)
          .eq("doc_type", "nfce")
          .eq("status", "autorizada")
          .gte("created_at", todayISO),
        supabase
          .from("fiscal_queue")
          .select("sale_id, status, attempts, created_at, started_at, finished_at")
          .eq("company_id", companyId)
          .in("status", ["pending", "processing", "error", "dead_letter"])
          .order("created_at", { ascending: false }),
        supabase
          .from("fiscal_queue")
          .select("started_at, finished_at")
          .eq("company_id", companyId)
          .eq("status", "done")
          .gte("finished_at", todayISO),
      ]);

      const emittedToday = new Set(
        (emittedDocsRes.data || []).map((row: any) => row.access_key || row.id)
      ).size;

      // Calcular métricas por status (dedup por sale_id)
      const latestQueueBySale = new Map<string, any>();
      (queueEntriesRes.data || []).forEach((row: any) => {
        if (row.sale_id && !latestQueueBySale.has(row.sale_id)) {
          latestQueueBySale.set(row.sale_id, row);
        }
      });

      let pending = 0, processing = 0, errors = 0, deadLetter = 0, criticalErrors = false;
      latestQueueBySale.forEach((row) => {
        if (row.status === "pending") pending += 1;
        if (row.status === "processing") processing += 1;
        if (row.status === "error") {
          errors += 1;
          if ((row.attempts || 0) >= 3) criticalErrors = true;
        }
        if (row.status === "dead_letter") {
          deadLetter += 1;
          criticalErrors = true;
        }
      });

      // Tempo médio de processamento dos itens finalizados hoje
      const doneTodayRows = (doneToday.data || []) as any[];
      let avgProcessingMs: number | null = null;
      if (doneTodayRows.length > 0) {
        const durations = doneTodayRows
          .filter((r: any) => r.started_at && r.finished_at)
          .map((r: any) => new Date(r.finished_at).getTime() - new Date(r.started_at).getTime())
          .filter((d: number) => d > 0 && d < 600000);
        if (durations.length > 0) {
          avgProcessingMs = Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length);
        }
      }

      // Taxa de erro
      const totalProcessed = emittedToday + errors + deadLetter;
      const errorRate = totalProcessed > 0 ? Math.round(((errors + deadLetter) / totalProcessed) * 100) : 0;

      const queueSize = pending + processing + errors + deadLetter;

      return { emittedToday, pending, processing, errors, deadLetter, criticalErrors, avgProcessingMs, errorRate, queueSize };
    },
    enabled: !!companyId,
    refetchInterval: 15000,
  });

  const queueMapQuery = useQuery({
    queryKey: ["fiscal-queue-map", companyId],
    queryFn: async (): Promise<Map<string, FiscalQueueEntry>> => {
      if (!companyId) return new Map();
      const { data } = await supabase
        .from("fiscal_queue")
        .select("id, sale_id, status, last_error, attempts, created_at, started_at, finished_at, next_retry_at")
        .eq("company_id", companyId)
        .in("status", ["pending", "processing", "error", "dead_letter"])
        .order("created_at", { ascending: false });

      const map = new Map<string, FiscalQueueEntry>();
      (data || []).forEach((row: any) => {
        if (row.sale_id && !map.has(row.sale_id)) {
          map.set(row.sale_id, row as FiscalQueueEntry);
        }
      });
      return map;
    },
    enabled: !!companyId,
    refetchInterval: 15000,
  });

  // Lista de dead letters para gestão manual
  const deadLetterQuery = useQuery({
    queryKey: ["fiscal-dead-letter", companyId],
    queryFn: async (): Promise<FiscalQueueEntry[]> => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("fiscal_queue")
        .select("id, sale_id, status, last_error, attempts, created_at, started_at, finished_at, next_retry_at")
        .eq("company_id", companyId)
        .eq("status", "dead_letter")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data || []) as FiscalQueueEntry[];
    },
    enabled: !!companyId,
    refetchInterval: 30000,
  });

  // Lista de erros recentes
  const recentErrorsQuery = useQuery({
    queryKey: ["fiscal-recent-errors", companyId],
    queryFn: async (): Promise<FiscalQueueEntry[]> => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("fiscal_queue")
        .select("id, sale_id, status, last_error, attempts, created_at, started_at, finished_at, next_retry_at")
        .eq("company_id", companyId)
        .in("status", ["error", "dead_letter"])
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []) as FiscalQueueEntry[];
    },
    enabled: !!companyId,
    refetchInterval: 30000,
  });

  const processQueue = async () => {
    if (!companyId) return;
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-fiscal-queue", {
        body: { company_id: companyId },
      });
      if (error) throw error;

      if (data?.success === false) {
        if (data.error?.includes("configuração fiscal")) {
          toast.error("Configure o módulo fiscal antes de processar a fila. Vá em Fiscal → Configuração.");
        } else {
          toast.error(data.error || "Erro ao processar fila fiscal");
        }
      } else if (data?.processed === 0 || data?.message === "Nenhum item pendente") {
        toast.info("Nenhum item pendente na fila fiscal");
      } else {
        const s = data?.summary;
        toast.success(`Processados: ${data?.processed || 0} itens — ✅${s?.done || 0} 🕐${s?.pending || 0} ❌${s?.errors || 0}`);
      }

      queryClient.invalidateQueries({ queryKey: ["fiscal-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-queue-map"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-dead-letter"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-recent-errors"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    } catch (e: unknown) {
      const msg = await getFunctionErrorMessage(e, "Erro ao processar fila fiscal");
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Reprocessar um item específico de dead_letter / error
  const retryItem = async (queueId: string, saleId: string) => {
    if (!companyId) return;
    try {
      // Resetar para pending para reprocessamento
      await supabase
        .from("fiscal_queue")
        .update({ status: "pending", attempts: 0, last_error: null, next_retry_at: null })
        .eq("id", queueId);

      toast.success("Item reenfileirado para reprocessamento");
      queryClient.invalidateQueries({ queryKey: ["fiscal-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-dead-letter"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-recent-errors"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-queue-map"] });
    } catch {
      toast.error("Erro ao reenfileirar item");
    }
  };

  return {
    metrics: metricsQuery.data ?? { emittedToday: 0, pending: 0, processing: 0, errors: 0, deadLetter: 0, criticalErrors: false, avgProcessingMs: null, errorRate: 0, queueSize: 0 },
    isLoadingMetrics: metricsQuery.isLoading,
    queueMap: queueMapQuery.data ?? new Map(),
    deadLetterItems: deadLetterQuery.data ?? [],
    recentErrors: recentErrorsQuery.data ?? [],
    processQueue,
    retryItem,
    isProcessing,
  };
}
