import { describe, it, expect } from "vitest";
import { validateCstCsosn, getSuggestedCodes } from "../cst-csosn-validator";

describe("CST/CSOSN Validator", () => {
  describe("Simples Nacional (CSOSN)", () => {
    it("accepts valid CSOSN", () => {
      const result = validateCstCsosn({ regime: "simples_nacional", csosn: "102" });
      expect(result.valid).toBe(true);
    });

    it("rejects missing CSOSN", () => {
      const result = validateCstCsosn({ regime: "simples_nacional" });
      expect(result.valid).toBe(false);
      expect(result.errors[0].type).toBe("missing");
    });

    it("rejects invalid CSOSN code", () => {
      const result = validateCstCsosn({ regime: "simples_nacional", csosn: "999" });
      expect(result.valid).toBe(false);
      expect(result.errors[0].type).toBe("invalid_code");
    });

    it("rejects CST ICMS on Simples Nacional", () => {
      const result = validateCstCsosn({ regime: "simples_nacional", csosn: "102", cstIcms: "00" });
      expect(result.valid).toBe(false);
      expect(result.errors[0].type).toBe("wrong_regime");
    });

    it("warns on wrong product type", () => {
      const result = validateCstCsosn({ regime: "simples_nacional", csosn: "201", productType: "normal" });
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("Lucro Presumido (CST ICMS)", () => {
    it("accepts valid CST ICMS", () => {
      const result = validateCstCsosn({ regime: "lucro_presumido", cstIcms: "00" });
      expect(result.valid).toBe(true);
    });

    it("rejects missing CST ICMS", () => {
      const result = validateCstCsosn({ regime: "lucro_presumido" });
      expect(result.valid).toBe(false);
    });

    it("rejects CSOSN on Lucro Presumido", () => {
      const result = validateCstCsosn({ regime: "lucro_presumido", cstIcms: "00", csosn: "102" });
      expect(result.valid).toBe(false);
    });
  });

  describe("getSuggestedCodes", () => {
    it("returns CSOSN codes for Simples Nacional", () => {
      const codes = getSuggestedCodes("simples_nacional", "normal");
      expect(codes.length).toBeGreaterThan(0);
      expect(codes.every(c => c.productType === "normal" || c.productType === "ambos")).toBe(true);
    });

    it("returns CST codes for Lucro Real", () => {
      const codes = getSuggestedCodes("lucro_real", "st");
      expect(codes.length).toBeGreaterThan(0);
    });
  });
});
