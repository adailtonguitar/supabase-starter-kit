import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useSync } from "@/hooks/useSync";
import { buildContingencyPayload } from "@/services/ContingencyService";
import type { PaymentResult } from "@/services/types";
import { isScaleBarcode, parseScaleBarcode } from "@/lib/scale-barcode";

export interface PDVProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  price: number;
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

  const PRODUCTS_CACHE_KEY = `pdv_products_cache_${companyId}`;

  const loadProducts = useCallback(async () => {
    if (!companyId) return;
    setLoadingProducts(true);
    
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, barcode, price, stock_quantity, unit, category, ncm, image_url")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      
      if (data && data.length > 0) {
        setProducts(data as PDVProduct[]);
        try { localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(data)); } catch {}
      } else if (error) {
        try {
          const cached = localStorage.getItem(PRODUCTS_CACHE_KEY);
          if (cached) {
            setProducts(JSON.parse(cached) as PDVProduct[]);
          }
        } catch {}
      }
    } catch {
      try {
        const cached = localStorage.getItem(PRODUCTS_CACHE_KEY);
        if (cached) {
          setProducts(JSON.parse(cached) as PDVProduct[]);
        }
      } catch {}
    }
    
    setLoadingProducts(false);
  }, [companyId]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const reloadSession = useCallback(async (terminalId: string) => {
    setLoadingSession(true);
    try {
      if (!companyId) { setCurrentSession(null); return; }
      
      // Try online first
      const { data } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("company_id", companyId)
        .eq("terminal_id", terminalId)
        .eq("status", "aberto")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        setCurrentSession(data as CashSession | null);
        // Online query succeeded and found open session — clear any stale offline session
        try { localStorage.removeItem("as_offline_cash_session"); } catch {}
      } else {
        // Online query succeeded but no open session — clear stale offline cache
        try { localStorage.removeItem("as_offline_cash_session"); } catch {}
        setCurrentSession(null);
      }
    } catch {
      // Network error — try offline session
      try {
        const raw = localStorage.getItem("as_offline_cash_session");
        if (raw) {
          const offlineSession = JSON.parse(raw);
          if (offlineSession?.company_id === companyId && offlineSession?.terminal_id === terminalId && offlineSession?.status === "aberto") {
            setCurrentSession(offlineSession as CashSession);
            return;
          }
        }
      } catch {}
      setCurrentSession(null);
    } finally {
      setLoadingSession(false);
      setSessionEverLoaded(true);
    }
  }, [companyId]);

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

  const subtotal = cartItems.reduce((sum, item) => {
    const discount = itemDiscounts[item.id] || 0;
    return sum + item.price * (1 - discount / 100) * item.quantity;
  }, 0);

  const globalDiscountValue = subtotal * (globalDiscountPercent / 100);
  const total = subtotal - globalDiscountValue;
  const promoSavings = 0;

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
      await supabase.from("fiscal_queue").insert({
        sale_id: saleId,
        company_id: companyId,
        status: "pending",
        attempts: 0,
      } as any);
    } catch {
      // fiscal enqueue failed silently
    }
  }, [companyId]);

  // ── Processar emissão fiscal (usada tanto pelo enqueue quanto pelo reprocess) ──
  const processFiscalEmission = useCallback(async (saleId: string, queueId?: string) => {
    if (!companyId) throw new Error("Empresa não identificada");

    const { data: fiscalConfig, error: fcError } = await supabase
      .from("fiscal_configs")
      .select("id, crt, environment, certificate_path, a3_thumbprint, serie, next_number")
      .eq("company_id", companyId)
      .eq("doc_type", "nfce")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    console.log("[PDV Fiscal] Config query result:", { fiscalConfig, fcError });

    if (!fiscalConfig) throw new Error("Nenhuma configuração fiscal ativa");

    const isHomologacao = (fiscalConfig as any).environment === "homologacao";
    const hasCert = !!((fiscalConfig as any).certificate_path || (fiscalConfig as any).a3_thumbprint);
    console.log("[PDV Fiscal] isHomologacao:", isHomologacao, "hasCert:", hasCert, "env:", (fiscalConfig as any).environment, "cert_path:", (fiscalConfig as any).certificate_path);

    // ── MODO SIMULAÇÃO: homologação sem certificado ──
    if (isHomologacao && !hasCert) {
      const fakeChave = Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join("");
      const fakeProtocol = Date.now().toString();
      const simNumber = (fiscalConfig as any).next_number || 1;

      await supabase.from("fiscal_documents").insert({
        company_id: companyId,
        sale_id: saleId,
        doc_type: "nfce",
        status: "simulado",
        access_key: fakeChave,
        protocol_number: fakeProtocol,
        environment: "homologacao",
        serie: (fiscalConfig as any).serie || "1",
        number: simNumber,
        total_value: 0,
      } as any);

      await supabase.from("fiscal_configs").update({
        next_number: simNumber + 1,
      } as any).eq("id", fiscalConfig.id);

      await supabase.from("sales").update({ status: "emitida" } as any).eq("id", saleId);
      if (queueId) {
        await supabase.from("fiscal_queue").update({ status: "done", processed_at: new Date().toISOString() } as any).eq("id", queueId);
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

    const { data: fiscalData, error: fiscalErr } = await supabase.functions.invoke("emit-nfce", {
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
    });

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

    finalizingRef.current = true;
    setFinalizingSale(true);

    try {
      // Get user_id
      let userId = "";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id || "";
      } catch { /* offline fallback */ }

      const saleItems = cartItems.map(item => ({
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        discount_percent: itemDiscounts[item.id] || 0,
        subtotal: item.price * (1 - (itemDiscounts[item.id] || 0) / 100) * item.quantity,
      }));

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
      if (!result.success) throw new Error(result.error || "Erro desconhecido na transação");

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

      // ── Fiscal: enfileira na fiscal_queue e tenta processar ──
      let nfceNumber = "";
      let fiscalDocId: string | undefined;
      console.log("[PDV] skipFiscal:", options?.skipFiscal, "about to process fiscal");
      if (!options?.skipFiscal) {
        enqueueFiscal(saleId);
        try {
          const fiscalResult = await processFiscalEmission(saleId);
          nfceNumber = fiscalResult.nfceNumber || "";
          fiscalDocId = fiscalResult.fiscalDocId || undefined;
        } catch (fiscalErr: any) {
          console.error("[PDV Fiscal] Emission failed:", fiscalErr?.message || fiscalErr);
          // Fiscal failed — sale is saved, will retry later
        }
      }

      return { saleId, nfceNumber, fiscalDocId, isContingency: false };
    } catch (onlineErr: any) {
      // ── CONTINGENCY FALLBACK ──
      // Online sale failed, entering contingency mode
      setContingencyMode(true);

      // Get user_id for contingency
      let userId = "";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id || "";
      } catch { /* offline */ }

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
        // contingency payload failed silently
      }

      try {
        await queueOperation("sale", {
          company_id: companyId,
          total,
          payment_method: payments[0]?.method || "outros",
          items: saleItems,
          user_id: userId,
          created_at: new Date().toISOString(),
        }, 2, 3);
      } catch (queueErr: any) {
        // queue sale failed silently
      }

      setContingencySaleIds(prev => new Set(prev).add(offlineSaleId));
      clearCart();
      return { saleId: offlineSaleId, nfceNumber: `CONT-${contingencyNumber}`, fiscalDocId: undefined, isContingency: true };
    } finally {
      finalizingRef.current = false;
      setFinalizingSale(false);
    }
  }, [companyId, currentSession, cartItems, subtotal, globalDiscountPercent, globalDiscountValue, total, itemDiscounts, clearCart, queueOperation, enqueueFiscal, processFiscalEmission]);

  const repeatLastSale = useCallback(() => {
    toast.info("Funcionalidade em desenvolvimento", { duration: 1500 });
  }, []);

  const refreshProducts = useCallback(() => { loadProducts(); }, [loadProducts]);

  return {
    products, cartItems, loadingProducts, currentSession, loadingSession, sessionEverLoaded,
    isOnline, globalDiscountPercent, globalDiscountValue, itemDiscounts, trainingMode,
    contingencyMode, syncStats, contingencySaleIds, finalizingSale,
    subtotal, total, promoSavings,
    addToCart, removeItem, updateQuantity, clearCart, setGlobalDiscountPercent,
    setItemDiscount, handleBarcodeScan, finalizeSale, reloadSession, repeatLastSale,
    refreshProducts, reprocessFiscal,
  };
}
