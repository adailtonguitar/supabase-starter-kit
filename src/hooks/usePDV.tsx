import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useSync } from "@/hooks/useSync";
import { buildContingencyPayload } from "@/services/ContingencyService";
import type { PaymentResult } from "@/services/types";
import { isScaleBarcode, parseScaleBarcode } from "@/lib/scale-barcode";
import { calculateCartPromos, type PromoMatch } from "@/lib/promo-engine";
import { cacheSet, cacheGet } from "@/lib/offline-cache";
import { logAction } from "@/services/ActionLogger";
import { fiscalCircuitBreaker, CircuitBreakerOpenError } from "@/lib/circuit-breaker";

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
  image_url?: string;
  reorder_point?: number;
}

interface CartItem extends PDVProduct {
  quantity: number;
}

interface CashSession {
  id: string;
  terminal_id: string;
  opened_at: string;
  initial_amount: number;
}

export function usePDV() {
  const { companyId } = useCompany();
  const { queueOperation, stats: syncStats, syncing: syncingSales } = useSync();
  const [products, setProducts] = useState<PDVProduct[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionEverLoaded, setSessionEverLoaded] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState(0);
  const [itemDiscounts, setItemDiscounts] = useState<Record<string, number>>({});
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

  const loadProducts = useCallback(async () => {
    if (!companyId) return;
    setLoadingProducts(true);
    
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, sku, barcode, price, cost_price, stock_quantity, unit, category, ncm, image_url")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name");
        
        if (data && data.length > 0) {
          setProducts(data as PDVProduct[]);
          // Cache to IndexedDB for offline use
          cacheSet("pdv_products", companyId, data).catch(() => {});
        } else if (error) {
          throw error; // fall to catch → offline cache
        }
      } else {
        throw new Error("offline");
      }
    } catch {
      // Offline or network error: read from IndexedDB
      const cached = await cacheGet<PDVProduct[]>("pdv_products", companyId);
      if (cached?.data && cached.data.length > 0) {
        setProducts(cached.data);
        if (!navigator.onLine) {
          toast.info("Produtos carregados do cache offline", { id: "pdv-offline-products" });
        }
      }
    }
    
    setLoadingProducts(false);
  }, [companyId]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Refresh products every 2 minutes to keep stock in sync across terminals
  useEffect(() => {
    if (!companyId) return;
    const interval = setInterval(() => { loadProducts(); }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [companyId, loadProducts]);

  const loadOfflineSession = useCallback((terminalId: string): boolean => {
    try {
      const raw = localStorage.getItem("as_offline_cash_session");
      if (raw) {
        const offlineSession = JSON.parse(raw);
        // Accept if company matches (or companyId not yet loaded) and terminal + status match
        const companyMatch = !companyId || offlineSession?.company_id === companyId;
        if (companyMatch && offlineSession?.terminal_id === terminalId && offlineSession?.status === "aberto") {
          setCurrentSession(offlineSession as CashSession);
          return true;
        }
      }
    } catch {}
    return false;
  }, [companyId]);

  const reloadSession = useCallback(async (terminalId: string) => {
    setLoadingSession(true);
    try {
      if (!companyId) { setCurrentSession(null); return; }

      // When offline, load from localStorage immediately — don't hit Supabase
      if (!navigator.onLine) {
        if (!loadOfflineSession(terminalId)) {
          setCurrentSession(null);
        }
        return;
      }
      
      // Try online
      const { data, error } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("company_id", companyId)
        .eq("terminal_id", terminalId)
        .eq("status", "aberto")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setCurrentSession(data as CashSession | null);
        // Cache session to localStorage for offline resilience
        try {
          localStorage.setItem("as_offline_cash_session", JSON.stringify({
            ...data,
            company_id: companyId,
            status: "aberto",
          }));
        } catch {}
      } else {
        try { localStorage.removeItem("as_offline_cash_session"); } catch {}
        setCurrentSession(null);
      }
    } catch {
      // Network error — try offline session
      if (!loadOfflineSession(terminalId)) {
        setCurrentSession(null);
      }
    } finally {
      setLoadingSession(false);
      setSessionEverLoaded(true);
    }
  }, [companyId, loadOfflineSession]);

  const addToCart = useCallback((product: PDVProduct) => {
    let added = false;
    setCartItems(prev => {
      const existing = prev.find(i => i.id === product.id);
      const currentQty = existing ? existing.quantity : 0;
      if (currentQty + 1 > product.stock_quantity) {
        return prev; // will signal not added
      }
      added = true;
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    if (!added) {
      toast.warning(`Estoque insuficiente para "${product.name}" (disponível: ${product.stock_quantity})`, { duration: 2000 });
    }
    // Margin alert: warn if selling below cost
    if (added && product.cost_price && product.cost_price > 0) {
      if (product.price <= product.cost_price) {
        const loss = product.cost_price - product.price;
        toast.error(
          `⚠️ PREJUÍZO: "${product.name}" está sendo vendido ${product.price < product.cost_price ? `R$ ${loss.toFixed(2)} abaixo` : 'igual ao'} custo (Custo: R$ ${product.cost_price.toFixed(2)} | Venda: R$ ${product.price.toFixed(2)})`,
          { duration: 6000, id: `margin-alert-${product.id}` }
        );
      } else {
        // Margem sobre receita (consistente com relatórios): (preço - custo) / preço
        const marginPercent = ((product.price - product.cost_price) / product.price) * 100;
        if (marginPercent < 10) {
          toast.warning(
            `⚠️ Margem baixa: "${product.name}" tem apenas ${marginPercent.toFixed(1)}% de margem (Custo: R$ ${product.cost_price.toFixed(2)})`,
            { duration: 4000, id: `margin-alert-${product.id}` }
          );
        }
      }
    }
    return added;
  }, []);

  const removeItem = useCallback((id: string) => {
    setCartItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, delta: number) => {
    setCartItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const newQty = i.quantity + delta;
      if (newQty <= 0) return i;
      if (delta > 0 && newQty > i.stock_quantity) {
        toast.warning(`Estoque insuficiente para "${i.name}" (disponível: ${i.stock_quantity})`, { duration: 2000 });
        return i;
      }
      return { ...i, quantity: newQty };
    }));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setGlobalDiscountPercent(0);
    setItemDiscounts({});
  }, []);

  const setItemDiscount = useCallback((id: string, percent: number) => {
    setItemDiscounts(prev => ({ ...prev, [id]: percent }));
  }, []);

  const subtotal = Math.round(cartItems.reduce((sum, item) => {
    const discount = itemDiscounts[item.id] || 0;
    return sum + item.price * (1 - discount / 100) * item.quantity;
  }, 0) * 100) / 100;

  // --- Promotions engine ---
  const [activePromos, setActivePromos] = useState<any[]>([]);

  const loadPromotions = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data } = await supabase
        .from("promotions")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true);
      setActivePromos(data || []);
    } catch {}
  }, [companyId]);

  useEffect(() => { loadPromotions(); }, [loadPromotions]);

  const { matches: promoMatches, totalSavings: promoSavings } = useMemo(
    () => calculateCartPromos(cartItems, activePromos),
    [cartItems, activePromos]
  );

  const globalDiscountValue = Math.round(subtotal * (globalDiscountPercent / 100) * 100) / 100;
  const total = Math.round((subtotal - globalDiscountValue - promoSavings) * 100) / 100;

  const handleBarcodeScan = useCallback((barcode: string) => {
    // Check for scale barcode (EAN-13 prefix 20-29)
    if (isScaleBarcode(barcode)) {
      const parsed = parseScaleBarcode(barcode);
      if (parsed) {
        // Find product by internal code (last digits of SKU or barcode containing productCode)
        const product = products.find(
          (p) => p.sku === parsed.productCode || p.barcode === parsed.productCode ||
                 p.sku.endsWith(parsed.productCode) || (p.barcode && p.barcode.endsWith(parsed.productCode))
        );
        if (product && product.stock_quantity > 0) {
          if (parsed.mode === "weight") {
            const weightToAdd = Math.min(parsed.value, product.stock_quantity);
            setCartItems((prev) => {
              const existing = prev.find((i) => i.id === product.id);
              const currentQty = existing ? existing.quantity : 0;
              const safeQty = Math.min(weightToAdd, product.stock_quantity - currentQty);
              if (safeQty <= 0) return prev;
              if (existing) {
                return prev.map((i) => i.id === product.id ? { ...i, quantity: i.quantity + safeQty } : i);
              }
              return [...prev, { ...product, quantity: safeQty }];
            });
          } else {
            const qty = product.price > 0 ? parsed.value / product.price : 1;
            const safeQty = Math.min(qty, product.stock_quantity);
            setCartItems((prev) => {
              const existing = prev.find((i) => i.id === product.id);
              const currentQty = existing ? existing.quantity : 0;
              const finalQty = Math.min(safeQty, product.stock_quantity - currentQty);
              if (finalQty <= 0) return prev;
              if (existing) {
                return prev.map((i) => i.id === product.id ? { ...i, quantity: i.quantity + finalQty } : i);
              }
              return [...prev, { ...product, quantity: finalQty }];
            });
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
      addToCart(product);
    }
  }, [products, addToCart]);

  // ── Enfileirar emissão fiscal na fiscal_queue ──
  const enqueueFiscal = useCallback(async (saleId: string) => {
    if (!companyId) return;
    try {
      const { error } = await supabase.from("fiscal_queue").insert({
        sale_id: saleId,
        company_id: companyId,
        status: "pending",
        attempts: 0,
      } as any);
      if (error) {
        console.error("[PDV] Falha ao enfileirar fiscal:", error.message);
        toast.warning("Venda registrada, mas NFC-e não foi enfileirada. Reprocesse manualmente.", { duration: 8000 });
      }
    } catch (err: any) {
      console.error("[PDV] Erro ao enfileirar fiscal:", err?.message);
      toast.warning("Venda registrada, mas NFC-e não foi enfileirada. Reprocesse manualmente.", { duration: 8000 });
    }
  }, [companyId]);

  // ── Processar emissão fiscal (usada tanto pelo enqueue quanto pelo reprocess) ──
  const processFiscalEmission = useCallback(async (saleId: string, queueId?: string) => {
    if (!companyId) throw new Error("Empresa não identificada");

    console.log("[PDV Fiscal] processFiscalEmission called for saleId:", saleId, "companyId:", companyId);

    // Best-effort config lookup in client; if RLS blocks it, server will resolve config.
    const { data: allConfigs, error: fcError } = await supabase
      .from("fiscal_configs")
      .select("id, doc_type, is_active, crt, environment, certificate_path, a3_thumbprint, serie, next_number")
      .eq("company_id", companyId);

    const { data: companyFiscal } = await supabase
      .from("companies")
      .select("crt")
      .eq("id", companyId)
      .maybeSingle();

    const fiscalConfig = allConfigs?.find((c: any) => c.doc_type === "nfce" && c.is_active)
      || allConfigs?.find((c: any) => c.doc_type === "nfe" && c.is_active)
      || allConfigs?.find((c: any) => c.doc_type === "nfce")
      || allConfigs?.find((c: any) => c.doc_type === "nfe")
      || allConfigs?.[0]
      || null;

    const resolvedCrt = (fiscalConfig as any)?.crt || (companyFiscal as any)?.crt || 1;
    const isHomologacao = (fiscalConfig as any)?.environment === "homologacao";
    const hasCert = !!((fiscalConfig as any)?.certificate_path || (fiscalConfig as any)?.a3_thumbprint);

    console.log("[PDV Fiscal] Config lookup:", JSON.stringify({ fiscalConfig, fcError, companyFiscal }));
    console.log("[PDV Fiscal] isHomologacao:", isHomologacao, "hasCert:", hasCert, "resolvedCrt:", resolvedCrt);

    // ── MODO SIMULAÇÃO: homologação sem certificado ──
    if (isHomologacao && !hasCert) {
      const fakeChave = Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join("");
      const simNumber = (fiscalConfig as any).next_number || 1;

      // Best-effort DB updates (don't block simulation)
      try {
        await Promise.allSettled([
          supabase.from("fiscal_documents").insert({
            company_id: companyId, sale_id: saleId, doc_type: "nfce",
            status: "simulado", access_key: fakeChave,
            protocol_number: Date.now().toString(), environment: "homologacao",
            serie: (fiscalConfig as any).serie || "1", number: simNumber, total_value: 0,
          } as any),
          supabase.from("fiscal_configs").update({ next_number: simNumber + 1 } as any).eq("id", fiscalConfig.id),
          supabase.from("sales").update({ status: "emitida" } as any).eq("id", saleId),
          queueId ? supabase.from("fiscal_queue").update({ status: "done", processed_at: new Date().toISOString() } as any).eq("id", queueId) : Promise.resolve(),
        ]);
      } catch (e) {
        console.warn("[PDV Fiscal] Simulation DB updates failed (non-blocking):", e);
      }

      toast.success("✅ Simulação concluída! (modo teste — sem envio à SEFAZ)", {
        description: `Chave fictícia: ${fakeChave.substring(0, 20)}...`,
        duration: 6000,
      });

      return {
        nfceNumber: `SIM-${simNumber}`,
        fiscalDocId: null,
      };
    }

    // Marcar sale como pendente_fiscal
    await supabase.from("sales").update({ status: "pendente_fiscal" } as any).eq("id", saleId);

    // Atualizar queue status
    if (queueId) {
      await supabase.from("fiscal_queue").update({ status: "processing", attempts: 1 } as any).eq("id", queueId);
    }

    // Buscar sale_items do banco (fonte única de verdade)
    const { data: saleItems } = await supabase
      .from("sale_items")
      .select("*")
      .eq("sale_id", saleId);

    if (!saleItems?.length) throw new Error("Itens da venda não encontrados");

    const { data: sale } = await supabase
      .from("sales")
      .select("total, payments")
      .eq("id", saleId)
      .single();

    if (!sale) throw new Error("Venda não encontrada");

    const crt = fiscalConfig.crt || 1;
    const defaultCst = (crt === 1 || crt === 2) ? "102" : "00";
    const payments = (sale.payments as any[]) || [];
    const paymentMethodMap: Record<string, string> = {
      dinheiro: "01", credito: "03", debito: "04", pix: "17", voucher: "05",
    };

    const fiscalItems = saleItems.map((item: any) => ({
      product_id: item.product_id,
      name: item.product_name || item.name,
      ncm: item.ncm || "",
      cfop: "5102",
      cst: defaultCst,
      origem: "0",
      unit: item.unit || "UN",
      qty: item.quantity,
      unit_price: item.unit_price,
      discount: (item.discount_percent || 0) / 100 * item.unit_price * item.quantity,
      pis_cst: "49",
      cofins_cst: "49",
    }));

    const { data: fiscalData, error: fiscalErr } = await fiscalCircuitBreaker.call(() =>
      supabase.functions.invoke("emit-nfce", {
        body: {
          action: "emit",
          sale_id: saleId,
          company_id: companyId,
          config_id: fiscalConfig.id,
          form: {
            nat_op: "VENDA DE MERCADORIA",
            crt,
            payment_method: paymentMethodMap[payments[0]?.method] || "99",
            payment_value: sale.total,
            change: payments[0]?.change_amount || 0,
            items: fiscalItems,
          },
        },
      })
    );

    if (fiscalErr || !fiscalData?.success) {
      const errorMsg = fiscalData?.error || fiscalErr?.message || "Falha na emissão";
      if (queueId) {
        await supabase.from("fiscal_queue").update({ status: "error", last_error: errorMsg } as any).eq("id", queueId);
      }
      throw new Error(errorMsg);
    }

    // Sucesso
    await supabase.from("sales").update({ status: "emitida" } as any).eq("id", saleId);
    if (queueId) {
      await supabase.from("fiscal_queue").update({ status: "done", processed_at: new Date().toISOString() } as any).eq("id", queueId);
    }

    return {
      nfceNumber: fiscalData.nfce_number || fiscalData.numero || "",
      fiscalDocId: fiscalData.fiscal_doc_id || fiscalData.id,
    };
  }, [companyId]);

  // ── Reprocessar fiscal para vendas pendentes (usa processFiscalEmission) ──
  const reprocessFiscal = useCallback(async (saleId: string) => {
    try {
      const result = await processFiscalEmission(saleId);
      toast.success("NFC-e emitida com sucesso!");
      return result;
    } catch (err: any) {
      toast.error(`Erro ao reprocessar fiscal: ${err.message}`);
      throw err;
    }
  }, [processFiscalEmission]);

  const finalizeSale = useCallback(async (payments: PaymentResult[], options?: { skipFiscal?: boolean }) => {
    // ── Guard contra double-click (ref + state) ──
    if (finalizingRef.current) {
      toast.warning("Venda já em processamento, aguarde...", { duration: 1200 });
      throw new Error("Venda em processamento");
    }
    if (!companyId || !currentSession) throw new Error("Sessão de caixa não encontrada");
    if (cartItems.length === 0) throw new Error("Carrinho vazio");
    if (total <= 0) throw new Error("Total da venda deve ser maior que zero");

    finalizingRef.current = true;
    setFinalizingSale(true);

    try {
      // ── If offline, skip RPC entirely and go straight to contingency ──
      if (!navigator.onLine) {
        throw new Error("offline");
      }

      // Get user_id — cache for offline use
      let userId = "";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id || "";
        if (userId) localStorage.setItem("as_cached_user_id", userId);
      } catch { /* offline fallback */ }

      const saleItems = cartItems.map(item => {
        const manualDiscount = itemDiscounts[item.id] || 0;
        const promoMatch = promoMatches[item.id];
        const effectivePrice = promoMatch ? promoMatch.finalPrice : item.price;
        const priceAfterManual = effectivePrice * (1 - manualDiscount / 100);
        const itemSubtotal = priceAfterManual * item.quantity;
        return {
          product_id: item.id,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          discount_percent: manualDiscount + (promoMatch ? (promoMatch.savingsPerUnit / item.price) * 100 : 0),
          subtotal: Math.round(itemSubtotal * 100) / 100,
        };
      });

      const paymentsSummary = payments.map(p => ({ method: p.method, amount: p.amount, approved: p.approved }));

      // ── Chamada única: RPC atômica ──
      const { data: rpcResult, error: rpcError } = await supabase.rpc("finalize_sale_atomic", {
        p_company_id: companyId,
        p_terminal_id: currentSession.terminal_id,
        p_session_id: currentSession.id,
        p_items: saleItems,
        p_subtotal: subtotal,
        p_discount_pct: globalDiscountPercent,
        p_discount_val: globalDiscountValue,
        p_total: total,
        p_payments: paymentsSummary,
        p_sold_by: userId || null,
      });

      if (rpcError) throw new Error(rpcError.message);

      const result = rpcResult as { success: boolean; sale_id?: string; error?: string };
      if (!result.success) {
        const err = result.error || "Erro desconhecido na transação";
        // Detect discount limit errors — these should NOT trigger contingency
        if (err.includes("excede o limite de") || err.includes("DISCOUNT_ABOVE_ROLE_LIMIT")) {
          toast.error(`🚫 ${err}`, { duration: 6000 });
          finalizingRef.current = false;
          setFinalizingSale(false);
          throw new Error("DISCOUNT_BLOCKED");
        }
        throw new Error(err);
      }

      const saleId = result.sale_id!;

      // Atualizar estoque local
      const savedItems = [...cartItems];
      setProducts(prev => prev.map(p => {
        const cartItem = savedItems.find(c => c.id === p.id);
        return cartItem ? { ...p, stock_quantity: Math.max(0, p.stock_quantity - cartItem.quantity) } : p;
      }));

      // Limpar carrinho APÓS sucesso da RPC
      clearCart();
      setContingencyMode(false);

      // Log de auditoria da venda
      logAction({ companyId, userId: userId || undefined, action: "Venda finalizada", module: "vendas", details: `Venda #${saleId.substring(0, 8)} - R$ ${total.toFixed(2)}` });

      // ── Fiscal: enfileira na fiscal_queue e tenta processar ──
      let nfceNumber = "";
      let fiscalDocId: string | undefined;
      let accessKey = "";
      let serie = "";
      console.log("[PDV finalizeSale] skipFiscal:", options?.skipFiscal);
      if (!options?.skipFiscal) {
        // Check simulation mode directly here
        try {
          // Fetch ALL configs, pick best match
          const { data: allSimConfigs } = await supabase
            .from("fiscal_configs")
            .select("id, doc_type, is_active, environment, certificate_path, a3_thumbprint, next_number, serie")
            .eq("company_id", companyId);

          const simConfig = allSimConfigs?.find((c: any) => c.doc_type === "nfce" && c.is_active)
            || allSimConfigs?.find((c: any) => c.doc_type === "nfe" && c.is_active)
            || allSimConfigs?.find((c: any) => c.doc_type === "nfce")
            || allSimConfigs?.find((c: any) => c.doc_type === "nfe")
            || allSimConfigs?.[0]
            || null;

          console.log("[PDV finalizeSale] simConfig:", simConfig);

          const isSimulation = simConfig 
            && (simConfig as any).environment === "homologacao" 
            && !(simConfig as any).certificate_path 
            && !(simConfig as any).a3_thumbprint;

          if (isSimulation && simConfig) {
            const simNum = (simConfig as any).next_number || 1;
            const fakeChave = Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join("");
            nfceNumber = `SIM-${simNum}`;
            accessKey = fakeChave;
            serie = (simConfig as any).serie || "1";

            // Best-effort DB updates
            Promise.allSettled([
              supabase.from("fiscal_documents").insert({
                company_id: companyId, sale_id: saleId, doc_type: "nfce",
                status: "simulado", access_key: fakeChave,
                protocol_number: Date.now().toString(), environment: "homologacao",
                serie: (simConfig as any).serie || "1", number: simNum, total_value: total,
              } as any),
              supabase.from("fiscal_configs").update({ next_number: simNum + 1 } as any).eq("id", simConfig.id),
              supabase.from("sales").update({ status: "emitida" } as any).eq("id", saleId),
            ]).catch(() => {});

            toast.success("✅ Simulação concluída! (modo teste — sem envio à SEFAZ)", {
              description: `NFC-e simulada: ${nfceNumber}`,
              duration: 6000,
            });
          } else {
            // Real emission
            enqueueFiscal(saleId);
            try {
              const fiscalResult = await processFiscalEmission(saleId);
              nfceNumber = fiscalResult.nfceNumber || "";
              fiscalDocId = fiscalResult.fiscalDocId || undefined;
              if (nfceNumber) {
                toast.success("✅ NFC-e emitida com sucesso!", {
                  description: `Número: ${nfceNumber}`,
                  duration: 5000,
                });
              }
            } catch (fiscalErr: any) {
              const errMsg = fiscalErr?.message || "Erro desconhecido na emissão fiscal";
              console.error("[PDV Fiscal] Emission failed:", errMsg);
              toast.error(`⚠️ Emissão fiscal falhou: ${errMsg}`, {
                description: "A venda foi registrada. Você pode reprocessar a NFC-e depois em Fiscal > Documentos.",
                duration: 10000,
              });
            }
          }
        } catch (checkErr: any) {
          console.error("[PDV Fiscal] Config check failed:", checkErr?.message);
        }
      }

      return { saleId, nfceNumber, fiscalDocId, isContingency: false, accessKey, serie };
    } catch (onlineErr: any) {
      // ── Discount blocked: don't enter contingency, just re-throw ──
      if (onlineErr?.message === "DISCOUNT_BLOCKED") {
        throw onlineErr;
      }

      // ── CONTINGENCY FALLBACK ──
      // Online sale failed, entering contingency mode
      setContingencyMode(true);

      // Get user_id for contingency — use cached value when offline
      let userId = "";
      if (navigator.onLine) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          userId = user?.id || "";
          if (userId) localStorage.setItem("as_cached_user_id", userId);
        } catch { /* offline */ }
      }
      if (!userId) {
        userId = localStorage.getItem("as_cached_user_id") || "";
      }

      const saleItems = cartItems.map(item => ({
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        discount_percent: itemDiscounts[item.id] || 0,
        subtotal: item.price * (1 - (itemDiscounts[item.id] || 0) / 100) * item.quantity,
      }));

      const offlineSaleId = crypto.randomUUID();
      let contingencyNumber = "900001";

      try {
        let configId = "";
        let serie = 1;
        let emitente: { cnpj: string; name: string; ie: string; uf: string; crt: number } | undefined;
        let environment: "homologacao" | "producao" = "homologacao";

        // Only query Supabase for fiscal config if online; when offline use cached defaults
        if (navigator.onLine) {
          try {
            const { data: configs } = await supabase
              .from("fiscal_configs")
              .select("id, serie, environment, crt")
              .eq("company_id", companyId)
              .eq("doc_type", "nfce")
              .eq("is_active", true)
              .limit(1);
            if (configs && configs.length > 0) {
              configId = configs[0].id;
              serie = configs[0].serie || 1;
              environment = configs[0].environment || "homologacao";
            }

            const { data: company } = await supabase
              .from("companies")
              .select("cnpj, name, state_registration, address_state")
              .eq("id", companyId)
              .single();

            if (company) {
              emitente = {
                cnpj: company.cnpj || "",
                name: company.name || "",
                ie: company.state_registration || "",
                uf: company.address_state || "SP",
                crt: configs?.[0]?.crt || 1,
              };
            }
          } catch { /* use defaults */ }
        }

        const contingencyPayload = await buildContingencyPayload({
          saleId: offlineSaleId,
          companyId,
          configId,
          serie,
          emitente,
          environment,
          form: {
            nat_op: "VENDA DE MERCADORIA",
            payment_method: payments[0]?.method === "dinheiro" ? "01" : payments[0]?.method === "pix" ? "17" : "99",
            payment_value: total,
            change: payments[0]?.change_amount || 0,
            items: cartItems.map(item => ({
              name: item.name,
              ncm: item.ncm || "",
              cfop: "5102",
              cst: "",
              unit: item.unit || "UN",
              qty: item.quantity,
              unit_price: item.price,
              discount: item.price * (itemDiscounts[item.id] || 0) / 100 * item.quantity,
              pis_cst: "49",
              cofins_cst: "49",
              icms_aliquota: 0,
            })),
          },
        });

        contingencyNumber = String(contingencyPayload.contingency_number || contingencyNumber);
        await queueOperation("fiscal_contingency", contingencyPayload as unknown as Record<string, unknown>, 1, 5);
      } catch (contErr: any) {
        console.error("[PDV Contingency] Falha ao criar payload de contingência:", contErr?.message);
        toast.error("Erro ao preparar NFC-e de contingência. A venda será registrada sem fiscal.", { duration: 8000 });
      }

      try {
        await queueOperation("sale", {
          company_id: companyId,
          terminal_id: currentSession?.terminal_id || "OFFLINE",
          session_id: currentSession?.id || null,
          total,
          subtotal,
          discount_pct: globalDiscountPercent,
          discount_val: globalDiscountValue,
          payments: payments.map(p => ({ method: p.method, amount: p.amount, approved: p.approved })),
          items: saleItems,
          user_id: userId,
          created_at: new Date().toISOString(),
        }, 2, 3);
      } catch (queueErr: any) {
        console.error("[PDV Contingency] CRITICAL — Falha ao enfileirar venda offline:", queueErr?.message);
        toast.error("ATENÇÃO: Venda NÃO foi salva! Tente novamente quando a conexão retornar.", { duration: 15000 });
      }

      setContingencySaleIds(prev => new Set(prev).add(offlineSaleId));
      clearCart();
      return { saleId: offlineSaleId, nfceNumber: `CONT-${contingencyNumber}`, fiscalDocId: undefined, isContingency: true };
    } finally {
      finalizingRef.current = false;
      setFinalizingSale(false);
    }
  }, [companyId, currentSession, cartItems, subtotal, globalDiscountPercent, globalDiscountValue, total, itemDiscounts, clearCart, queueOperation, enqueueFiscal, processFiscalEmission]);

  const repeatLastSale = useCallback(async () => {
    // Buscar última venda e recarregar itens no carrinho
    if (!companyId) { toast.info("Sem empresa"); return; }
    try {
      const { data: lastSale } = await supabase
        .from("sales")
        .select("id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastSale) { toast.info("Nenhuma venda anterior encontrada"); return; }

      const { data: items } = await supabase
        .from("sale_items")
        .select("product_id, quantity")
        .eq("sale_id", lastSale.id);

      if (!items || items.length === 0) { toast.info("Itens da última venda não encontrados"); return; }

      let added = 0;
      for (const item of items as any[]) {
        const product = products.find(p => p.id === item.product_id);
        if (product && product.stock_quantity > 0) {
          const qty = Math.min(Number(item.quantity), product.stock_quantity);
          for (let i = 0; i < qty; i++) {
            addToCart(product);
          }
          added++;
        }
      }
      if (added > 0) toast.success(`${added} produto(s) da última venda adicionados`);
      else toast.warning("Produtos da última venda estão sem estoque");
    } catch {
      toast.error("Erro ao repetir última venda");
    }
  }, [companyId, products, addToCart]);

  const refreshProducts = useCallback(() => { loadProducts(); }, [loadProducts]);

  return {
    products, cartItems, loadingProducts, currentSession, loadingSession, sessionEverLoaded,
    isOnline, globalDiscountPercent, globalDiscountValue, itemDiscounts, trainingMode,
    contingencyMode, syncStats, contingencySaleIds, finalizingSale,
    subtotal, total, promoSavings, promoMatches,
    addToCart, removeItem, updateQuantity, clearCart, setGlobalDiscountPercent,
    setItemDiscount, handleBarcodeScan, finalizeSale, reloadSession, repeatLastSale,
    refreshProducts, reprocessFiscal,
  };
}
