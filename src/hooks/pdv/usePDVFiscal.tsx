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

  const processFiscalEmission = useCallback(async (saleId: string, queueId?: string) => {
    if (!companyId) throw new Error("Empresa não identificada");

    const { config: fiscalConfig, crt: resolvedCrt, isHomologacao, hasCert } = await getFiscalConfig(companyId, "nfce");

    // Simulation mode
    if (isHomologacao && !hasCert) {
      const fakeChave = Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join("");
      let simNumber = 1;
      try {
        const rpcNum = await safeRpc<number>("next_fiscal_number", { p_config_id: fiscalConfig!.id });
        if (rpcNum.success && typeof rpcNum.data === "number") simNumber = rpcNum.data;
      } catch {}

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
      } catch {}

      toast.success("✅ Simulação concluída! (modo teste — sem envio à SEFAZ)", {
        description: `Chave fictícia: ${fakeChave.substring(0, 20)}...`,
        duration: 6000,
      });

      return { nfceNumber: `SIM-${simNumber}`, fiscalDocId: null, accessKey: "", serie: "", status: "simulado" };
    }

    // Pre-upload certificate
    const storedCert = await getStoredCertificateA1(companyId);
    const certB64 = storedCert?.pfxBase64;
    const certPwd = storedCert?.password;

    if (certB64 && certPwd) {
      try {
        await supabase.functions.invoke("emit-nfce", {
          body: { action: "upload_certificate", company_id: companyId, certificate_base64: certB64, certificate_password: certPwd },
        });
      } catch {}
    }

    // Não marcar pendente_fiscal antes do emit: se a função falhar, a venda ficaria presa como pendente.
    // O `handleEmit` na edge já define pendente_fiscal ou emitida conforme o retorno da SEFAZ.
    if (queueId) await supabase.from("fiscal_queue").update({ status: "processing", attempts: 1 }).eq("id", queueId);

    // A venda pode levar alguns ms para ficar visível após a RPC `finalize_sale_atomic`.
    // Retry específico para evitar erro falso de "Venda não encontrada" (comum em PIX/cartão por timing).
    let fiscalData: any = null;
    let fiscalErr: any = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const res = await fiscalCircuitBreaker.call(() =>
        supabase.functions.invoke("emit-nfce", {
          body: {
            action: "emit_from_sale",
            sale_id: saleId,
            company_id: companyId,
            config_id: fiscalConfig?.id,
          },
        })
      );
      fiscalData = res.data;
      fiscalErr = res.error;

      const msg = fiscalData?.error || fiscalData?.message || fiscalErr?.message || "";
      const shouldRetry = isVisibilityPendingMessage(msg);
      if (!shouldRetry) break;
      if (attempt < 7) await new Promise((r) => setTimeout(r, 500));
    }

    if (fiscalData?.success && fiscalData?.pending) {
      const pendingMessage = String(fiscalData?.message || fiscalData?.error || "Venda ainda em propagação; reprocessar emissão.");
      if (queueId) {
        await supabase.from("fiscal_queue")
          .update({ status: "pending", processed_at: null, last_error: pendingMessage })
          .eq("id", queueId);
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
        return { nfceNumber: "", fiscalDocId: null, accessKey: "", serie: "", status: "pendente" as const };
      }
      if (queueId) await supabase.from("fiscal_queue").update({ status: "error", last_error: errorMsg }).eq("id", queueId);
      throw new Error(errorMsg);
    }

    // Reconcilia com a fila (consulta SEFAZ/Nuvem quando o documento tem sale_id — migration fiscal_documents.sale_id).
    if (companyId) {
      void supabase.functions
        .invoke("process-fiscal-queue", { body: { company_id: companyId, sale_id: saleId } })
        .catch(() => {});
    }

    let fiscalStatus = fiscalData.status || "pendente";
    let resolvedNumber = String(fiscalData.nfce_number || fiscalData.numero || fiscalData.number || "");
    let accessKeyDigits = String(fiscalData.access_key || "").replace(/\D/g, "");

    // Nuvem às vezes devolve "pendente" sem chave no JSON; o registro em `fiscal_documents` já tem número/chave.
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

    // SEFAZ pode levar 30–60s em horário de pico; antes parávamos em ~18s → "Pendente NFC-e" injusto vs. Histórico.
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
          /* continua tentando */
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
    }

    // Mesmo sem queueId, reconciliar status da venda
    try {
      if (fiscalStatus === "autorizada") {
        await supabase.from("sales").update({ status: "emitida" }).eq("id", saleId).eq("company_id", companyId);
      }
    } catch { /* ignore */ }

    return {
      nfceNumber: resolvedNumber,
      fiscalDocId: fiscalData.fiscal_doc_id || fiscalData.nuvem_fiscal_id || fiscalData.id,
      accessKey: accessKeyDigits.length === 44 ? accessKeyDigits : String(fiscalData.access_key || ""),
      serie: fiscalData.serie || "",
      status: fiscalStatus,
    };
  }, [companyId]);

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
