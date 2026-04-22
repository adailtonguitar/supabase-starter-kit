/**
 * usePDV — Composed hook that delegates to specialized sub-hooks.
 * Maintains the same public API for backwards compatibility.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase, safeRpc } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useSync } from "@/hooks/useSync";
import { buildContingencyPayload } from "@/services/ContingencyService";
import type { FinalizeSaleItemInput, FinalizeSalePaymentInput, PaymentResult } from "@/services/types";
import { isScaleBarcode, parseScaleBarcode } from "@/lib/scale-barcode";
import { logAction, newPdvTraceId } from "@/services/ActionLogger";
import { CircuitBreakerOpenError } from "@/lib/circuit-breaker";
import { getFunctionErrorMessage } from "@/lib/get-function-error-message";
import { getFiscalConfig } from "@/lib/fiscal-config-lookup";
import { pdvPaymentsBypassFiscalQueue, pdvPostSaleVisibilityDelayMs } from "@/lib/pdv-payment-fiscal-policy";

import { usePDVProducts } from "@/hooks/pdv/usePDVProducts";
import { usePDVSession } from "@/hooks/pdv/usePDVSession";
import { usePDVCart } from "@/hooks/pdv/usePDVCart";
import { usePDVFiscal } from "@/hooks/pdv/usePDVFiscal";
import { usePDVPromotions } from "@/hooks/pdv/usePDVPromotions";

export interface PDVProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  price: number;
  cost_price?: number;
  stock_quantity: number;
  unit: string;
  category: string;
  ncm: string;
  cfop?: string;
  csosn?: string;
  cst_icms?: string;
  origem?: number;
  cst_pis?: string;
  cst_cofins?: string;
  aliq_icms?: number;
  cest?: string;
  mva?: number;
  image_url?: string;
  reorder_point?: number;
}

function isConnectivityError(err: unknown): boolean {
  if (!navigator.onLine) return true;
  if (err instanceof CircuitBreakerOpenError) return true;
  const message = err instanceof Error ? err.message.toLowerCase() : String(err ?? "").toLowerCase();
  return (
    message.includes("offline") ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("failed to fetch") ||
    message.includes("load failed")
  );
}

export function usePDV() {
  const { companyId } = useCompany();
  const { queueOperation, stats: syncStats, syncing: syncingSales } = useSync();

  // Sub-hooks
  const { products, loadingProducts, refreshProducts, decrementLocalStock } = usePDVProducts(companyId);
  const { currentSession, loadingSession, sessionEverLoaded, reloadSession } = usePDVSession(companyId);
  const { activePromos } = usePDVPromotions(companyId);
  const cart = usePDVCart(activePromos);
  const { enqueueFiscal, processFiscalEmission, reprocessFiscal } = usePDVFiscal(companyId);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [trainingMode] = useState(false);
  const [contingencyMode, setContingencyMode] = useState(false);
  const [contingencySaleIds, setContingencySaleIds] = useState<Set<string>>(new Set());
  const [finalizingSale, setFinalizingSale] = useState(false);
  const finalizingRef = useRef(false);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const handleBarcodeScan = useCallback((barcode: string) => {
    if (isScaleBarcode(barcode)) {
      const parsed = parseScaleBarcode(barcode);
      if (parsed) {
        const product = products.find(
          (p) => p.sku === parsed.productCode || p.barcode === parsed.productCode ||
                 p.sku.endsWith(parsed.productCode) || (p.barcode && p.barcode.endsWith(parsed.productCode))
        );
        if (product && product.stock_quantity > 0) {
          if (parsed.mode === "weight") {
            const weightToAdd = Math.min(parsed.value, product.stock_quantity);
            cart.addToCart({ ...product, stock_quantity: weightToAdd } as PDVProduct);
          } else {
            const qty = product.price > 0 ? parsed.value / product.price : 1;
            cart.addToCart({ ...product, stock_quantity: Math.min(qty, product.stock_quantity) } as PDVProduct);
          }
        } else if (product && product.stock_quantity <= 0) {
          toast.warning(`"${product.name}" está sem estoque`, { duration: 2000 });
        } else {
          toast.error(`Produto não encontrado para código: ${parsed.productCode}`, { duration: 2000 });
        }
        return;
      }
    }
    const product = products.find(p => p.barcode === barcode || p.sku === barcode);
    if (product && product.stock_quantity > 0) {
      cart.addToCart(product);
    }
  }, [products, cart.addToCart]);

  const finalizeSale = useCallback(async (payments: PaymentResult[], options?: {
    skipFiscal?: boolean;
    maxDiscountPercent?: number;
    /** Destinatário NFC-e (mesmo papel do passo Cliente no histórico). */
    fiscalCustomer?: { name?: string; doc?: string };
  }) => {
    if (finalizingRef.current) {
      toast.warning("Venda já em processamento, aguarde...", { duration: 1200 });
      throw new Error("Venda em processamento");
    }
    if (!companyId || !currentSession) throw new Error("Sessão de caixa não encontrada");
    if (cart.cartItems.length === 0) throw new Error("Carrinho vazio");
    if (cart.total <= 0) throw new Error("Total da venda deve ser maior que zero");

    const saleTotalCaptured = cart.total;

    finalizingRef.current = true;
    setFinalizingSale(true);

    try {
      if (!navigator.onLine) throw new Error("offline");

      let userId = "";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id || "";
        if (userId) localStorage.setItem("as_cached_user_id", userId);
      } catch {}

      const saleItems: FinalizeSaleItemInput[] = cart.cartItems.map((item) => {
        const manualDiscountRaw = cart.itemDiscounts[item.id] || 0;
        const promoMatch = cart.promoMatches[item.id];
        const effectivePrice = promoMatch ? promoMatch.finalPrice : item.price;
        const manualDiscount = Number.isFinite(manualDiscountRaw) ? manualDiscountRaw : 0;
        const priceAfterManual = effectivePrice * (1 - manualDiscount / 100);
        const itemSubtotal = priceAfterManual * item.quantity;
        const baseForPct = item.price > 0 ? item.price : effectivePrice > 0 ? effectivePrice : 0;
        const promoPct = promoMatch && baseForPct > 0 ? (promoMatch.savingsPerUnit / baseForPct) * 100 : 0;
        return {
          product_id: item.id,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: effectivePrice,
          discount_percent: manualDiscount + promoPct,
          subtotal: Math.round(itemSubtotal * 100) / 100,
          ncm: item.ncm?.trim() || undefined,
          cfop: item.cfop?.trim() || undefined,
          csosn: item.csosn?.trim() || undefined,
          cst_icms: item.cst_icms?.trim() || undefined,
          origem: item.origem,
          cst_pis: item.cst_pis?.trim() || undefined,
          cst_cofins: item.cst_cofins?.trim() || undefined,
          aliq_icms: item.aliq_icms != null ? Number(item.aliq_icms) : undefined,
          cest: item.cest?.trim() || undefined,
          mva: item.mva != null ? Number(item.mva) : undefined,
          unit: item.unit?.trim() || undefined,
        };
      });

      const paymentsSummary: FinalizeSalePaymentInput[] = payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        approved: p.approved,
        ...(p.change_amount != null ? { change_amount: p.change_amount } : {}),
        ...(p.nsu ? { nsu: p.nsu } : {}),
        ...(p.auth_code ? { auth_code: p.auth_code } : {}),
        ...(p.card_last_digits ? { card_last_digits: p.card_last_digits } : {}),
        ...(p.card_brand ? { card_brand: p.card_brand } : {}),
        ...(p.installments != null ? { installments: p.installments } : {}),
        ...(p.pix_tx_id ? { pix_tx_id: p.pix_tx_id } : {}),
      }));

      const pdvTraceId = newPdvTraceId();
      const idempotencyKey = crypto.randomUUID();

      const rpcFinalize = await safeRpc<{ success: boolean; sale_id?: string; error?: string }>("finalize_sale_atomic", {
        p_company_id: companyId,
        p_terminal_id: currentSession.terminal_id,
        p_session_id: currentSession.id,
        p_items: saleItems,
        p_subtotal: cart.subtotal,
        p_discount_pct: cart.globalDiscountPercent,
        p_discount_val: cart.globalDiscountValue,
        p_total: cart.total,
        p_payments: paymentsSummary,
        p_sold_by: userId || null,
        p_idempotency_key: idempotencyKey,
      });
      if (rpcFinalize.success === false) throw new Error(rpcFinalize.error);
      const result = rpcFinalize.data;
      if (!result.success) {
        const err = result.error || "Erro desconhecido na transação";
        if (err.includes("excede o limite de") || err.includes("DISCOUNT_ABOVE_ROLE_LIMIT")) {
          toast.error(`🚫 ${err}`, { duration: 6000 });
          finalizingRef.current = false;
          setFinalizingSale(false);
          throw new Error("DISCOUNT_BLOCKED");
        }
        throw new Error(err);
      }

      const saleId = result.sale_id!;

      const fiscalCustomerName = options?.fiscalCustomer?.name?.trim() || "";
      const fiscalCustomerDocRaw = options?.fiscalCustomer?.doc?.replace(/\D/g, "") || "";
      const fiscalCustomerDoc =
        fiscalCustomerDocRaw.length === 11 || fiscalCustomerDocRaw.length === 14
          ? fiscalCustomerDocRaw
          : "";

      if (fiscalCustomerName || fiscalCustomerDoc) {
        if (fiscalCustomerName) {
          const nameAttempts: Array<Record<string, unknown>> = [
            { customer_name: fiscalCustomerName },
            { client_name: fiscalCustomerName },
            { counterpart: fiscalCustomerName },
          ];
          let nameSaved = false;
          for (const payload of nameAttempts) {
            const { error } = await supabase
              .from("sales")
              .update(payload as Record<string, unknown>)
              .eq("id", saleId)
              .eq("company_id", companyId);
            if (!error) {
              nameSaved = true;
              break;
            }
          }
          if (!nameSaved) {
            console.warn("[PDV] Falha ao vincular nome do cliente à venda para NFC-e");
          }
        }

        if (fiscalCustomerDoc) {
          const docAttempts: Array<Record<string, unknown>> = [
            { customer_doc: fiscalCustomerDoc, customer_cpf: fiscalCustomerDoc },
            { customer_doc: fiscalCustomerDoc },
            { customer_cpf: fiscalCustomerDoc },
          ];
          let docSaved = false;
          for (const payload of docAttempts) {
            const { error } = await supabase
              .from("sales")
              .update(payload as Record<string, unknown>)
              .eq("id", saleId)
              .eq("company_id", companyId);
            if (!error) {
              docSaved = true;
              break;
            }
          }
          if (!docSaved) {
            console.warn("[PDV] Falha ao vincular CPF/CNPJ do cliente à venda para NFC-e");
          }
        }
      }

      // ✅ CORREÇÃO #1: Aumentar delay pós-commit para PIX/Cartão
      const baseDelayMs = pdvPostSaleVisibilityDelayMs(payments);
      const paymentMethod = payments[0]?.method || 'dinheiro';
      const isHighLatencyPayment = paymentMethod === 'pix' || paymentMethod === 'credito' || paymentMethod === 'debito';
      const extraDelayForHighLatency = isHighLatencyPayment ? 1500 : 0; // +1.5s extra
      const totalDelayMs = baseDelayMs + extraDelayForHighLatency;

      if (totalDelayMs > 0) {
        console.log(`[PDV] ${new Date().toISOString()} Aguardando visibilidade: ${totalDelayMs}ms (pagamento: ${paymentMethod}, saleId: ${saleId.substring(0, 8)})`);
        await new Promise((r) => setTimeout(r, totalDelayMs));
      }

      decrementLocalStock(cart.cartItems.map(c => ({ id: c.id, quantity: c.quantity })));
      const savedItems = [...cart.cartItems];
      cart.clearCart();
      setContingencyMode(false);

      console.log(
        `[PDV] Venda #${saleId.substring(0, 8)} finalizada. ` +
        `Pagamento: ${payments.map(p => `${p.method}(R$${p.amount.toFixed(2)})`).join(", ")} | ` +
        `Delay: ${totalDelayMs}ms | ` +
        `Timestamp: ${new Date().toISOString()}`
      );

      logAction({
        companyId, userId: userId || undefined,
        action: "Venda finalizada", module: "vendas",
        details: `Venda #${saleId.substring(0, 8)} - R$ ${saleTotalCaptured.toFixed(2)}`,
        correlation: {
          trace_id: pdvTraceId, company_id: companyId,
          sale_id: saleId, amount: saleTotalCaptured,
          summary: `Venda #${saleId.substring(0, 8)} - R$ ${saleTotalCaptured.toFixed(2)}`,
        },
      });

      let nfceNumber = "";
      let fiscalDocId: string | undefined;
      let accessKey = "";
      let serie = "";
      /** Cupom PDV: alinha com fiscal_configs.environment (evita "homologação" em produção). */
      let isHomologacaoReceipt: boolean | undefined = undefined;

      if (!options?.skipFiscal) {
        try {
          const {
            config: simConfig,
            crt: fiscalCrt,
            isHomologacao: isSimHomolog,
            hasCert: simHasCert,
          } = await getFiscalConfig(companyId, "nfce");
          isHomologacaoReceipt = isSimHomolog;
          const isSimulation = simConfig && isSimHomolog && !simHasCert;

          if (isSimulation && simConfig) {
            const fakeChave = Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join("");
            // ⚠️ NÃO chamamos next_fiscal_number em simulação — ver comentário
            // em NfceEmissionDialog.handleEmit. Usar RPC aqui consumiria o
            // próximo número da série e causaria gap em emissões reais.
            const simNum = Math.floor(Date.now() % 1_000_000);
            nfceNumber = `SIM-${simNum}`;
            accessKey = fakeChave;
            serie = String(simConfig.serie ?? 1);
            Promise.allSettled([
              supabase.from("fiscal_documents").insert({
                company_id: companyId, sale_id: saleId, doc_type: "nfce",
                status: "simulado", access_key: fakeChave,
                protocol_number: Date.now().toString(), environment: "homologacao",
                serie: String(simConfig.serie ?? 1), number: simNum, total_value: saleTotalCaptured,
              }),
              supabase.from("sales").update({ status: "emitida" }).eq("id", saleId),
            ]).catch(() => {});
            toast.success("✅ Simulação concluída! (modo teste — sem envio à SEFAZ)", { description: `NFC-e simulada: ${nfceNumber}`, duration: 6000 });
          } else {
            const bypassQueue = pdvPaymentsBypassFiscalQueue(payments);
            const queueId = bypassQueue ? undefined : ((await enqueueFiscal(saleId)) ?? undefined);

            if (!bypassQueue && queueId == null) {
              toast.warning("Venda concluída, mas a NFC-e não foi enfileirada.", {
                description: "Verifique Fiscal > Documentos para reprocessar a emissão.",
                duration: 8000,
              });
            }

            const FISCAL_TIMEOUT_MS = 28_000;
            try {
              const fiscalPromise = processFiscalEmission(saleId, queueId, {
                customer_name: fiscalCustomerName || undefined,
                customer_doc: fiscalCustomerDoc || undefined,
              });

              const raced = await Promise.race([
                fiscalPromise.then((r) => ({ done: true as const, r })),
                new Promise<{ done: false }>((resolve) => setTimeout(() => resolve({ done: false }), FISCAL_TIMEOUT_MS)),
              ]);

              if (raced.done) {
                const fiscalResult = raced.r;
                fiscalDocId = fiscalResult.fiscalDocId || undefined;
                accessKey = fiscalResult.accessKey || accessKey;
                serie = fiscalResult.serie || serie;
                if (fiscalResult.status === "autorizada") {
                  nfceNumber = fiscalResult.nfceNumber || "";
                  toast.success("✅ NFC-e emitida com sucesso!", { description: `Número: ${nfceNumber}`, duration: 5000 });
                } else {
                  toast.info("🕒 NFC-e enviada e aguardando autorização.", {
                    description: bypassQueue
                      ? "Consulte o Histórico de vendas se o cupom não atualizar."
                      : "A autorização pode concluir em segundo plano; use o Histórico se necessário.",
                    duration: 6000,
                  });
                }
              } else {
                toast.info("🕒 Venda concluída. NFC-e ainda em processamento.", {
                  description: "A emissão continua em segundo plano. Verifique o Histórico se não atualizar.",
                  duration: 6000,
                });
              }
            } catch (fiscalErr: unknown) {
              const errMsg = await getFunctionErrorMessage(fiscalErr, "Erro desconhecido na emissão fiscal");
              toast.error(`⚠️ Emissão fiscal falhou: ${errMsg}`, {
                description: "A venda foi registrada. Reprocesse depois em Fiscal > Documentos.",
                duration: 10000,
              });
            }
          }
        } catch (fiscalOuter: unknown) {
          console.error("[PDV] Falha antes/durante enfileiramento fiscal:", fiscalOuter);
          const msg = fiscalOuter instanceof Error ? fiscalOuter.message : String(fiscalOuter);
          toast.error(`⚠️ NFC-e não iniciada: ${msg}`, { description: "A venda foi registrada. Verifique Fiscal > Documentos ou tente reprocessar.", duration: 8000 });
        }
      }

      return { saleId, nfceNumber, fiscalDocId, isContingency: false, accessKey, serie, isHomologacao: isHomologacaoReceipt };
    } catch (onlineErr: unknown) {
      if (onlineErr instanceof Error && onlineErr.message === "DISCOUNT_BLOCKED") throw onlineErr;
      if (!isConnectivityError(onlineErr)) {
        throw onlineErr instanceof Error ? onlineErr : new Error("Falha na finalização da venda");
      }

      // CONTINGENCY FALLBACK
      const maxDisc = options?.maxDiscountPercent ?? 5;
      if (cart.globalDiscountPercent > maxDisc) {
        toast.error(`🚫 Desconto global de ${cart.globalDiscountPercent}% excede o limite de ${maxDisc}% para seu perfil.`, { duration: 6000 });
        finalizingRef.current = false;
        setFinalizingSale(false);
        throw new Error("DISCOUNT_BLOCKED");
      }
      for (const [itemId, disc] of Object.entries(cart.itemDiscounts)) {
        if (disc > maxDisc) {
          const itemName = cart.cartItems.find(i => i.id === itemId)?.name || itemId;
          toast.error(`🚫 Desconto de ${disc}% no item "${itemName}" excede o limite de ${maxDisc}%.`, { duration: 6000 });
          finalizingRef.current = false;
          setFinalizingSale(false);
          throw new Error("DISCOUNT_BLOCKED");
        }
      }

      setContingencyMode(true);

      let userId = "";
      if (navigator.onLine) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          userId = user?.id || "";
          if (userId) localStorage.setItem("as_cached_user_id", userId);
        } catch {}
      }
      if (!userId) userId = localStorage.getItem("as_cached_user_id") || "";

      const saleItems: FinalizeSaleItemInput[] = cart.cartItems.map((item) => {
        const manualDiscountRaw = cart.itemDiscounts[item.id] || 0;
        const manualDiscount = Math.min(Number.isFinite(manualDiscountRaw) ? manualDiscountRaw : 0, maxDisc);
        const priceAfterManual = item.price * (1 - manualDiscount / 100);
        const itemSubtotal = priceAfterManual * item.quantity;
        return {
          product_id: item.id, product_name: item.name, quantity: item.quantity,
          unit_price: item.price, discount_percent: manualDiscount,
          subtotal: Math.round(itemSubtotal * 100) / 100,
        };
      });

      const offlineSaleId = crypto.randomUUID();
      let contingencyNumber = "900001";

      try {
        let configId = "";
        let serie = 1;
        let emitente: { cnpj: string; name: string; ie: string; uf: string; crt: number } | undefined;
        let environment: "homologacao" | "producao" = "homologacao";

        if (navigator.onLine) {
          try {
            const { config: contConfig, crt: contCrt } = await getFiscalConfig(companyId!, "nfce");
            if (contConfig) { configId = contConfig.id; serie = contConfig.serie || 1; environment = contConfig.environment || "homologacao"; }
            const { data: company } = await supabase.from("companies").select("cnpj, name, state_registration, address_state").eq("id", companyId!).single();
            if (company) emitente = { cnpj: company.cnpj || "", name: company.name || "", ie: company.state_registration || "", uf: company.address_state || "SP", crt: contCrt };
          } catch {}
        }

        const contingencyPayload = await buildContingencyPayload({
          saleId: offlineSaleId, companyId: companyId!, configId, serie, emitente, environment,
          form: {
            nat_op: "VENDA DE MERCADORIA",
            payment_method: payments[0]?.method === "dinheiro" ? "01" : payments[0]?.method === "pix" ? "17" : "99",
            payment_value: cart.total,
            change: payments[0]?.change_amount || 0,
            customer_name: options?.fiscalCustomer?.name?.trim() || undefined,
            customer_doc: options?.fiscalCustomer?.doc?.replace(/\D/g, "") || undefined,
            items: cart.cartItems.map(item => ({
              name: item.name, ncm: item.ncm || "", cfop: "5102", cst: "", unit: item.unit || "UN",
              qty: item.quantity, unit_price: item.price,
              discount: item.price * (cart.itemDiscounts[item.id] || 0) / 100 * item.quantity,
              pis_cst: "49", cofins_cst: "49", icms_aliquota: 0,
            })),
          },
        });

        contingencyNumber = String(contingencyPayload.contingency_number || contingencyNumber);
        await queueOperation("fiscal_contingency", contingencyPayload as unknown as Record<string, unknown>, 1, 5);
      } catch {}

      try {
        await queueOperation("sale", {
          company_id: companyId, terminal_id: currentSession?.terminal_id || "OFFLINE",
          session_id: currentSession?.id || null, total: cart.total, subtotal: cart.subtotal,
          discount_pct: cart.globalDiscountPercent, discount_val: cart.globalDiscountValue,
          payments: payments.map(p => ({ method: p.method, amount: p.amount, approved: p.approved })),
          items: saleItems, user_id: userId, created_at: new Date().toISOString(),
        }, 2, 3);
      } catch {}

      setContingencySaleIds(prev => new Set(prev).add(offlineSaleId));
      cart.clearCart();
      return { saleId: offlineSaleId, nfceNumber: `CONT-${contingencyNumber}`, fiscalDocId: undefined, isContingency: true };
    } finally {
      finalizingRef.current = false;
      setFinalizingSale(false);
    }
  }, [companyId, currentSession, cart, decrementLocalStock, queueOperation, enqueueFiscal, processFiscalEmission]);

  const repeatLastSale = useCallback(async () => {
    if (!companyId) { toast.info("Sem empresa"); return; }
    try {
      const { data: lastSale } = await supabase.from("sales").select("id").eq("company_id", companyId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!lastSale) { toast.info("Nenhuma venda anterior encontrada"); return; }
      const { data: items } = await supabase.from("sale_items").select("product_id, quantity").eq("sale_id", lastSale.id);
      if (!items || items.length === 0) { toast.info("Itens da última venda não encontrados"); return; }
      let added = 0;
      for (const item of items as Array<Record<string, unknown>>) {
        const product = products.find(p => p.id === item.product_id);
        if (product && product.stock_quantity > 0) {
          const qty = Math.min(Number(item.quantity), product.stock_quantity);
          for (let i = 0; i < qty; i++) cart.addToCart(product);
          added++;
        }
      }
      if (added > 0) toast.success(`${added} produto(s) da última venda adicionados`);
      else toast.warning("Produtos da última venda estão sem estoque");
    } catch { toast.error("Erro ao repetir última venda"); }
  }, [companyId, products, cart.addToCart]);

  return {
    products, cartItems: cart.cartItems, loadingProducts, currentSession, loadingSession, sessionEverLoaded,
    isOnline, globalDiscountPercent: cart.globalDiscountPercent, globalDiscountValue: cart.globalDiscountValue,
    itemDiscounts: cart.itemDiscounts, trainingMode, contingencyMode, syncStats, contingencySaleIds, finalizingSale,
    subtotal: cart.subtotal, total: cart.total, promoSavings: cart.promoSavings, promoMatches: cart.promoMatches,
    addToCart: cart.addToCart, removeItem: cart.removeItem, updateQuantity: cart.updateQuantity,
    clearCart: cart.clearCart, setGlobalDiscountPercent: cart.setGlobalDiscountPercent,
    setItemDiscount: cart.setItemDiscount, handleBarcodeScan, finalizeSale, reloadSession, repeatLastSale,
    refreshProducts, reprocessFiscal,
  };
}