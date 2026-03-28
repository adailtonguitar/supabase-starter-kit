/**
 * usePDVFiscal — Fiscal emission, queue management and reprocessing.
 */
import { useCallback, useEffect, useRef } from "react";
import { supabase, safeRpc } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fiscalCircuitBreaker } from "@/lib/circuit-breaker";
import { getFunctionErrorMessage } from "@/lib/get-function-error-message";
import { getStoredCertificateA1 } from "@/services/LocalXmlSigner";
import { getFiscalConfig } from "@/lib/fiscal-config-lookup";

const QUEUE_RETRY_DELAYS_MS = [2000, 5000, 10000, 20000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFiscalMessage(message: unknown): string {
  return String(message ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isVisibilityPendingMessage(message: unknown): boolean {
  const normalized = normalizeFiscalMessage(message);
  return normalized.includes("venda nao encontrada")
    || normalized.includes("itens da venda nao encontrados")
    || normalized.includes("venda/itens ainda em persistencia")
    || normalized.includes("persistencia da venda/itens")
    || normalized.includes("ainda em persistencia");
}

export function usePDVFiscal(companyId: string | null) {
  const scheduledRetriesRef = useRef<Map<string, number[]>>(new Map());

  const getRetryKey = useCallback((saleId: string) => `${companyId || "no-company"}:${saleId}`, [companyId]);

  const clearScheduledRetries = useCallback((saleId: string) => {
    const key = getRetryKey(saleId);
    const timers = scheduledRetriesRef.current.get(key) || [];
    timers.forEach((timerId) => window.clearTimeout(timerId));
    scheduledRetriesRef.current.delete(key);
  }, [getRetryKey]);

  useEffect(() => {
    return () => {
      scheduledRetriesRef.current.forEach((timers) => timers.forEach((timerId) => window.clearTimeout(timerId)));
      scheduledRetriesRef.current.clear();
    };
  }, []);

  const readLatestFiscalState = useCallback(async (saleId: string) => {
    if (!companyId) return null;

    const { data: doc } = await supabase
      .from("fiscal_documents")
      .select("id, status, number, access_key, serie")
      .eq("company_id", companyId)
      .eq("sale_id", saleId)
      .eq("doc_type", "nfce")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = doc as {
      id?: string | null;
      status?: string | null;
      number?: string | number | null;
      access_key?: string | null;
      serie?: string | number | null;
    } | null;

    if (!row) return null;

    return {
      fiscalDocId: row.id || null,
      status: String(row.status || "pendente").toLowerCase(),
      nfceNumber: row.number != null ? String(row.number) : "",
      accessKey: String(row.access_key || ""),
      serie: row.serie != null ? String(row.serie) : "",
    };
  }, [companyId]);

  const waitForQueueResolution = useCallback(async (saleId: string, queueId?: string) => {
    if (!companyId) return null;

    for (const delay of QUEUE_RETRY_DELAYS_MS) {
      await sleep(delay);

      const latestDoc = await readLatestFiscalState(saleId);
      if (latestDoc?.status === "autorizada") {
        console.info("[PDV:fiscal] Documento autorizado durante espera da fila", { saleId, queueId });
        clearScheduledRetries(saleId);
        return latestDoc;
      }

      console.info("[PDV:fiscal] Reprocessando fila fiscal", { saleId, queueId, delay });
      const { data, error } = await supabase.functions.invoke("process-fiscal-queue", {
        body: { company_id: companyId, sale_id: saleId, queue_id: queueId },
      });

      if (error) {
        console.error("[PDV:fiscal] Falha ao processar fila", { saleId, queueId, error: error.message });
        continue;
      }

      const response = data as {
        success?: boolean;
        pending?: boolean;
        error?: string;
        message?: string;
      } | null;

      if (response?.success && response.pending !== true) {
        const resolvedDoc = await readLatestFiscalState(saleId);
        if (resolvedDoc) {
          clearScheduledRetries(saleId);
          return resolvedDoc;
        }
      }
    }

    return readLatestFiscalState(saleId);
  }, [clearScheduledRetries, companyId, readLatestFiscalState]);

  const scheduleBackgroundFiscalRetries = useCallback((saleId: string, queueId?: string) => {
    if (!companyId || !queueId) return;

    const key = getRetryKey(saleId);
    if (scheduledRetriesRef.current.has(key)) return;

    const timers = QUEUE_RETRY_DELAYS_MS.map((delay, index) => window.setTimeout(async () => {
      try {
        const latestDoc = await readLatestFiscalState(saleId);
        if (latestDoc?.status === "autorizada") {
          clearScheduledRetries(saleId);
          return;
        }

        console.info("[PDV:fiscal] Retry em background agendado", {
          saleId,
          queueId,
          tentativa: index + 1,
          delay,
        });

        const { data, error } = await supabase.functions.invoke("process-fiscal-queue", {
          body: { company_id: companyId, sale_id: saleId, queue_id: queueId },
        });

        if (error) {
          console.error("[PDV:fiscal] Retry em background falhou", {
            saleId,
            queueId,
            tentativa: index + 1,
            error: error.message,
          });
          return;
        }

        const response = data as { success?: boolean; pending?: boolean; error?: string } | null;
        if (response?.success && response.pending !== true) {
          const resolvedDoc = await readLatestFiscalState(saleId);
          if (resolvedDoc?.status === "autorizada") {
            console.info("[PDV:fiscal] Documento autorizado em background", { saleId, queueId });
            clearScheduledRetries(saleId);
          }
        }
      } catch (error: unknown) {
        console.error("[PDV:fiscal] Exceção no retry em background", {
          saleId,
          queueId,
          tentativa: index + 1,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, delay));

    scheduledRetriesRef.current.set(key, timers);
  }, [clearScheduledRetries, companyId, getRetryKey, readLatestFiscalState]);

  const enqueueFiscal = useCallback(async (saleId: string): Promise<string | null> => {
    if (!companyId) return null;
    try {
      const { data: existingQueue } = await supabase
        .from("fiscal_queue")
        .select("id")
        .eq("company_id", companyId)
        .eq("sale_id", saleId)
        .in("status", ["pending", "processing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingQueue?.id) return existingQueue.id as string;

      const { data, error } = await supabase
        .from("fiscal_queue")
        .insert({ sale_id: saleId, company_id: companyId, status: "pending", attempts: 0 })
        .select("id")
        .single();

      if (error) {
        console.error("[PDV] Falha ao enfileirar fiscal:", error.message);
        toast.warning("Venda registrada, mas NFC-e não foi enfileirada. Reprocesse manualmente.", { duration: 8000 });
        return null;
      }
      return (data as Record<string, unknown>)?.id as string || null;
    } catch (err: unknown) {
      console.error("[PDV] Erro ao enfileirar fiscal:", err instanceof Error ? err.message : "Erro desconhecido");
      return null;
    }
  }, [companyId]);

  const processFiscalEmission = useCallback(async (saleId: string, queueId?: string) => {
    if (!companyId) throw new Error("Empresa não identificada");

    const { config: fiscalConfig, isHomologacao, hasCert } = await getFiscalConfig(companyId, "nfce");

    if (isHomologacao && !hasCert) {
      const fakeChave = Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join("");
      let simNumber = 1;
      try {
        const rpcNum = await safeRpc<number>("next_fiscal_number", { p_config_id: fiscalConfig!.id });
        if (rpcNum.success && typeof rpcNum.data === "number") simNumber = rpcNum.data;
      } catch {
        console.warn("[PDV:fiscal] Falha ao obter numeração simulada, usando fallback");
      }

      try {
        await Promise.allSettled([
          supabase.from("fiscal_documents").insert({
            company_id: companyId, sale_id: saleId, doc_type: "nfce",
            status: "simulado", access_key: fakeChave,
            protocol_number: Date.now().toString(), environment: "homologacao",
            serie: String(fiscalConfig?.serie ?? 1), number: simNumber, total_value: 0,
          }),
          supabase.from("sales").update({ status: "emitida" }).eq("id", saleId),
          queueId ? supabase.from("fiscal_queue").update({ status: "done", processed_at: new Date().toISOString() }).eq("id", queueId) : Promise.resolve(),
        ]);
      } catch {
        console.warn("[PDV:fiscal] Falha ao reconciliar simulação fiscal");
      }

      toast.success("✅ Simulação concluída! (modo teste — sem envio à SEFAZ)", {
        description: `Chave fictícia: ${fakeChave.substring(0, 20)}...`,
        duration: 6000,
      });

      return { nfceNumber: `SIM-${simNumber}`, fiscalDocId: null, accessKey: "", serie: "", status: "simulado" };
    }

    if (!hasCert) {
      const certError = "Certificado digital NFC-e não configurado para emissão automática.";
      if (queueId) {
        await supabase.from("fiscal_queue").update({ status: "error", last_error: certError }).eq("id", queueId);
      }
      throw new Error(certError);
    }

    const storedCert = await getStoredCertificateA1(companyId);
    const certB64 = storedCert?.pfxBase64;
    const certPwd = storedCert?.password;

    if (certB64 && certPwd) {
      try {
        console.info("[PDV:fiscal] Enviando certificado A1 antes do processamento", { saleId, queueId });
        await supabase.functions.invoke("emit-nfce", {
          body: { action: "upload_certificate", company_id: companyId, certificate_base64: certB64, certificate_password: certPwd },
        });
      } catch (error: unknown) {
        console.warn("[PDV:fiscal] Falha ao pré-carregar certificado A1", error instanceof Error ? error.message : String(error));
      }
    }

    if (queueId) {
      await supabase.from("fiscal_queue").update({ status: "processing", attempts: 1 }).eq("id", queueId);
    }

    console.info("[PDV:fiscal] Iniciando processamento via fila fiscal", { saleId, queueId, companyId });

    const { data, error } = await fiscalCircuitBreaker.call(() =>
      supabase.functions.invoke("process-fiscal-queue", {
        body: { company_id: companyId, sale_id: saleId, queue_id: queueId },
      })
    );

    if (error) {
      const parsedErrorMessage = await getFunctionErrorMessage(error, "Falha ao processar fila fiscal");
      console.error("[PDV:fiscal] process-fiscal-queue retornou erro", { saleId, queueId, error: parsedErrorMessage });
      throw new Error(parsedErrorMessage);
    }

    const queueResponse = data as {
      success?: boolean;
      pending?: boolean;
      error?: string;
      message?: string;
      dead_letter?: boolean;
    } | null;

    if (queueResponse?.success === false) {
      const errorMsg = queueResponse.error || "Falha na emissão";
      console.error("[PDV:fiscal] Fila fiscal retornou falha", { saleId, queueId, error: errorMsg });
      throw new Error(errorMsg);
    }

    const latestDoc = await readLatestFiscalState(saleId);
    if (latestDoc?.status === "autorizada") {
      clearScheduledRetries(saleId);
      return {
        nfceNumber: latestDoc.nfceNumber,
        fiscalDocId: latestDoc.fiscalDocId,
        accessKey: latestDoc.accessKey,
        serie: latestDoc.serie,
        status: "autorizada" as const,
      };
    }

    const pendingMessage = queueResponse?.message || queueResponse?.error || "Documento enfileirado e em processamento.";
    const shouldStayPending = queueResponse?.pending === true || isVisibilityPendingMessage(pendingMessage) || !latestDoc;

    if (shouldStayPending) {
      console.info("[PDV:fiscal] Documento segue pendente; agendando retries", { saleId, queueId, reason: pendingMessage });
      scheduleBackgroundFiscalRetries(saleId, queueId);
      const resolvedDoc = await waitForQueueResolution(saleId, queueId);
      if (resolvedDoc?.status === "autorizada") {
        return {
          nfceNumber: resolvedDoc.nfceNumber,
          fiscalDocId: resolvedDoc.fiscalDocId,
          accessKey: resolvedDoc.accessKey,
          serie: resolvedDoc.serie,
          status: "autorizada" as const,
        };
      }
      return { nfceNumber: latestDoc?.nfceNumber || "", fiscalDocId: latestDoc?.fiscalDocId || null, accessKey: latestDoc?.accessKey || "", serie: latestDoc?.serie || "", status: "pendente" as const };
    }

    return {
      nfceNumber: latestDoc?.nfceNumber || "",
      fiscalDocId: latestDoc?.fiscalDocId || null,
      accessKey: latestDoc?.accessKey || "",
      serie: latestDoc?.serie || "",
      status: latestDoc?.status || "pendente",
    };
  }, [clearScheduledRetries, companyId, readLatestFiscalState, scheduleBackgroundFiscalRetries, waitForQueueResolution]);

  const reprocessFiscal = useCallback(async (saleId: string) => {
    try {
      const result = await processFiscalEmission(saleId);
      if (result.status === "autorizada") toast.success("NFC-e emitida com sucesso!");
      else toast.info("NFC-e enfileirada e em processamento.");
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Erro ao reprocessar fiscal: ${message}`);
      throw err;
    }
  }, [processFiscalEmission]);

  return { enqueueFiscal, processFiscalEmission, reprocessFiscal };
}
