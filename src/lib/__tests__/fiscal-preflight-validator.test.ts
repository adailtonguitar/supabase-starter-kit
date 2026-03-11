import { describe, it, expect } from "vitest";
import { runPreflightValidation } from "../fiscal-preflight-validator";

describe("Fiscal Pre-Flight Validator", () => {
  describe("NCM validation", () => {
    it("rejects generic NCM 00000000", () => {
      const result = runPreflightValidation(
        [{ name: "Produto", ncm: "00000000", cfop: "5102", cst: "102" }],
        "simples_nacional"
      );
      expect(result.valid).toBe(false);
      expect(result.issues[0].code).toBe("NCM_GENERICO");
    });

    it("warns on service NCM with product CFOP", () => {
      const result = runPreflightValidation(
        [{ name: "Serviço", ncm: "99000000", cfop: "5102", cst: "102" }],
        "simples_nacional"
      );
      expect(result.issues.some(i => i.code === "NCM_SERVICO")).toBe(true);
    });
  });

  describe("CFOP × CST/CSOSN cross-validation", () => {
    it("error: CFOP ST without CSOSN ST (Simples Nacional)", () => {
      const result = runPreflightValidation(
        [{ name: "Prod", ncm: "12345678", cfop: "5401", cst: "102" }],
        "simples_nacional"
      );
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.code === "CFOP_ST_SEM_CST_ST")).toBe(true);
    });

    it("accepts CFOP ST with CSOSN ST", () => {
      const result = runPreflightValidation(
        [{ name: "Prod", ncm: "12345678", cfop: "5401", cst: "201" }],
        "simples_nacional"
      );
      expect(result.issues.some(i => i.code === "CFOP_ST_SEM_CST_ST")).toBe(false);
    });

    it("error: CFOP ST without CST ST (Lucro Presumido)", () => {
      const result = runPreflightValidation(
        [{ name: "Prod", ncm: "12345678", cfop: "5401", cst: "00" }],
        "lucro_presumido"
      );
      expect(result.valid).toBe(false);
    });

    it("warns: CSOSN ST without CFOP ST", () => {
      const result = runPreflightValidation(
        [{ name: "Prod", ncm: "12345678", cfop: "5102", cst: "500" }],
        "simples_nacional"
      );
      expect(result.issues.some(i => i.code === "CST_ST_SEM_CFOP_ST")).toBe(true);
    });
  });

  describe("NFC-e restrictions", () => {
    it("rejects interstate CFOP", () => {
      const result = runPreflightValidation(
        [{ name: "Prod", ncm: "12345678", cfop: "6101", cst: "102" }],
        "simples_nacional"
      );
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.code === "CFOP_INTERESTADUAL_NFCE")).toBe(true);
    });
  });

  describe("CST 00 aliquota check", () => {
    it("warns CST 00 with zero aliquota", () => {
      const result = runPreflightValidation(
        [{ name: "Prod", ncm: "12345678", cfop: "5102", cst: "00", icmsAliquota: 0 }],
        "lucro_presumido"
      );
      expect(result.issues.some(i => i.code === "CST00_SEM_ALIQUOTA")).toBe(true);
    });

    it("no warning CST 00 with valid aliquota", () => {
      const result = runPreflightValidation(
        [{ name: "Prod", ncm: "12345678", cfop: "5102", cst: "00", icmsAliquota: 18 }],
        "lucro_presumido"
      );
      expect(result.issues.some(i => i.code === "CST00_SEM_ALIQUOTA")).toBe(false);
    });
  });

  describe("Valid items pass", () => {
    it("accepts correct SN item", () => {
      const result = runPreflightValidation(
        [{ name: "Arroz 5kg", ncm: "10063021", cfop: "5102", cst: "102" }],
        "simples_nacional"
      );
      expect(result.valid).toBe(true);
      expect(result.issues.filter(i => i.type === "error")).toHaveLength(0);
    });
  });
});
