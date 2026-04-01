/**
 * usePDVFiscal — emissão fiscal 100% via fila assíncrona.
 * O PDV não chama mais a emissão direta após salvar a venda.
 */
import { useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type FiscalQueueState = "pending" | "processing" | "done" | "error" | "dead_letter" | "unknown";

type FiscalResult = {
  fiscalDocId: string | null;
  nfceNumber: string;
  accessKey: string;
  serie: string;
  status: "autorizada" | "pendente";
};

type FiscalCustomerOverride = {
  customer_name?: string;
  customer_doc?: string;
};

function normalizeQueueStatus(value: unknown): FiscalQueueState {
  const status = String(value || "").toLowerCase();
  if (status === "pending" || status === "processing" || status === "done" || status === "error" || status === "dead_letter") {
    return status;
  }
  return "unknown";
}

export function usePDVFiscal(companyId: string | null) {
  const enqueueFiscal = useCallback(async (saleId: string): Promise<string | null> => {
    if (!companyId) return null;

    try {
      const { data: existingQueue, error: existingError } = await supabase
        .from("fiscal_queue")
        .select("id")
        .eq("company_id", companyId)
        .eq("sale_id", saleId)
        .in("status", ["pending", "processing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingError) {
        console.warn("[PDV Fiscal] Falha ao buscar fila existente:", existingError.message);
      }

      if ((existingQueue as { id?: string | null } | null)?.id) {
        return String((existingQueue as { id: string }).id);
      }

      const { data, error } = await supabase
        .from("fiscal_queue")
        .insert({ sale_id: saleId, company_id: companyId, status: "pending", attempts: 0, last_error: null, processed_at: null })
        .select("id")
        .single();

      if (error) {
        console.error("[PDV Fiscal] Falha ao enfileirar emissão:", error.message);
        return null;
      }

      return String((data as { id?: string | null } | null)?.id || "") || null;
    } catch (error) {
      console.error("[PDV Fiscal] Erro ao enfileirar emissão:", error);
      return null;
    }
  }, [companyId]);

  const loadFinalFiscalState = useCallback(async (saleId: string): Promise<FiscalResult> => {
    if (!companyId) throw new Error("Empresa não identificada");

    const [{ data: finalSale }, { data: finalDoc }] = await Promise.all([
      supabase
        .from("sales")
        .select("status, access_key, nfce_number")
        .eq("id", saleId)
        .maybeSingle(),
      supabase
        .from("fiscal_documents")
        .select("id, access_key, number, status, serie")
        .eq("company_id", companyId)
        .eq("sale_id", saleId)
        .eq("doc_type", "nfce")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const saleRow = finalSale as { status?: string | null; access_key?: string | null; nfce_number?: string | number | null } | null;
    const docRow = finalDoc as { id?: string | null; access_key?: string | null; number?: string | number | null; status?: string | null; serie?: string | number | null } | null;
    const finalStatus = String(docRow?.status || saleRow?.status || "pendente").toLowerCase();

    return {
      fiscalDocId: docRow?.id || null,
      nfceNumber: String(docRow?.number || saleRow?.nfce_number || ""),
      accessKey: String(docRow?.access_key || saleRow?.access_key || ""),
      serie: String(docRow?.serie || ""),
      status: finalStatus === "autorizada" ? "autorizada" : "pendente",
    };
  }, [companyId]);

  const triggerQueueProcessing = useCallback(async (saleId: string, queueId: string, fiscalCustomer?: FiscalCustomerOverride) => {
    if (!companyId) throw new Error("Empresa não identificada");

    const { error } = await supabase.functions.invoke("process-fiscal-queue", {
      body: {
        company_id: companyId,
        sale_id: saleId,
        queue_id: queueId,
        ...(fiscalCustomer?.customer_name ? { customer_name: fiscalCustomer.customer_name } : {}),
        ...(fiscalCustomer?.customer_doc ? { customer_doc: fiscalCustomer.customer_doc } : {}),
      },
    });

    if (error) {
      console.warn("[PDV Fiscal] Falha ao acionar process-fiscal-queue:", error.message);
    }
  }, [companyId]);

  const ensureQueue = useCallback(async (saleId: string, queueId?: string) => {
    if (queueId) return queueId;

    const { data: existingQueue } = await supabase
      .from("fiscal_queue")
      .select("id")
      .eq("sale_id", saleId)
      .eq("company_id", companyId)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const activeQueueId = String((existingQueue as { id?: string | null } | null)?.id || "");
    if (activeQueueId) return activeQueueId;

    return enqueueFiscal(saleId);
  }, [companyId, enqueueFiscal]);

  const waitForFiscalQueue = useCallback(async (saleId: string, queueId: string, fiscalCustomer?: FiscalCustomerOverride): Promise<FiscalResult> => {
    const startedAt = Date.now();
    const MAX_QUEUE_WAIT_MS = 120_000;
    const POLL_INTERVAL_MS = 1_000;
    let lastTriggerAt = 0;

    while (Date.now() - startedAt < MAX_QUEUE_WAIT_MS) {
      const { data: queueRow, error: queueError } = await supabase
        .from("fiscal_queue")
        .select("status, last_error")
        .eq("id", queueId)
        .maybeSingle();

      if (queueError) {
        throw new Error(queueError.message || "Falha ao consultar fila fiscal");
      }

      const queueStatus = normalizeQueueStatus((queueRow as { status?: string | null } | null)?.status);
      const queueLastError = String((queueRow as { last_error?: string | null } | null)?.last_error || "");

      if (queueStatus === "done") {
        return loadFinalFiscalState(saleId);
      }

      if (queueStatus === "error" || queueStatus === "dead_letter") {
        throw new Error(queueLastError || `Fila fiscal falhou com status ${queueStatus}`);
      }

      if (Date.now() - lastTriggerAt >= POLL_INTERVAL_MS) {
        lastTriggerAt = Date.now();
        await triggerQueueProcessing(saleId, queueId, fiscalCustomer);
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    return loadFinalFiscalState(saleId);
  }, [loadFinalFiscalState, triggerQueueProcessing]);

  const processFiscalEmission = useCallback(async (
    saleId: string,
    queueId?: string,
    fiscalCustomer?: FiscalCustomerOverride,
  ): Promise<FiscalResult> => {
    if (!companyId) throw new Error("Empresa não identificada");

    const activeQueueId = await ensureQueue(saleId, queueId);
    if (!activeQueueId) {
      throw new Error("Não foi possível enfileirar a NFC-e");
    }

    await triggerQueueProcessing(saleId, activeQueueId, fiscalCustomer);
    return waitForFiscalQueue(saleId, activeQueueId, fiscalCustomer);
  }, [companyId, ensureQueue, triggerQueueProcessing, waitForFiscalQueue]);

  const startBackgroundFiscalProcessing = useCallback((saleId: string, queueId: string) => {
    void processFiscalEmission(saleId, queueId)
      .then((result) => {
        if (result.status === "autorizada") {
          toast.success("✅ NFC-e emitida com sucesso!", {
            description: result.nfceNumber ? `Número: ${result.nfceNumber}` : "Autorização concluída.",
            duration: 5000,
          });
          return;
        }

        toast.info("🕒 NFC-e em processamento.", {
          description: "A venda foi concluída e a autorização segue em segundo plano.",
          duration: 5000,
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Erro desconhecido na emissão fiscal";
        toast.error(`⚠️ Emissão fiscal falhou: ${message}`, {
          description: "A venda foi registrada. Reprocesse depois em Fiscal > Documentos.",
          duration: 10000,
        });
      });
  }, [processFiscalEmission]);

  const reprocessFiscal = useCallback(async (saleId: string) => {
    const result = await processFiscalEmission(saleId);
    if (result.status === "autorizada") {
      toast.success("NFC-e emitida com sucesso!");
    } else {
      toast.info("NFC-e em processamento.");
    }
    return result;
  }, [processFiscalEmission]);

  return { enqueueFiscal, processFiscalEmission, reprocessFiscal, startBackgroundFiscalProcessing };
}