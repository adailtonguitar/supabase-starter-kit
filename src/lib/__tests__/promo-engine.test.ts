import { describe, it, expect } from "vitest";
import { calculatePromoForItem, calculateCartPromos } from "../promo-engine";

const now = new Date("2026-03-11T12:00:00");

const basePromo = {
  id: "promo-1",
  name: "10% OFF",
  promo_type: "percentual",
  discount_percent: 10,
  starts_at: "2026-01-01",
  is_active: true,
};

describe("Promo Engine", () => {
  describe("percentual", () => {
    it("applies percentage discount", () => {
      const match = calculatePromoForItem(
        { id: "p1", price: 100, quantity: 2 },
        [basePromo as any],
        now
      );
      expect(match).not.toBeNull();
      expect(match!.finalPrice).toBe(90);
      expect(match!.totalSavings).toBe(20);
    });

    it("skips inactive promo", () => {
      const match = calculatePromoForItem(
        { id: "p1", price: 100, quantity: 1 },
        [{ ...basePromo, is_active: false } as any],
        now
      );
      expect(match).toBeNull();
    });

    it("skips expired promo", () => {
      const match = calculatePromoForItem(
        { id: "p1", price: 100, quantity: 1 },
        [{ ...basePromo, ends_at: "2026-01-01" } as any],
        now
      );
      expect(match).toBeNull();
    });

    it("skips promo not started yet", () => {
      const match = calculatePromoForItem(
        { id: "p1", price: 100, quantity: 1 },
        [{ ...basePromo, starts_at: "2027-01-01" } as any],
        now
      );
      expect(match).toBeNull();
    });
  });

  describe("preco_fixo", () => {
    it("applies fixed price", () => {
      const match = calculatePromoForItem(
        { id: "p1", price: 100, quantity: 3 },
        [{ ...basePromo, promo_type: "preco_fixo", fixed_price: 79.90, discount_percent: 0 } as any],
        now
      );
      expect(match).not.toBeNull();
      expect(match!.finalPrice).toBe(79.90);
      expect(match!.savingsPerUnit).toBeCloseTo(20.10);
    });

    it("skips if fixed price >= original", () => {
      const match = calculatePromoForItem(
        { id: "p1", price: 50, quantity: 1 },
        [{ ...basePromo, promo_type: "preco_fixo", fixed_price: 60, discount_percent: 0 } as any],
        now
      );
      expect(match).toBeNull();
    });
  });

  describe("leve_x_pague_y", () => {
    it("applies buy 3 pay 2", () => {
      const match = calculatePromoForItem(
        { id: "p1", price: 30, quantity: 3 },
        [{ ...basePromo, promo_type: "leve_x_pague_y", buy_quantity: 3, pay_quantity: 2, discount_percent: 0 } as any],
        now
      );
      expect(match).not.toBeNull();
      expect(match!.totalSavings).toBe(30); // 1 free unit
    });

    it("skips if quantity < buy_quantity", () => {
      const match = calculatePromoForItem(
        { id: "p1", price: 30, quantity: 2 },
        [{ ...basePromo, promo_type: "leve_x_pague_y", buy_quantity: 3, pay_quantity: 2, discount_percent: 0 } as any],
        now
      );
      expect(match).toBeNull();
    });
  });

  describe("calculateCartPromos", () => {
    it("calculates total savings for cart", () => {
      const items = [
        { id: "p1", price: 100, quantity: 1 },
        { id: "p2", price: 50, quantity: 2 },
      ];
      const promos = [
        { ...basePromo, product_ids: ["p1"], scope: "product" } as any,
      ];
      const { matches, totalSavings } = calculateCartPromos(items, promos);
      expect(matches["p1"]).toBeDefined();
      expect(matches["p2"]).toBeUndefined();
      expect(totalSavings).toBe(10);
    });
  });

  describe("scope filtering", () => {
    it("applies category-scoped promo", () => {
      const match = calculatePromoForItem(
        { id: "p1", price: 100, quantity: 1, category: "Bebidas" },
        [{ ...basePromo, scope: "category", category_name: "Bebidas" } as any],
        now
      );
      expect(match).not.toBeNull();
    });

    it("skips wrong category", () => {
      const match = calculatePromoForItem(
        { id: "p1", price: 100, quantity: 1, category: "Alimentos" },
        [{ ...basePromo, scope: "category", category_name: "Bebidas" } as any],
        now
      );
      expect(match).toBeNull();
    });
  });
});
