import { describe, it, expect } from "vitest";
import { calculateIcmsSt, calculateAdjustedMva, isTypicalStNcm } from "../icms-st-engine";

describe("ICMS-ST Engine", () => {
  describe("isTypicalStNcm", () => {
    it("detects typical ST NCM", () => {
      const result = isTypicalStNcm("22021000");
      expect(result.isTypical).toBe(true);
      expect(result.description).toContain("Água mineral");
    });

    it("returns false for non-ST NCM", () => {
      expect(isTypicalStNcm("10063021").isTypical).toBe(false);
    });

    it("handles null/undefined", () => {
      expect(isTypicalStNcm(null).isTypical).toBe(false);
      expect(isTypicalStNcm(undefined).isTypical).toBe(false);
    });
  });

  describe("calculateIcmsSt", () => {
    it("calculates ST for internal operation", () => {
      const result = calculateIcmsSt({
        productValue: 100,
        mvaOriginal: 50,
        icmsOwnRate: 18,
        icmsInternalRate: 18,
        isInterstate: false,
      });
      expect(result.bcIcmsOwn).toBe(100);
      expect(result.icmsOwn).toBe(18);
      expect(result.bcIcmsSt).toBe(150); // 100 * 1.5
      expect(result.icmsSt).toBe(9); // 150*0.18 - 18 = 27 - 18
      expect(result.totalWithSt).toBe(109);
    });

    it("calculates ST for interstate operation with adjusted MVA", () => {
      const result = calculateIcmsSt({
        productValue: 100,
        mvaOriginal: 50,
        mvaAdjusted: 65,
        icmsOwnRate: 18,
        icmsInterstateRate: 12,
        icmsInternalRate: 18,
        isInterstate: true,
      });
      expect(result.mvaUsed).toBe(65);
      expect(result.icmsOwn).toBe(12); // 100 * 12%
      expect(result.bcIcmsSt).toBe(165); // 100 * 1.65
    });

    it("includes IPI and freight in base", () => {
      const result = calculateIcmsSt({
        productValue: 100,
        ipiValue: 10,
        freightValue: 5,
        mvaOriginal: 40,
        icmsOwnRate: 18,
        icmsInternalRate: 18,
        isInterstate: false,
      });
      expect(result.bcIcmsOwn).toBe(115); // 100+10+5
    });

    it("icmsSt is never negative", () => {
      const result = calculateIcmsSt({
        productValue: 100,
        mvaOriginal: 0,
        icmsOwnRate: 18,
        icmsInternalRate: 12,
        isInterstate: false,
      });
      expect(result.icmsSt).toBeGreaterThanOrEqual(0);
    });
  });

  describe("calculateAdjustedMva", () => {
    it("adjusts MVA for interstate", () => {
      const adjusted = calculateAdjustedMva(50, 12, 18);
      expect(adjusted).toBeGreaterThan(50);
    });

    it("returns original when internal rate >= 100", () => {
      expect(calculateAdjustedMva(50, 12, 100)).toBe(50);
    });
  });
});
