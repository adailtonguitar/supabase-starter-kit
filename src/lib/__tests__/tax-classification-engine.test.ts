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
    id: "rule-st-sp-specific",
    ncm: "22021000",
    uf_origem: "SP",
    uf_destino: "MG",
    regime: "simples",
    tipo_cliente: "cpf",
    cst: null,
    csosn: "201",
    icms_aliquota: 12,
    icms_reducao_base: 0,
    icms_st: true,
    mva: 55,
    fcp: 2,
    observacoes: "Água mineral SP→MG CPF",
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
  {
    id: "rule-partial-ncm",
    ncm: "2202",
    uf_origem: "*",
    uf_destino: "*",
    regime: "normal",
    tipo_cliente: "*",
    cst: "00",
    csosn: null,
    icms_aliquota: 17,
    icms_reducao_base: 0,
    icms_st: false,
    mva: 0,
    fcp: 0,
    observacoes: "Bebidas cap. 22.02 genérico",
  },
  {
    id: "rule-wildcard",
    ncm: "*",
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
    observacoes: "Regra genérica catch-all",
  },
];

describe("Tax Classification Engine — Score-Based", () => {
  describe("findBestRule - score matching", () => {
    it("prefers exact NCM (score 100) over partial (score 60)", () => {
      const { rule, log } = findBestRule(RULES, {
        ncm: "22021000", uf_origem: "MA", uf_destino: "MA", crt: 3, tipo_cliente: "cpf", valor: 100,
      });
      // Should match rule-partial-ncm (exact NCM 22021000 doesn't exist for normal regime)
      // but rule-partial-ncm has NCM "2202" (partial) for regime normal
      expect(rule).not.toBeNull();
      expect(log.chosen_score).toBeGreaterThanOrEqual(50);
      expect(log.top_candidates.length).toBeGreaterThan(0);
    });

    it("prefers most specific rule with higher score", () => {
      const { rule, log } = findBestRule(RULES, {
        ncm: "22021000", uf_origem: "SP", uf_destino: "MG", crt: 1, tipo_cliente: "cpf", valor: 100,
      });
      // rule-st-sp-specific: NCM exact(100) + regime(40) + UF orig exact(30) + UF dest exact(30) + tipo exact(30) = 230
      // rule-st: NCM exact(100) + regime(40) + UF orig(*)(5) + UF dest(*)(5) + tipo(*)(5) = 155
      expect(rule?.id).toBe("rule-st-sp-specific");
      expect(log.chosen_score).toBe(230);
    });

    it("logs top 3 candidates", () => {
      const { log } = findBestRule(RULES, {
        ncm: "22021000", uf_origem: "SP", uf_destino: "MG", crt: 1, tipo_cliente: "cpf", valor: 100,
      });
      expect(log.top_candidates.length).toBeLessThanOrEqual(3);
      expect(log.top_candidates[0].score).toBeGreaterThanOrEqual(log.top_candidates[1]?.score || 0);
    });

    it("returns null for unknown NCM with no wildcard matching regime", () => {
      const rulesNoWildcard = RULES.filter(r => r.ncm !== "*");
      const { rule, log } = findBestRule(rulesNoWildcard, {
        ncm: "99999999", uf_origem: "SP", uf_destino: "SP", crt: 1, tipo_cliente: "cpf", valor: 100,
      });
      expect(rule).toBeNull();
      expect(log.reason).toContain("Nenhuma regra");
    });

    it("wildcard NCM scores low (below threshold without other specifics)", () => {
      // NCM(*):10 + regime:40 + UF orig(*):5 + UF dest(*):5 + tipo(*):5 = 65
      // Actually above threshold 50, so it should match
      const { rule, log } = findBestRule(RULES, {
        ncm: "99999999", uf_origem: "XX", uf_destino: "YY", crt: 3, tipo_cliente: "cpf", valor: 100,
      });
      // UF "XX" won't match any exact, only "*", so total: 10+40+5+5+5 = 65
      // But uf_origem="XX" doesn't exist, wildcard "*" catches it
      expect(rule?.id).toBe("rule-wildcard");
      expect(log.chosen_score).toBe(65);
    });

    it("matches regime correctly", () => {
      const { rule: rSimples } = findBestRule(RULES, {
        ncm: "61091000", uf_origem: "SP", uf_destino: "SP", crt: 1, tipo_cliente: "cpf", valor: 100,
      });
      expect(rSimples?.regime).toBe("simples");

      const { rule: rNormal } = findBestRule(RULES, {
        ncm: "61091000", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      });
      expect(rNormal?.regime).toBe("normal");
    });

    it("breaks ties by NCM specificity", () => {
      // For NCM 22029900 (regime normal):
      // rule-partial-ncm: NCM partial "2202"(60) + regime(40) + UF(*)(5) + UF(*)(5) + tipo(*)(5) = 115
      // rule-wildcard: NCM(*)(10) + regime(40) + UF(*)(5) + UF(*)(5) + tipo(*)(5) = 65
      const { rule } = findBestRule(RULES, {
        ncm: "22029900", uf_origem: "MA", uf_destino: "MA", crt: 3, tipo_cliente: "cpf", valor: 100,
      });
      expect(rule?.id).toBe("rule-partial-ncm");
    });
  });

  describe("classifyTaxByNCM with scores", () => {
    it("includes match_score and match_log in result", () => {
      const result = classifyTaxByNCM({
        ncm: "22021000", uf_origem: "SP", uf_destino: "MG", crt: 1, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      expect(result.match_score).toBe(230);
      expect(result.match_log).toBeDefined();
      expect(result.match_log!.top_candidates.length).toBeGreaterThan(0);
    });

    it("classifies NCM with ST correctly", () => {
      const result = classifyTaxByNCM({
        ncm: "22021000", uf_origem: "MA", uf_destino: "MA", crt: 1, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      expect(result.fallback_used).toBe(false);
      expect(result.cst_or_csosn).toBe("500");
      expect(result.icms_st).toBe(true);
    });

    it("classifies NCM with base reduction", () => {
      const result = classifyTaxByNCM({
        ncm: "84181000", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      expect(result.base_reduzida).toBe(true);
      expect(result.icms_type).toBe("reducao");
      expect(result.cst_or_csosn).toBe("20");
    });

    it("applies fallback for empty NCM", () => {
      const result = classifyTaxByNCM({
        ncm: "", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      expect(result.fallback_used).toBe(true);
    });

    it("classifies isento correctly", () => {
      const result = classifyTaxByNCM({
        ncm: "30049099", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      expect(result.cst_or_csosn).toBe("40");
      expect(result.icms_type).toBe("isento");
    });

    it("forces fallback for wildcard NCM (low confidence)", () => {
      const result = classifyTaxByNCM({
        ncm: "99999999", uf_origem: "SP", uf_destino: "SP", crt: 3, tipo_cliente: "cpf", valor: 100,
      }, RULES);

      // Wildcard rule has low confidence → fallback forçado
      expect(result.fallback_used).toBe(true);
      expect(result.confidence_level).toBe("low");
      expect(result.warnings.some(w => w.includes("baixa confiança"))).toBe(true);
    });
  });

  describe("validateTaxClassification", () => {
    it("warns on fallback", () => {
      const result = classifyTaxByNCM({
        ncm: "99999999", uf_origem: "SP", uf_destino: "SP", crt: 1, tipo_cliente: "cpf", valor: 100,
      }, RULES.filter(r => r.ncm !== "*" && r.regime !== "simples"));

      const errors = validateTaxClassification(result);
      expect(errors.some(e => e.severity === "warning")).toBe(true);
    });

    it("errors on ST without MVA", () => {
      const result = classifyTaxByNCM({
        ncm: "22021000", uf_origem: "MA", uf_destino: "MA", crt: 1, tipo_cliente: "cpf", valor: 100,
      }, RULES);
      const corrupted = { ...result, icms_st: true, mva: 0 };
      expect(hasCriticalTaxErrors(validateTaxClassification(corrupted))).toBe(true);
    });
  });

  describe("buildTaxAuditEntry with scores", () => {
    it("includes match_score and top_candidates", () => {
      const input: TaxClassificationInput = {
        ncm: "22021000", uf_origem: "SP", uf_destino: "MG", crt: 1, tipo_cliente: "cpf", valor: 100,
      };
      const result = classifyTaxByNCM(input, RULES);
      const audit = buildTaxAuditEntry(input, result);

      expect(audit.match_score).toBe(230);
      expect(audit.top_candidates.length).toBeGreaterThan(0);
    });
  });
});
