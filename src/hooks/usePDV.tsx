import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
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
    
    const saleItems = cartItems.map(item => ({
      product_id: item.id,
      product_name: item.name,
      quantity: item.quantity,
      unit_price: item.price,
      discount_percent: itemDiscounts[item.id] || 0,
      subtotal: item.price * (1 - (itemDiscounts[item.id] || 0) / 100) * item.quantity,
    }));

    const { data, error } = await supabase.from("sales").insert({
      company_id: companyId,
      terminal_id: currentSession.terminal_id,
      session_id: currentSession.id,
      items: saleItems,
      subtotal,
      discount_percent: globalDiscountPercent,
      discount_value: globalDiscountValue,
      total,
      payments: payments.map(p => ({ method: p.method, amount: p.amount, approved: p.approved })),
      status: "completed",
    } as any).select("id").single();

    if (error) throw error;

    // Decrement stock
    for (const item of cartItems) {
      try { await supabase.rpc("decrement_stock", { p_product_id: item.id, p_quantity: item.quantity }); } catch { /* ignore */ }
    }

    clearCart();
    return { saleId: data?.id, nfceNumber: "", fiscalDocId: undefined };
  }, [companyId, currentSession, cartItems, subtotal, globalDiscountPercent, globalDiscountValue, total, itemDiscounts, clearCart]);

  const repeatLastSale = useCallback(() => {
    // TODO: implement repeat last sale
  }, []);

  const refreshProducts = useCallback(() => { loadProducts(); }, [loadProducts]);

  return {
    products, cartItems, loadingProducts, currentSession, loadingSession, sessionEverLoaded,
    isOnline, globalDiscountPercent, globalDiscountValue, itemDiscounts, trainingMode,
    subtotal, total, promoSavings,
    addToCart, removeItem, updateQuantity, clearCart, setGlobalDiscountPercent,
    setItemDiscount, handleBarcodeScan, finalizeSale, reloadSession, repeatLastSale,
    refreshProducts,
  };
}
