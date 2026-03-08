/**
 * Promotion Engine — calculates automatic discounts for PDV cart items
 */

export interface PromoMatch {
  promoId: string;
  promoName: string;
  promoType: string;
  /** Original price per unit */
  originalPrice: number;
  /** Final price per unit after promo */
  finalPrice: number;
  /** Savings per unit */
  savingsPerUnit: number;
  /** Total savings for the line (savingsPerUnit * qty) */
  totalSavings: number;
}

interface CartItemForPromo {
  id: string;
  price: number;
  quantity: number;
  category?: string;
}

interface ActivePromo {
  id: string;
  name: string;
  promo_type: string;
  discount_percent: number;
  fixed_price?: number;
  buy_quantity?: number;
  pay_quantity?: number;
  scope?: string;
  category_name?: string;
  min_quantity?: number;
  product_ids?: string[];
  active_days?: number[];
  starts_at: string;
  ends_at?: string;
  is_active: boolean;
}

/**
 * Check if a promotion is currently valid (date + day-of-week)
 */
function isPromoValid(promo: ActivePromo, now: Date): boolean {
  if (!promo.is_active) return false;
  if (new Date(promo.starts_at) > now) return false;
  if (promo.ends_at && new Date(promo.ends_at) < now) return false;
  if (promo.active_days && promo.active_days.length > 0) {
    if (!promo.active_days.includes(now.getDay())) return false;
  }
  return true;
}

/**
 * Check if a promotion applies to a given product
 */
function promoAppliesToProduct(promo: ActivePromo, item: CartItemForPromo): boolean {
  if (promo.scope === "category") {
    return !!item.category && item.category === promo.category_name;
  }
  // scope === "product" → must have product_ids matching
  if (promo.scope === "product") {
    if (!promo.product_ids || promo.product_ids.length === 0) return false;
    return promo.product_ids.includes(item.id);
  }
  // No scope set and no product_ids = applies to all (legacy basic promos)
  if (promo.product_ids && promo.product_ids.length > 0) {
    return promo.product_ids.includes(item.id);
  }
  return true;
}

/**
 * Calculate the best promo match for a cart item.
 * Returns the single best promotion (highest savings) or null.
 */
export function calculatePromoForItem(
  item: CartItemForPromo,
  promotions: ActivePromo[],
  now: Date = new Date()
): PromoMatch | null {
  let bestMatch: PromoMatch | null = null;

  for (const promo of promotions) {
    if (!isPromoValid(promo, now)) continue;
    if (!promoAppliesToProduct(promo, item)) continue;

    const minQty = promo.min_quantity || 1;
    if (item.quantity < minQty && promo.promo_type !== "leve_x_pague_y") continue;

    let savingsPerUnit = 0;
    let finalPrice = item.price;

    switch (promo.promo_type) {
      case "percentual": {
        const pct = promo.discount_percent || 0;
        if (pct <= 0) continue;
        savingsPerUnit = item.price * (pct / 100);
        finalPrice = item.price - savingsPerUnit;
        break;
      }
      case "preco_fixo": {
        const fp = promo.fixed_price ?? 0;
        if (fp <= 0 || fp >= item.price) continue;
        savingsPerUnit = item.price - fp;
        finalPrice = fp;
        break;
      }
      case "leve_x_pague_y": {
        const buyQ = promo.buy_quantity || 3;
        const payQ = promo.pay_quantity || 2;
        if (item.quantity < buyQ) continue;
        // e.g. buy 3 pay 2 → savings = (3-2)/3 * price per unit
        const freeUnits = buyQ - payQ;
        const sets = Math.floor(item.quantity / buyQ);
        const totalFreeUnits = sets * freeUnits;
        const totalSavings = totalFreeUnits * item.price;
        // Average savings per unit across total qty
        savingsPerUnit = totalSavings / item.quantity;
        finalPrice = item.price - savingsPerUnit;
        break;
      }
      default:
        continue;
    }

    const totalSavings = savingsPerUnit * item.quantity;
    if (totalSavings > 0 && (!bestMatch || totalSavings > bestMatch.totalSavings)) {
      bestMatch = {
        promoId: promo.id,
        promoName: promo.name,
        promoType: promo.promo_type,
        originalPrice: item.price,
        finalPrice: Math.max(0, finalPrice),
        savingsPerUnit,
        totalSavings,
      };
    }
  }

  return bestMatch;
}

/**
 * Calculate promo matches for all cart items.
 * Returns a map of productId → PromoMatch
 */
export function calculateCartPromos(
  items: CartItemForPromo[],
  promotions: ActivePromo[]
): { matches: Record<string, PromoMatch>; totalSavings: number } {
  const now = new Date();
  const matches: Record<string, PromoMatch> = {};
  let totalSavings = 0;

  for (const item of items) {
    const match = calculatePromoForItem(item, promotions, now);
    if (match) {
      matches[item.id] = match;
      totalSavings += match.totalSavings;
    }
  }

  return { matches, totalSavings };
}
