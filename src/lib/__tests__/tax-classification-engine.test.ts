import { describe, it, expect } from "vitest";
import {
  classifyTaxByNCM,
  findBestRule,
  validateTaxClassification,
  hasCriticalTaxErrors,
  buildTaxAuditEntry,
  type TaxRuleByNcm,
  type TaxClassificationInput,
} from "../../../shared/fiscal/tax-classification-engine";

const RULES: TaxRuleByNcm[] = [
  {
    id: "rule-st",
    ncm: "22021000",
    uf_origem: "*",
    uf_destino: "*",
    regime: "simples",
    tipo_cliente: "*",
    cst: null,
    csosn: "500",
    icms_aliquota: 18,
    icms_reducao_base: 0,
    icms_st: true,
    mva: 50,
    fcp: 2,
    observacoes: "Água mineral — ST",
  },
  {
    id: "rule-reducao",
    ncm: "84181000",
    uf_origem: "SP",
    uf_destino: "*",
    regime: "normal",
    tipo_cliente: "*",
    cst: "20",
    csosn: null,
    icms_aliquota: 12,
    icms_reducao_base: 33.33,
    icms_st: false,
    mva: 0,
    fcp: 0,
    observacoes: "Geladeira — redução BC",
  },
  {
    id: "rule-normal",
    ncm: "61091000",
    uf_origem: "*",
    uf_destino: "*",
    regime: "normal",
    tipo_cliente: "*",
    cst: "00",
    csosn: null,
    icms_aliquota: 18,
    icms_reducao_base: 0,
    icms_st: false,
    mva: 0,
    fcp: 0,
    observacoes: "Camiseta algodão",
  },
  {
    id: "rule-simples-normal",
    ncm: "61091000",
    uf_origem: "*",
    uf_destino: "*",
    regime: "simples",
    tipo_cliente: "*",
    cst: null,
    csosn: "102",
    icms_aliquota: 0,
    icms_reducao_base: 0,
    icms_st: false,
    mva: 0,
    fcp: 0,
    observacoes: "Camiseta — Simples",
  },
  {
    id: "rule-isento",
    ncm: "30049099",
    uf_origem: "*",
    uf_destino: "*",
    regime: "normal",
    tipo_cliente: "cpf",
    cst: "40",
    csosn: null,
    icms_aliquota: 0,
    icms_reducao_base: 0,
    icms_st: false,
    mva: 0,
    fcp: 0,
    observacoes: "Medicamento isento p/ PF",
  },
];

describe("Tax Classification Engine", () => {
  describe("findBestRule", () => {
    it("finds exact NCM match", () => {
      const rule = findBestRule(RULES, {
        ncm: "22021000", uf_origem: "MA", uf_destino: "PI", crt: 1, tipo_cliente: "cpf", valor: 100,
      });
      expect(rule?.id).toBe("rule-st");
    });

    it("prefers specific UF over wildcard", () => {
      const rule = findBestRule(RULES, {
        ncm: "84181000", uf_origem: "SP", uf_destino: "MG", crt: 3, tipo_cliente: "cpf", valor: 100,
      });
      expect(rule?.id).toBe("rule-reducao");
    });

    it("returns null for unknown NCM", () => {
      const rule = findBestRule(RULES, {
        ncm: "99999999", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      });
      expect(rule).toBeNull();
    });

    it("matches regime correctly", () => {
      const ruleSimples = findBestRule(RULES, {
        ncm: "61091000", uf_origem: "SP", uf_destino: "SP", crt: 1, tipo_cliente: "cpf", valor: 100,
      });
      expect(ruleSimples?.regime).toBe("simples");

      const ruleNormal = findBestRule(RULES, {
        ncm: "61091000", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      });
      expect(ruleNormal?.regime).toBe("normal");
    });

    it("prefers specific tipo_cliente", () => {
      const rule = findBestRule(RULES, {
        ncm: "30049099", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      });
      expect(rule?.id).toBe("rule-isento");
    });
  });

  describe("classifyTaxByNCM", () => {
    it("classifies NCM with ST correctly", () => {
      const result = classifyTaxByNCM({
        ncm: "22021000", uf_origem: "MA", uf_destino: "MA", crt: 1, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      expect(result.fallback_used).toBe(false);
      expect(result.cst_or_csosn).toBe("500");
      expect(result.icms_st).toBe(true);
      expect(result.icms_type).toBe("st");
      expect(result.mva).toBe(50);
      expect(result.icms_st_base).toBe(150); // 100 * 1.5
      expect(result.icms_st_valor).toBeGreaterThan(0);
    });

    it("classifies NCM with base reduction", () => {
      const result = classifyTaxByNCM({
        ncm: "84181000", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      expect(result.base_reduzida).toBe(true);
      expect(result.icms_type).toBe("reducao");
      expect(result.cst_or_csosn).toBe("20");
      expect(result.base_calculo).toBeCloseTo(66.67, 1);
      expect(result.aliquota).toBe(12);
    });

    it("classifies normal NCM (regime normal)", () => {
      const result = classifyTaxByNCM({
        ncm: "61091000", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 200,
      }, RULES);

      expect(result.icms_type).toBe("normal");
      expect(result.cst_or_csosn).toBe("00");
      expect(result.aliquota).toBe(18);
      expect(result.icms_valor).toBe(36);
      expect(result.fallback_used).toBe(false);
    });

    it("classifies normal NCM (simples)", () => {
      const result = classifyTaxByNCM({
        ncm: "61091000", uf_origem: "SP", uf_destino: "SP", crt: 1, tipo_cliente: "cpf", valor: 200,
      }, RULES);

      expect(result.cst_or_csosn).toBe("102");
      expect(result.aliquota).toBe(0);
    });

    it("applies fallback for unknown NCM", () => {
      const result = classifyTaxByNCM({
        ncm: "99999999", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      expect(result.fallback_used).toBe(true);
      expect(result.cst_or_csosn).toBe("00");
      expect(result.icms_st).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("applies fallback for simples with unknown NCM", () => {
      const result = classifyTaxByNCM({
        ncm: "99999999", uf_origem: "SP", uf_destino: "SP", crt: 1, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      expect(result.fallback_used).toBe(true);
      expect(result.cst_or_csosn).toBe("102");
    });

    it("handles empty/null NCM", () => {
      const result = classifyTaxByNCM({
        ncm: "", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      expect(result.fallback_used).toBe(true);
      expect(result.warnings[0]).toContain("NCM ausente");
    });

    it("classifies isento correctly", () => {
      const result = classifyTaxByNCM({
        ncm: "30049099", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      expect(result.cst_or_csosn).toBe("40");
      expect(result.icms_type).toBe("isento");
      expect(result.aliquota).toBe(0);
    });
  });

  describe("validateTaxClassification", () => {
    it("warns on fallback", () => {
      const result = classifyTaxByNCM({
        ncm: "99999999", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      const errors = validateTaxClassification(result);
      expect(errors.some(e => e.severity === "warning")).toBe(true);
      expect(hasCriticalTaxErrors(errors)).toBe(false);
    });

    it("errors on ST without MVA", () => {
      const badResult = classifyTaxByNCM({
        ncm: "22021000", uf_origem: "MA", uf_destino: "MA", crt: 1, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      // Force bad state for testing
      const corrupted = { ...badResult, icms_st: true, mva: 0 };
      const errors = validateTaxClassification(corrupted);
      expect(hasCriticalTaxErrors(errors)).toBe(true);
    });

    it("no errors for valid classification", () => {
      const result = classifyTaxByNCM({
        ncm: "61091000", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      const errors = validateTaxClassification(result);
      expect(errors.length).toBe(0);
    });
  });

  describe("buildTaxAuditEntry", () => {
    it("builds correct audit entry", () => {
      const input: TaxClassificationInput = {
        ncm: "22021000", uf_origem: "MA", uf_destino: "MA", crt: 1, tipo_cliente: "cpf", valor: 100,
      };
      const result = classifyTaxByNCM(input, RULES);
      const audit = buildTaxAuditEntry(input, result);

      expect(audit.ncm).toBe("22021000");
      expect(audit.rule_id).toBe("rule-st");
      expect(audit.fallback).toBe(false);
      expect(audit.st_applied).toBe(true);
    });

    it("marks fallback in audit", () => {
      const input: TaxClassificationInput = {
        ncm: "99999999", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      };
      const result = classifyTaxByNCM(input, RULES);
      const audit = buildTaxAuditEntry(input, result);

      expect(audit.fallback).toBe(true);
      expect(audit.rule_id).toBeNull();
    });
  });
});
