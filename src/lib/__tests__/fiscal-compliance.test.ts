/**
 * Testes de conformidade fiscal — Simples Nacional
 */
import { describe, it, expect } from "vitest";
import { getSTConfig, calculateST } from "../../../shared/fiscal/st-engine";
import { validateFiscalData, getBlockingErrors } from "../../../shared/fiscal/nfe-pre-validator";

describe("getSTConfig — Motor de Substituição Tributária", () => {
  it("NCM de água mineral com gás tem ST no MA", () => {
    const cfg = getSTConfig("22021000", "MA");
    expect(cfg.temST).toBe(true);
    expect(cfg.mva).toBe(70);
    expect(cfg.aliquotaInterna).toBe(22);
  });

  it("NCM de água mineral com gás tem ST no SP (default)", () => {
    const cfg = getSTConfig("22021000", "SP");
    expect(cfg.temST).toBe(true);
    expect(cfg.aliquotaInterna).toBe(18);
  });

  it("NCM sem ST retorna temST=false", () => {
    const cfg = getSTConfig("94036000", "MA"); // Móveis
    expect(cfg.temST).toBe(false);
  });

  it("NCM com prefix match (4 dígitos)", () => {
    const cfg = getSTConfig("22021099", "MA"); // Variante de refrigerante
    expect(cfg.temST).toBe(true);
  });
});

describe("calculateST — Cálculo de ST", () => {
  it("Calcula vBCST e vICMSST corretamente", () => {
    const result = calculateST(100, 12, 40, 22); // vProd=100, icmsProprio=12, MVA=40%, aliq=22%
    expect(result.vBCST).toBe(140); // 100 * (1 + 40/100)
    expect(result.vICMSST).toBe(18.8); // (140 * 22/100) - 12 = 30.8 - 12 = 18.8
    expect(result.csosn).toBe("202");
  });

  it("ST já retido retorna zeros e CSOSN 500", () => {
    const result = calculateST(100, 12, 40, 22, undefined, true);
    expect(result.vBCST).toBe(0);
    expect(result.vICMSST).toBe(0);
    expect(result.csosn).toBe("500");
  });

  it("Com redução de BC", () => {
    const result = calculateST(100, 12, 40, 22, 10); // 10% redução
    expect(result.vBCST).toBe(126); // 140 * 0.9
    expect(result.vICMSST).toBe(15.72); // (126 * 0.22) - 12
  });
});

describe("validateFiscalData — Validador pré-emissão", () => {
  const baseInput = {
    crt: 1,
    isSimples: true,
    ufEmitente: "MA",
    ufDestinatario: "MA",
    items: [{
      name: "Produto Teste",
      ncm: "94036000",
      cfop: "5102",
      csosn: "102",
      pisCst: "49",
      cofinsCst: "49",
      origem: 0,
    }],
  };

  it("Venda Simples sem ST → deve passar", () => {
    const errors = getBlockingErrors(validateFiscalData(baseInput));
    expect(errors).toHaveLength(0);
  });

  it("PIS/COFINS CST 01 para Simples → deve bloquear", () => {
    const input = {
      ...baseInput,
      items: [{ ...baseInput.items[0], pisCst: "01" }],
    };
    const errors = getBlockingErrors(validateFiscalData(input));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.field === "pis_cst")).toBe(true);
  });

  it("COFINS CST 02 para Simples → deve bloquear", () => {
    const input = {
      ...baseInput,
      items: [{ ...baseInput.items[0], cofinsCst: "02" }],
    };
    const errors = getBlockingErrors(validateFiscalData(input));
    expect(errors.some(e => e.field === "cofins_cst")).toBe(true);
  });

  it("CFOP 5102 com destino interestadual → deve bloquear", () => {
    const input = {
      ...baseInput,
      ufDestinatario: "PI",
      items: [{ ...baseInput.items[0], cfop: "5102" }],
    };
    const errors = getBlockingErrors(validateFiscalData(input));
    expect(errors.some(e => e.field === "cfop")).toBe(true);
  });

  it("CFOP 6102 com destino interno → deve bloquear", () => {
    const input = {
      ...baseInput,
      ufDestinatario: "MA",
      items: [{ ...baseInput.items[0], cfop: "6102" }],
    };
    const errors = getBlockingErrors(validateFiscalData(input));
    expect(errors.some(e => e.field === "cfop")).toBe(true);
  });

  it("Produto com ST obrigatória mas CSOSN 102 → deve bloquear", () => {
    const input = {
      ...baseInput,
      items: [{ ...baseInput.items[0], csosn: "102", cst: "102", hasST: true }],
    };
    const errors = getBlockingErrors(validateFiscalData(input));
    expect(errors.some(e => e.field === "csosn_st")).toBe(true);
  });

  it("NCM inválido → deve bloquear", () => {
    const input = {
      ...baseInput,
      items: [{ ...baseInput.items[0], ncm: "00000000" }],
    };
    const errors = getBlockingErrors(validateFiscalData(input));
    expect(errors.some(e => e.field === "ncm")).toBe(true);
  });

  it("NCM ausente → deve bloquear", () => {
    const input = {
      ...baseInput,
      items: [{ ...baseInput.items[0], ncm: "" }],
    };
    const errors = getBlockingErrors(validateFiscalData(input));
    expect(errors.some(e => e.field === "ncm")).toBe(true);
  });

  it("CRT inválido → deve bloquear", () => {
    const input = { ...baseInput, crt: 5 };
    const errors = getBlockingErrors(validateFiscalData(input));
    expect(errors.some(e => e.field === "crt")).toBe(true);
  });

  it("Regime Normal com CST 00 → deve passar", () => {
    const input = {
      crt: 3,
      isSimples: false,
      ufEmitente: "SP",
      ufDestinatario: "SP",
      items: [{
        name: "Produto Normal",
        ncm: "94036000",
        cfop: "5102",
        cst: "00",
        pisCst: "01",
        cofinsCst: "01",
        origem: 0,
      }],
    };
    const errors = getBlockingErrors(validateFiscalData(input));
    expect(errors).toHaveLength(0);
  });
});
