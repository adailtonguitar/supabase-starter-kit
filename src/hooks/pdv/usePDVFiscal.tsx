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

    const { data: saleItems } = await supabase.from("sale_items").select("*").eq("sale_id", saleId);
    if (!saleItems?.length) throw new Error("Itens da venda não encontrados");

    const { data: sale } = await supabase.from("sales").select("total, payments").eq("id", saleId).single();
    if (!sale) throw new Error("Venda não encontrada");

    const crt = resolvedCrt;
    const defaultCst = (crt === 1 || crt === 2) ? "102" : "00";
    const payments = Array.isArray(sale.payments) ? sale.payments as Record<string, unknown>[] : [];
    const paymentMethodMap: Record<string, string> = {
      dinheiro: "01", credito: "03", debito: "04", pix: "17", voucher: "05",
    };

    const fiscalItems = saleItems.map((item: Record<string, unknown>) => ({
      product_id: item.product_id,
      name: (item.product_name || item.name) as string,
      ncm: (item.ncm as string) || "",
      cfop: "5102",
      cst: defaultCst,
      origem: "0",
      unit: (item.unit as string) || "UN",
      qty: item.quantity as number,
      unit_price: item.unit_price as number,
      discount: ((item.discount_percent as number) || 0) / 100 * (item.unit_price as number) * (item.quantity as number),
      pis_cst: "49",
      cofins_cst: "49",
    }));

    const { data: fiscalData, error: fiscalErr } = await fiscalCircuitBreaker.call(() =>
      supabase.functions.invoke("emit-nfce", {
        body: {
          action: "emit", sale_id: saleId, company_id: companyId, config_id: fiscalConfig?.id,
          certificate_base64: certB64 || null, certificate_password: certPwd || null,
          form: {
            nat_op: "VENDA DE MERCADORIA", crt,
            payment_method: paymentMethodMap[(payments[0]?.method as string) ?? ""] || "99",
            payment_value: sale.total,
            change: Number(payments[0]?.change_amount ?? 0),
            items: fiscalItems,
          },
        },
      })
    );

    if (fiscalErr || !fiscalData?.success) {
      const fallbackMessage = fiscalData?.error || "Falha na emissão";
      const parsedErrorMessage = fiscalErr ? await getFunctionErrorMessage(fiscalErr, fallbackMessage) : fallbackMessage;
      const rejDetail = fiscalData?.rejection_reason || fiscalData?.details?.error?.message || "";
      const errorMsg = rejDetail && !parsedErrorMessage.includes(rejDetail) ? `${parsedErrorMessage} — ${rejDetail}` : parsedErrorMessage;
      if (queueId) await supabase.from("fiscal_queue").update({ status: "error", last_error: errorMsg }).eq("id", queueId);
      throw new Error(errorMsg);
    }

    let fiscalStatus = fiscalData.status || "pendente";
    let resolvedNumber = fiscalData.nfce_number || fiscalData.numero || fiscalData.number || "";

    if (fiscalStatus !== "autorizada" && fiscalData.access_key) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const consulted = await FiscalEmissionService.consultStatus({
          accessKey: fiscalData.access_key, docType: "nfce", companyId,
        });
        const consultResult = consulted as FiscalConsultResult;
        if (consultResult?.success && consultResult?.status === "autorizada") {
          fiscalStatus = "autorizada";
          resolvedNumber = String(consultResult?.number || resolvedNumber);
        }
      } catch {}
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
