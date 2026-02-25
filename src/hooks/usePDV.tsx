import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useSync } from "@/hooks/useSync";
import { buildContingencyPayload } from "@/services/ContingencyService";
import type { PaymentResult } from "@/services/types";

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
    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, barcode, price, stock_quantity, unit, category, ncm")
      .eq("company_id", companyId)
      .order("name");
    console.log("[PDV] Products loaded:", data?.length ?? 0, "error:", error);
    if (data) setProducts(data as PDVProduct[]);
    setLoadingProducts(false);
  }, [companyId]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const reloadSession = useCallback(async (terminalId: string) => {
    setLoadingSession(true);
    try {
      if (!companyId) { setCurrentSession(null); return; }
      const { data } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("company_id", companyId)
        .eq("terminal_id", terminalId)
        .is("closed_at", null)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setCurrentSession(data as CashSession | null);
    } catch {
      setCurrentSession(null);
    } finally {
      setLoadingSession(false);
      setSessionEverLoaded(true);
    }
  }, [companyId]);

  const addToCart = useCallback((product: PDVProduct) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    return true;
  }, []);

  const removeItem = useCallback((id: string) => {
    setCartItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, delta: number) => {
    setCartItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const newQty = i.quantity + delta;
      return newQty > 0 ? { ...i, quantity: newQty } : i;
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
    const product = products.find(p => p.barcode === barcode || p.sku === barcode);
    if (product && product.stock_quantity > 0) {
      addToCart(product);
    }
  }, [products, addToCart]);

  const finalizeSale = useCallback(async (payments: PaymentResult[]) => {
    if (!companyId || !currentSession) throw new Error("Sessão de caixa não encontrada");

    // Get user_id from Supabase auth
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

    // ── Map payment totals by method ──
    const paymentTotals: Record<string, number> = {};
    for (const p of payments) {
      const key = p.method === "credito" || p.method === "debito" ? p.method : p.method;
      paymentTotals[key] = (paymentTotals[key] || 0) + p.amount;
    }

    // Try normal online sale first
    try {
      // ── STEP 1: Insert sale ──
      const { data: saleData, error: saleError } = await supabase.from("sales").insert({
        company_id: companyId,
        terminal_id: currentSession.terminal_id,
        session_id: currentSession.id,
        items: saleItems,
        subtotal,
        discount_percent: globalDiscountPercent,
        discount_value: globalDiscountValue,
        total,
        payments: paymentsSummary,
        status: "completed",
        sold_by: userId || undefined,
      } as any).select("id").single();

      if (saleError) throw saleError;
      const saleId = saleData?.id;

      // ── STEP 2: Decrement stock (with rollback on failure) ──
      const decrementedItems: { id: string; quantity: number }[] = [];
      try {
        for (const item of cartItems) {
          const { error: stockErr } = await supabase.rpc("decrement_stock", { p_product_id: item.id, p_quantity: item.quantity });
          if (stockErr) {
            throw new Error(`Falha ao reduzir estoque de "${item.name}": ${stockErr.message}`);
          }
          decrementedItems.push({ id: item.id, quantity: item.quantity });
        }
      } catch (stockError: any) {
        // ROLLBACK: reverse stock decrements already done
        for (const dec of decrementedItems) {
          try { await supabase.rpc("decrement_stock", { p_product_id: dec.id, p_quantity: -dec.quantity }); } catch { /* best effort */ }
        }
        // ROLLBACK: delete the sale
        if (saleId) {
          try { await supabase.from("sales").delete().eq("id", saleId); } catch { /* best effort */ }
        }
        throw new Error(`Venda cancelada — ${stockError.message}`);
      }

      // ── STEP 3: Update cash session totals ──
      try {
        const { data: sessionData } = await supabase
          .from("cash_sessions")
          .select("total_vendas, total_dinheiro, total_debito, total_credito, total_pix, total_voucher, total_outros, sales_count")
          .eq("id", currentSession.id)
          .single();

        if (sessionData) {
          const updates: Record<string, number> = {
            total_vendas: Number(sessionData.total_vendas || 0) + total,
            sales_count: Number(sessionData.sales_count || 0) + 1,
          };

          // Increment per-method totals
          for (const [method, amount] of Object.entries(paymentTotals)) {
            const fieldMap: Record<string, string> = {
              dinheiro: "total_dinheiro",
              debito: "total_debito",
              credito: "total_credito",
              pix: "total_pix",
              voucher: "total_voucher",
            };
            const field = fieldMap[method] || "total_outros";
            updates[field] = Number((sessionData as any)[field] || 0) + amount;
          }

          const { error: sessErr } = await supabase
            .from("cash_sessions")
            .update(updates)
            .eq("id", currentSession.id);

          if (sessErr) console.error("[PDV] Erro ao atualizar sessão de caixa:", sessErr.message);
        }
      } catch (sessError: any) {
        console.error("[PDV] Erro ao atualizar sessão:", sessError.message);
        // Non-blocking: sale already saved, just log the error
      }

      // ── STEP 4: Create financial entry ──
      try {
        const primaryMethod = payments[0]?.method || "outros";
        const { error: finErr } = await supabase.from("financial_entries").insert({
          company_id: companyId,
          type: "receber",
          description: `Venda PDV #${saleId?.slice(0, 8) || "N/A"}`,
          reference: saleId,
          amount: total,
          due_date: new Date().toISOString().split("T")[0],
          paid_date: new Date().toISOString().split("T")[0],
          paid_amount: total,
          payment_method: primaryMethod,
          status: "pago",
          created_by: userId || "system",
        } as any);

        if (finErr) console.error("[PDV] Erro ao criar lançamento financeiro:", finErr.message);
      } catch (finError: any) {
        console.error("[PDV] Erro financeiro:", finError.message);
        // Non-blocking: sale already saved
      }

      // ── STEP 5: Try to emit NFC-e ──
      let nfceNumber = "";
      let fiscalDocId: string | undefined;
      let fiscalPending = false;
      try {
        const { data: fiscalData, error: fiscalErr } = await supabase.functions.invoke("emit-nfce", {
          body: {
            action: "emit",
            sale_id: saleId,
            company_id: companyId,
            items: saleItems,
            total,
            payments: paymentsSummary,
          },
        });

        if (fiscalErr) {
          console.warn("[PDV] NFC-e emission failed:", fiscalErr.message);
          fiscalPending = true;
        } else if (fiscalData?.success) {
          nfceNumber = fiscalData.nfce_number || fiscalData.numero || "";
          fiscalDocId = fiscalData.fiscal_doc_id || fiscalData.id;
        } else {
          console.warn("[PDV] NFC-e emission returned error:", fiscalData?.error);
          fiscalPending = true;
        }
      } catch (fiscalError: any) {
        console.warn("[PDV] NFC-e call failed:", fiscalError.message);
        fiscalPending = true;
      }

      // Mark sale as fiscal pending if emission failed
      if (fiscalPending && saleId) {
        try {
          await supabase.from("sales").update({ status: "pendente_fiscal" } as any).eq("id", saleId);
        } catch { /* best effort */ }
      }

      // ── STEP 6: Update local product stock ──
      setProducts(prev => prev.map(p => {
        const cartItem = cartItems.find(c => c.id === p.id);
        if (cartItem) {
          return { ...p, stock_quantity: Math.max(0, p.stock_quantity - cartItem.quantity) };
        }
        return p;
      }));

      clearCart();
      setContingencyMode(false);
      return { saleId, nfceNumber, fiscalDocId, isContingency: false };
    } catch (onlineErr: any) {
      // ── CONTINGENCY FALLBACK ──
      console.warn("[PDV] Online sale failed, entering contingency:", onlineErr.message);
      setContingencyMode(true);

      const offlineSaleId = crypto.randomUUID();

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

      await queueOperation("fiscal_contingency", contingencyPayload as unknown as Record<string, unknown>, 1, 5);

      await queueOperation("sale", {
        company_id: companyId,
        total,
        payment_method: payments[0]?.method || "outros",
        items: saleItems,
        user_id: userId,
        created_at: new Date().toISOString(),
      }, 2, 3);

      setContingencySaleIds(prev => new Set(prev).add(offlineSaleId));
      clearCart();
      return { saleId: offlineSaleId, nfceNumber: `CONT-${contingencyPayload.contingency_number}`, fiscalDocId: undefined, isContingency: true };
    }
  }, [companyId, currentSession, cartItems, subtotal, globalDiscountPercent, globalDiscountValue, total, itemDiscounts, clearCart, queueOperation]);

  const repeatLastSale = useCallback(() => {
    // TODO: implement repeat last sale
  }, []);

  const refreshProducts = useCallback(() => { loadProducts(); }, [loadProducts]);

  return {
    products, cartItems, loadingProducts, currentSession, loadingSession, sessionEverLoaded,
    isOnline, globalDiscountPercent, globalDiscountValue, itemDiscounts, trainingMode,
    contingencyMode, syncStats, contingencySaleIds,
    subtotal, total, promoSavings,
    addToCart, removeItem, updateQuantity, clearCart, setGlobalDiscountPercent,
    setItemDiscount, handleBarcodeScan, finalizeSale, reloadSession, repeatLastSale,
    refreshProducts,
  };
}
