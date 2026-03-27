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

    await supabase.from("sales").update({ status: "pendente_fiscal" }).eq("id", saleId);
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

      const msg = String(fiscalData?.error || fiscalErr?.message || "");
      const shouldRetry = msg.toLowerCase().includes("venda não encontrada") || msg.toLowerCase().includes("venda nao encontrada");
      if (!shouldRetry) break;
      if (attempt < 7) await new Promise((r) => setTimeout(r, 500));
    }

    if (fiscalErr || !fiscalData?.success) {
      const fallbackMessage = fiscalData?.error || "Falha na emissão";
      const parsedErrorMessage = fiscalErr ? await getFunctionErrorMessage(fiscalErr, fallbackMessage) : fallbackMessage;
      const rejDetail = fiscalData?.rejection_reason || fiscalData?.details?.error?.message || "";
      const errorMsg = rejDetail && !parsedErrorMessage.includes(rejDetail) ? `${parsedErrorMessage} — ${rejDetail}` : parsedErrorMessage;
      const isNotFoundTiming = errorMsg.toLowerCase().includes("venda não encontrada") || errorMsg.toLowerCase().includes("venda nao encontrada");
      if (queueId && isNotFoundTiming) {
        await supabase.from("fiscal_queue")
          .update({ status: "pending", processed_at: null, last_error: "Venda ainda em propagação; reprocessar emissão." })
          .eq("id", queueId);
        return { nfceNumber: "", fiscalDocId: null, accessKey: "", serie: "", status: "pendente" as const };
      }
      if (queueId) await supabase.from("fiscal_queue").update({ status: "error", last_error: errorMsg }).eq("id", queueId);
      throw new Error(errorMsg);
    }

    let fiscalStatus = fiscalData.status || "pendente";
    let resolvedNumber = fiscalData.nfce_number || fiscalData.numero || fiscalData.number || "";

    // Para UX do PDV: aguardar um pouco pela autorização (PIX/cartão costuma levar alguns segundos).
    // Evita “NFC-e ainda não disponível…”.
    if (fiscalStatus !== "autorizada") {
      const accessKey = String(fiscalData.access_key || "");
      if (accessKey) {
        const started = Date.now();
        const MAX_WAIT_MS = 18_000; // ~18s (equilíbrio entre UX e travar caixa)
        const DELAYS = [1500, 2000, 2500, 3000, 3500, 4000]; // total ~16.5s
        for (let i = 0; i < DELAYS.length && Date.now() - started < MAX_WAIT_MS; i++) {
          try {
            await new Promise((resolve) => setTimeout(resolve, DELAYS[i]));
            const consulted = await FiscalEmissionService.consultStatus({
              accessKey,
              docType: "nfce",
              companyId,
            });
            const consultResult = consulted as FiscalConsultResult;
            if (consultResult?.success && consultResult?.status === "autorizada") {
              fiscalStatus = "autorizada";
              resolvedNumber = String(consultResult?.number || resolvedNumber);
              break;
            }
          } catch {
            // ignore and keep polling a bit
          }
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
      accessKey: fiscalData.access_key || "",
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
