/**
 * usePDVFiscal — Fiscal emission, queue management and reprocessing.
 */
import { useCallback } from "react";
import { supabase, safeRpc } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fiscalCircuitBreaker } from "@/lib/circuit-breaker";
import { getFunctionErrorMessage } from "@/lib/get-function-error-message";
import { getStoredCertificateA1 } from "@/services/LocalXmlSigner";
import { FiscalEmissionService } from "@/services/FiscalEmissionService";
import { getFiscalConfig } from "@/lib/fiscal-config-lookup";
import type { FiscalConsultResult } from "@/integrations/supabase/fiscal.types";
import {
  buildPdvNfceEmitForm,
  validatePdvEmitFiscalLines,
  type PdvNfceEmitContext,
} from "@/lib/pdv-nfce-emit-form";

export type { PdvNfceEmitContext };

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

  const loadFinalFiscalState = useCallback(async (saleId: string) => {
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
    } as const;
  }, [companyId]);

  const triggerQueueProcessing = useCallback(async (saleId: string, queueId: string) => {
    if (!companyId) throw new Error("Empresa não identificada");

    const { error } = await supabase.functions.invoke("process-fiscal-queue", {
      body: { company_id: companyId, sale_id: saleId, queue_id: queueId },
    });

    if (error) {
      console.warn("[PDV Fiscal] Falha ao acionar process-fiscal-queue:", error.message);
    }
  }, [companyId]);

  const waitForFiscalQueue = useCallback(async (saleId: string, queueId: string) => {
    console.log(`[PDV Fiscal] ${new Date().toISOString()} aguardando fila fiscal queue=${queueId} sale_id=${saleId}`);

    const MAX_QUEUE_WAIT_MS = 120_000;
    const POLL_INTERVAL_MS = 1_000;
    const startedAt = Date.now();

    await triggerQueueProcessing(saleId, queueId);

    while (Date.now() - startedAt < MAX_QUEUE_WAIT_MS) {
      const { data: queueRow, error: queueErr } = await supabase
        .from("fiscal_queue")
        .select("status, last_error, attempts")
        .eq("id", queueId)
        .maybeSingle();

      if (queueErr) {
        console.warn("[PDV Fiscal] Falha ao consultar fila fiscal:", queueErr.message);
      }

      const queueStatus = String((queueRow as { status?: string | null } | null)?.status || "").toLowerCase();
      const queueError = String((queueRow as { last_error?: string | null } | null)?.last_error || "");

      if (queueStatus) {
        console.log(`[PDV Fiscal] ${new Date().toISOString()} queue=${queueId} status=${queueStatus}`);
      }

      if (queueStatus === "done") {
        return loadFinalFiscalState(saleId);
      }

      if (queueStatus === "error" || queueStatus === "dead_letter") {
        throw new Error(queueError || `Fila fiscal falhou com status ${queueStatus}`);
      }

      if (!queueStatus || queueStatus === "pending") {
        await triggerQueueProcessing(saleId, queueId);
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    console.warn(`[PDV Fiscal] ${new Date().toISOString()} timeout aguardando fila fiscal queue=${queueId} sale_id=${saleId}`);
    return loadFinalFiscalState(saleId);
  }, [loadFinalFiscalState, triggerQueueProcessing]);

  const processFiscalEmission = useCallback(async (saleId: string, queueId?: string, pdvEmit?: PdvNfceEmitContext) => {
    if (!companyId) throw new Error("Empresa não identificada");

    if (queueId && !pdvEmit) {
      return waitForFiscalQueue(saleId, queueId);
    }

    const { config: fiscalConfig, isHomologacao, hasCert } = await getFiscalConfig(companyId, "nfce");
    const usePdvFormEmit = !!pdvEmit;
    const ts = () => new Date().toISOString();

    if (isHomologacao && !hasCert) {
      const fakeChave = Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join("");
      let simNumber = 1;
      try {
        const rpcNum = await safeRpc<number>("next_fiscal_number", { p_config_id: fiscalConfig!.id });
        if (rpcNum.success && typeof rpcNum.data === "number") simNumber = rpcNum.data;
      } catch {
        console.warn("[PDV:fiscal] RPC next_fiscal_number (simulação) falhou, usando fallback");
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
        console.info(`[PDV Fiscal] ${ts()} upload certificado A1`, { saleId, queueId: queueId ?? "bypass" });
        await supabase.functions.invoke("emit-nfce", {
          body: { action: "upload_certificate", company_id: companyId, certificate_base64: certB64, certificate_password: certPwd },
        });
      } catch (e: unknown) {
        console.warn("[PDV Fiscal] pré-upload certificado:", e instanceof Error ? e.message : e);
      }
    }

    if (queueId) await supabase.from("fiscal_queue").update({ status: "processing", attempts: 1 }).eq("id", queueId);

    console.log(
      `[PDV Fiscal] ${ts()} start sale_id=${saleId} queue=${queueId ?? "bypass"} mode=${usePdvFormEmit ? "emit+form(PDV)" : "emit_from_sale"}`,
    );

    if (usePdvFormEmit) {
      const vErr = validatePdvEmitFiscalLines(pdvEmit.saleItems, pdvEmit.crt);
      if (vErr) {
        if (queueId) await supabase.from("fiscal_queue").update({ status: "error", last_error: vErr }).eq("id", queueId);
        throw new Error(vErr);
      }
    }

    const maxAttempts = usePdvFormEmit ? 2 : 8;
    let fiscalData: any = null;
    let fiscalErr: any = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const body = usePdvFormEmit
        ? {
            sale_id: saleId,
            company_id: companyId,
            config_id: fiscalConfig?.id,
            form: buildPdvNfceEmitForm({
              crt: pdvEmit.crt,
              saleItems: pdvEmit.saleItems,
              payments: pdvEmit.payments,
              total: pdvEmit.total,
              customerName: pdvEmit.customerName,
              customerDoc: pdvEmit.customerDoc,
            }),
          }
        : {
            action: "emit_from_sale",
            sale_id: saleId,
            company_id: companyId,
            config_id: fiscalConfig?.id,
          };

      const res = await fiscalCircuitBreaker.call(() =>
        supabase.functions.invoke("emit-nfce", { body })
      );
      fiscalData = res.data;
      fiscalErr = res.error;
      console.log(
        `[PDV Fiscal] ${ts()} invoke attempt=${attempt + 1}/${maxAttempts} ok=${!fiscalErr && !!fiscalData?.success} err=${fiscalErr?.message ?? ""}`,
      );

      const msg = fiscalData?.error || fiscalData?.message || fiscalErr?.message || "";
      const shouldRetry = !usePdvFormEmit && isVisibilityPendingMessage(msg);
      if (!shouldRetry) break;
      if (attempt < maxAttempts - 1) await new Promise((r) => setTimeout(r, 500));
    }

    if (fiscalData?.success && fiscalData?.pending) {
      const pendingMessage = String(fiscalData?.message || fiscalData?.error || "Venda ainda em propagação; reprocessar emissão.");
      if (queueId) {
        await supabase.from("fiscal_queue")
          .update({ status: "pending", processed_at: null, last_error: pendingMessage })
          .eq("id", queueId);
        return waitForFiscalQueue(saleId, queueId);
      }
      return { nfceNumber: "", fiscalDocId: null, accessKey: "", serie: "", status: "pendente" as const };
    }

    if (fiscalErr || !fiscalData?.success) {
      const fallbackMessage = fiscalData?.error || "Falha na emissão";
      const parsedErrorMessage = fiscalErr ? await getFunctionErrorMessage(fiscalErr, fallbackMessage) : fallbackMessage;
      const rejDetail = fiscalData?.rejection_reason || fiscalData?.details?.error?.message || "";
      const errorMsg = rejDetail && !parsedErrorMessage.includes(rejDetail) ? `${parsedErrorMessage} — ${rejDetail}` : parsedErrorMessage;
      const isTransientVisibility = isVisibilityPendingMessage(errorMsg);
      if (queueId && isTransientVisibility) {
        await supabase.from("fiscal_queue")
          .update({ status: "pending", processed_at: null, last_error: "Venda ainda em propagação; reprocessar emissão." })
          .eq("id", queueId);
        return waitForFiscalQueue(saleId, queueId);
      }
      if (queueId) await supabase.from("fiscal_queue").update({ status: "error", last_error: errorMsg }).eq("id", queueId);
      throw new Error(errorMsg);
    }

    if (companyId && !usePdvFormEmit) {
      void supabase.functions
        .invoke("process-fiscal-queue", { body: { company_id: companyId, sale_id: saleId } })
        .catch(() => {});
    }

    let fiscalStatus = fiscalData.status || "pendente";
    let resolvedNumber = String(fiscalData.nfce_number || fiscalData.numero || fiscalData.number || "");
    let accessKeyDigits = String(fiscalData.access_key || "").replace(/\D/g, "");

    const nfNum = Number(fiscalData.number ?? fiscalData.nfce_number ?? fiscalData.numero);
    if (accessKeyDigits.length !== 44 && Number.isFinite(nfNum) && companyId) {
      for (let i = 0; i < 45; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1500));
        const { data: doc } = await supabase
          .from("fiscal_documents")
          .select("access_key, status, number")
          .eq("company_id", companyId)
          .eq("doc_type", "nfce")
          .eq("number", nfNum)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const row = doc as { access_key?: string | null; status?: string | null; number?: number | null } | null;
        const k = String(row?.access_key || "").replace(/\D/g, "");
        if (k.length === 44) {
          accessKeyDigits = k;
          if (String(row?.status || "").toLowerCase() === "autorizada") {
            fiscalStatus = "autorizada";
            if (row?.number != null) resolvedNumber = String(row.number);
          }
          break;
        }
      }
    }

    if (fiscalStatus !== "autorizada" && accessKeyDigits.length === 44) {
      const started = Date.now();
      const MAX_WAIT_MS = 60_000;
      const DELAYS_MS = [2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000];
      for (let i = 0; i < DELAYS_MS.length && Date.now() - started < MAX_WAIT_MS; i++) {
        try {
          await new Promise((resolve) => setTimeout(resolve, DELAYS_MS[i]));
          const consulted = await FiscalEmissionService.consultStatus({
            accessKey: accessKeyDigits,
            docType: "nfce",
            companyId: companyId ?? undefined,
          });
          const consultResult = consulted as FiscalConsultResult;
          if (consultResult?.success && consultResult?.status === "autorizada") {
            fiscalStatus = "autorizada";
            resolvedNumber = String(consultResult?.number || resolvedNumber);
            break;
          }
        } catch {
          /* continua */
        }
      }
    }

    if (queueId) {
      await supabase.from("fiscal_queue")
        .update(
          fiscalStatus === "autorizada"
            ? { status: "done", processed_at: new Date().toISOString(), last_error: null }
            : { status: "pending", processed_at: null, last_error: "Documento enviado ao provedor e aguardando autorização da SEFAZ." }
        )
        .eq("id", queueId);

      if (fiscalStatus !== "autorizada") {
        return waitForFiscalQueue(saleId, queueId);
      }
    }

    try {
      if (fiscalStatus === "autorizada") {
        await supabase.from("sales").update({ status: "emitida" }).eq("id", saleId).eq("company_id", companyId);
      }
    } catch { /* ignore */ }

    console.log(`[PDV Fiscal] ${ts()} done sale_id=${saleId} status=${fiscalStatus} queue=${queueId ?? "bypass"}`);

    return {
      nfceNumber: resolvedNumber,
      fiscalDocId: fiscalData.fiscal_doc_id || fiscalData.nuvem_fiscal_id || fiscalData.id,
      accessKey: accessKeyDigits.length === 44 ? accessKeyDigits : String(fiscalData.access_key || ""),
      serie: fiscalData.serie || "",
      status: fiscalStatus,
    };
  }, [companyId, waitForFiscalQueue]);

  const reprocessFiscal = useCallback(async (saleId: string) => {
    try {
      const result = await processFiscalEmission(saleId);
      if (result.status === "autorizada") toast.success("NFC-e emitida com sucesso!");
      else toast.info("NFC-e enviada, mas ainda não autorizada.");
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Erro ao reprocessar fiscal: ${message}`);
      throw err;
    }
  }, [processFiscalEmission]);

  return { enqueueFiscal, processFiscalEmission, reprocessFiscal };
}
