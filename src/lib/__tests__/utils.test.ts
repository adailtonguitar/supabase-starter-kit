import { describe, it, expect } from "vitest";
import { cn, formatCurrency } from "../utils";

describe("utils", () => {
  describe("cn (class merge)", () => {
    it("merges classes", () => {
      expect(cn("px-2", "py-1")).toBe("px-2 py-1");
    });

    it("deduplicates conflicting tailwind classes", () => {
      expect(cn("px-2", "px-4")).toBe("px-4");
    });

    it("handles conditional classes", () => {
      expect(cn("base", false && "hidden", "extra")).toBe("base extra");
    });

    it("handles undefined/null", () => {
      expect(cn("base", undefined, null)).toBe("base");
    });
  });

  describe("formatCurrency", () => {
    it("formats positive values", () => {
      const result = formatCurrency(1234.56);
      expect(result).toContain("1.234,56");
      expect(result).toContain("R$");
    });

    it("formats zero", () => {
      expect(formatCurrency(0)).toContain("0,00");
    });

    it("formats negative values", () => {
      const result = formatCurrency(-50);
      expect(result).toContain("50,00");
    });

    it("formats small cents", () => {
      const result = formatCurrency(0.01);
      expect(result).toContain("0,01");
    });

    it("formats large values", () => {
      const result = formatCurrency(999999.99);
      expect(result).toContain("999.999,99");
    });
  });
});
