/**
 * usePDVCart — Cart operations: add, remove, quantity, discounts, totals.
 */
import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { PDVProduct } from "@/hooks/usePDV";
import { calculateCartPromos } from "@/lib/promo-engine";
import type { PromotionRecord } from "@/integrations/supabase/fiscal.types";

export interface CartItem extends PDVProduct {
  quantity: number;
}

export function usePDVCart(activePromos: PromotionRecord[]) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState(0);
  const [itemDiscounts, setItemDiscounts] = useState<Record<string, number>>({});

  const addToCart = useCallback((product: PDVProduct) => {
    let added = false;
    setCartItems(prev => {
      const existing = prev.find(i => i.id === product.id);
      const currentQty = existing ? existing.quantity : 0;
      if (currentQty + 1 > product.stock_quantity) return prev;
      added = true;
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    if (!added) {
      toast.warning(`Estoque insuficiente para "${product.name}" (disponível: ${product.stock_quantity})`, { duration: 2000 });
    }
    if (added && product.cost_price && product.cost_price > 0) {
      if (product.price <= product.cost_price) {
        const loss = product.cost_price - product.price;
        toast.error(
          `⚠️ PREJUÍZO: "${product.name}" está sendo vendido ${product.price < product.cost_price ? `R$ ${loss.toFixed(2)} abaixo` : 'igual ao'} custo (Custo: R$ ${product.cost_price.toFixed(2)} | Venda: R$ ${product.price.toFixed(2)})`,
          { duration: 6000, id: `margin-alert-${product.id}` }
        );
      } else {
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

  const { matches: promoMatches, totalSavings: promoSavings } = useMemo(
    () => calculateCartPromos(cartItems, activePromos),
    [cartItems, activePromos]
  );

  const globalDiscountValue = Math.round(subtotal * (globalDiscountPercent / 100) * 100) / 100;
  const total = Math.round((subtotal - globalDiscountValue - promoSavings) * 100) / 100;

  return {
    cartItems, globalDiscountPercent, globalDiscountValue, itemDiscounts,
    subtotal, total, promoSavings, promoMatches,
    addToCart, removeItem, updateQuantity, clearCart,
    setGlobalDiscountPercent, setItemDiscount,
  };
}
