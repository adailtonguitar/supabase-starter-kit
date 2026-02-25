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

  const finalizeSale = useCallback(async (payments: PaymentResult[], options?: { skipFiscal?: boolean }) => {
    if (!companyId || !currentSession) throw new Error("Sessão de caixa não encontrada");

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

    // ── Try atomic RPC ──
    try {
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
        throw new Error(result.error || "Erro desconhecido na transação");
      }

      const saleId = result.sale_id;

      // ── NFC-e emission (disabled until Nuvem Fiscal is configured) ──
      // To re-enable: check fiscal_configs for active nfce config before calling
      let nfceNumber = "";
      let fiscalDocId: string | undefined;
      let fiscalPending = false;

      if (!options?.skipFiscal) {
      try {
        // Only attempt NFC-e if fiscal config exists for this company
        const { data: fiscalConfig } = await supabase
          .from("fiscal_configs")
          .select("id, crt")
          .eq("company_id", companyId)
          .eq("doc_type", "nfce")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (fiscalConfig) {
          const crt = fiscalConfig.crt || 1;
          const defaultCst = (crt === 1 || crt === 2) ? "102" : "00";

          const fiscalItems = cartItems.map(item => ({
            product_id: item.id,
            name: item.name,
            ncm: item.ncm || "",
            cfop: "5102",
            cst: defaultCst,
            origem: "0",
            unit: item.unit || "UN",
            qty: item.quantity,
            unit_price: item.price,
            discount: item.price * (itemDiscounts[item.id] || 0) / 100 * item.quantity,
            pis_cst: "49",
            cofins_cst: "49",
          }));

          const paymentMethodMap: Record<string, string> = {
            dinheiro: "01", credito: "03", debito: "04", pix: "17", voucher: "05",
          };

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
                payment_value: total,
                change: payments[0]?.change_amount || 0,
                items: fiscalItems,
              },
            },
          });

          if (fiscalErr) {
            console.warn("[PDV] NFC-e emission failed:", fiscalErr.message);
            fiscalPending = true;
          } else if (fiscalData?.success) {
            nfceNumber = fiscalData.nfce_number || fiscalData.numero || "";
            fiscalDocId = fiscalData.fiscal_doc_id || fiscalData.id;
          } else {
            console.warn("[PDV] NFC-e returned error:", fiscalData?.error);
            fiscalPending = true;
          }
        } else {
          console.log("[PDV] NFC-e skipped: no active fiscal config found");
        }
      } catch (fiscalError: any) {
        console.warn("[PDV] NFC-e call failed:", fiscalError.message);
        fiscalPending = true;
      }

      if (fiscalPending && saleId) {
        try {
          await supabase.from("sales").update({ status: "pendente_fiscal" } as any).eq("id", saleId);
        } catch { /* best effort */ }
      }
      } // end skipFiscal check

      // Update local product stock state
      setProducts(prev => prev.map(p => {
        const cartItem = cartItems.find(c => c.id === p.id);
        return cartItem ? { ...p, stock_quantity: Math.max(0, p.stock_quantity - cartItem.quantity) } : p;
      }));

      clearCart();
      setContingencyMode(false);
      return { saleId, nfceNumber, fiscalDocId, isContingency: false };
    } catch (onlineErr: any) {
      // ── CONTINGENCY FALLBACK ──
      console.warn("[PDV] Online sale failed, entering contingency:", onlineErr.message);
      setContingencyMode(true);

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
        console.error("[PDV] Contingency payload failed:", contErr.message);
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
        console.error("[PDV] Queue sale failed:", queueErr.message);
      }

      setContingencySaleIds(prev => new Set(prev).add(offlineSaleId));
      clearCart();
      return { saleId: offlineSaleId, nfceNumber: `CONT-${contingencyNumber}`, fiscalDocId: undefined, isContingency: true };
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
