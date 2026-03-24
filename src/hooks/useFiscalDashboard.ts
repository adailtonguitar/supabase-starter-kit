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

      type EmittedDocRow = { id: string; access_key: string | null };
      type QueueStatusRow = { sale_id: string | null; status: string; attempts: number | null };

      const [emittedDocsRes, queueEntriesRes] = await Promise.all([
        supabase
          .from("fiscal_documents")
          .select("id, access_key")
          .eq("company_id", companyId)
          .eq("doc_type", "nfce")
          .eq("status", "autorizada")
          .gte("created_at", todayISO),
        supabase
          .from("fiscal_queue")
          .select("sale_id, status, attempts, created_at")
          .eq("company_id", companyId)
          .in("status", ["pending", "processing", "error"])
          .order("created_at", { ascending: false }),
      ]);

      const emittedToday = new Set(
        (emittedDocsRes.data || []).map((row: EmittedDocRow) => row.access_key || row.id)
      ).size;

      const latestQueueBySale = new Map<string, { status: string; attempts: number }>();
      (queueEntriesRes.data || []).forEach((row: QueueStatusRow) => {
        if (row.sale_id && !latestQueueBySale.has(row.sale_id)) {
          latestQueueBySale.set(row.sale_id, { status: row.status, attempts: Number(row.attempts ?? 0) });
        }
      });

      let pending = 0;
      let processing = 0;
      let errors = 0;
      let criticalErrors = false;

      latestQueueBySale.forEach((row) => {
        if (row.status === "pending") pending += 1;
        if (row.status === "processing") processing += 1;
        if (row.status === "error") {
          errors += 1;
          if ((row.attempts || 0) >= 3) criticalErrors = true;
        }
      });

      return {
        emittedToday,
        pending,
        processing,
        errors,
        criticalErrors,
      };
    },
    enabled: !!companyId,
    refetchInterval: 30000,
  });

  const queueMapQuery = useQuery({
    queryKey: ["fiscal-queue-map", companyId],
    queryFn: async (): Promise<Map<string, FiscalQueueEntry>> => {
      if (!companyId) return new Map();
      type QueueEntryRow = FiscalQueueEntry;
      const { data } = await supabase
        .from("fiscal_queue")
        .select("sale_id, status, last_error, attempts, created_at")
        .eq("company_id", companyId)
        .in("status", ["pending", "processing", "error"])
        .order("created_at", { ascending: false });

      const map = new Map<string, FiscalQueueEntry>();
      (data || []).forEach((row: QueueEntryRow) => {
        if (row.sale_id && !map.has(row.sale_id)) {
          map.set(row.sale_id, row);
        }
      });
      return map;
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
          toast.error(data.error || "Erro ao processar item fiscal");
        }
      } else if (data?.message === "Nenhum item pendente") {
        toast.info("Nenhum item pendente na fila fiscal");
      } else {
        toast.success("Item fiscal processado com sucesso");
      }

      queryClient.invalidateQueries({ queryKey: ["fiscal-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-queue-map"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Erro ao processar fila fiscal");
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
