/**
 * Testes completos da Fiscal Engine
 * 
 * Cenários:
 * 1. Venda interna Simples sem ST
 * 2. Venda interestadual com DIFAL
 * 3. Produto com ST
 * 4. Produto sem ST
 * 5. Erro de CEST
 * 6. Erro de CFOP
 * 7. PIS/COFINS monofásico
 * 8. PIS/COFINS Simples Nacional
 * 9. ST + DIFAL combinados
 * 10. Validação de documento completo
 * 11. Pipeline completa
 */

import { describe, it, expect } from "vitest";
import { classifyFiscalItem } from "../../../shared/fiscal/classifiers/fiscal-classifier";
import { getPisCofinsConfig, validatePisCofins } from "../../../shared/fiscal/pis-cofins/pis-cofins-engine";
import { calculateIcms } from "../../../shared/fiscal/icms/icms-engine";
import { validateFiscalDocument } from "../../../shared/fiscal/validators/document-validator";
import { runFiscalPipeline } from "../../../shared/fiscal/fiscal-pipeline";
import { getSTConfig, calculateST } from "../../../shared/fiscal/st-engine";
import { FiscalRulesCache } from "../../../shared/fiscal/rules/rules-cache";

// ═══════════════════════════════════════════════
// 1. CLASSIFICADOR FISCAL
// ═══════════════════════════════════════════════

describe("Classificador Fiscal", () => {
  it("venda interna Simples sem ST", () => {
    const result = classifyFiscalItem({
      ncm: "61091000", cfop: "5102",
      ufOrigem: "MA", ufDestino: "MA",
      crt: 1, tipoCliente: "cpf", valor: 100,
    });
    expect(result.regimeTributario).toBe("simples");
    expect(result.tipoOperacao).toBe("interna");
    expect(result.temST).toBe(false);
    expect(result.temDifal).toBe(false);
    expect(result.cstOuCsosnSugerido).toBe("102");
  });

  it("venda interestadual CPF deve ter DIFAL", () => {
    const result = classifyFiscalItem({
      ncm: "61091000", cfop: "5102",
      ufOrigem: "MA", ufDestino: "SP",
      crt: 3, tipoCliente: "cpf", valor: 500,
    });
    expect(result.tipoOperacao).toBe("interestadual");
    expect(result.temDifal).toBe(true);
    expect(result.cfopSugerido).toMatch(/^6/);
  });

  it("produto com ST obrigatória (cerveja)", () => {
    const result = classifyFiscalItem({
      ncm: "22030000", cfop: "5102",
      ufOrigem: "MA", ufDestino: "MA",
      crt: 1, tipoCliente: "cpf", valor: 10,
    });
    expect(result.temST).toBe(true);
    expect(result.cstOuCsosnSugerido).toBe("202");
    expect(result.cfopSugerido).toMatch(/540/);
  });

  it("produto exige CEST (bebidas)", () => {
    const result = classifyFiscalItem({
      ncm: "22021010", ufOrigem: "MA", ufDestino: "MA",
      crt: 1, tipoCliente: "cpf", valor: 5,
    });
    expect(result.exigeCEST).toBe(true);
  });

  it("PIS monofásico para combustíveis", () => {
    const result = classifyFiscalItem({
      ncm: "27101259", ufOrigem: "SP", ufDestino: "SP",
      crt: 3, tipoCliente: "cpf", valor: 500,
    });
    expect(result.tipoPIS).toBe("monofasico");
  });

  it("CNPJ contribuinte interestadual sem DIFAL", () => {
    const result = classifyFiscalItem({
      ncm: "61091000", cfop: "5102",
      ufOrigem: "MA", ufDestino: "SP",
      crt: 3, tipoCliente: "cnpj_contribuinte", valor: 1000,
    });
    expect(result.temDifal).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// 2. PIS/COFINS ENGINE
// ═══════════════════════════════════════════════

describe("PIS/COFINS Engine", () => {
  it("Simples Nacional → CST 49, valores zerados", () => {
    const config = getPisCofinsConfig({ ncm: "61091000", crt: 1, valor: 100 });
    expect(config.cstPis).toBe("49");
    expect(config.vPis).toBe(0);
    expect(config.vCofins).toBe(0);
    expect(config.mode).toBe("isento");
  });

  it("monofásico (refrigerante) → CST 04, alíquota zero", () => {
    const config = getPisCofinsConfig({ ncm: "22021010", crt: 3, valor: 100 });
    expect(config.mode).toBe("monofasico");
    expect(config.cstPis).toBe("04");
    expect(config.vPis).toBe(0);
  });

  it("tributação normal Regime Normal (não-cumulativo por padrão)", () => {
    // CRT 3 sozinho não distingue Lucro Presumido (cumulativo, 0,65%) de
    // Lucro Real (não-cumulativo, 1,65%). Engine assume não-cumulativo até
    // recebermos o campo `regime` explícito na entrada.
    const config = getPisCofinsConfig({ ncm: "61091000", crt: 3, valor: 100 });
    expect(config.mode).toBe("normal");
    expect(config.cstPis).toBe("01");
    expect(config.aliqPis).toBe(1.65);
    expect(config.vPis).toBe(1.65);
  });

  it("validação: SN com CST 01 deve dar erro", () => {
    const config = { ...getPisCofinsConfig({ ncm: "61091000", crt: 1, valor: 100 }), cstPis: "01" };
    const errors = validatePisCofins(config, 1);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("alíquota zero cesta básica", () => {
    const config = getPisCofinsConfig({ ncm: "02012000", crt: 3, valor: 50 });
    expect(config.mode).toBe("aliquota_zero");
    expect(config.cstPis).toBe("06");
  });
});

// ═══════════════════════════════════════════════
// 3. ICMS ENGINE
// ═══════════════════════════════════════════════

describe("ICMS Engine", () => {
  it("Simples Nacional sem destaque", () => {
    const result = calculateIcms({
      valor: 100, crt: 1, ufOrigem: "MA", ufDestino: "MA",
      temST: false, tipoCliente: "cpf",
    });
    expect(result.vICMS).toBe(0);
    expect(result.cstOuCsosn).toBe("102");
  });

  it("Regime Normal com ICMS", () => {
    const result = calculateIcms({
      valor: 100, crt: 3, ufOrigem: "MA", ufDestino: "MA",
      temST: false, tipoCliente: "cpf",
    });
    expect(result.vICMS).toBe(22); // MA = 22%
    expect(result.pICMS).toBe(22);
  });

  it("ST com MVA", () => {
    const result = calculateIcms({
      valor: 100, crt: 3, ufOrigem: "MA", ufDestino: "MA",
      temST: true, mva: 40, aliqInternaDest: 22,
      tipoCliente: "cpf",
    });
    expect(result.vBCST).toBe(140);
    expect(result.vICMSST).toBeGreaterThan(0);
  });

  it("DIFAL interestadual CPF", () => {
    const result = calculateIcms({
      valor: 1000, crt: 3, ufOrigem: "SP", ufDestino: "MA",
      temST: false, tipoCliente: "cpf",
    });
    expect(result.temDifal).toBe(true);
    expect(result.vICMSUFDest).toBeGreaterThan(0);
    // SP→MA: inter=7%, interna MA=22%, diff=15%
    expect(result.pICMSInter).toBe(7);
    expect(result.pICMSUFDest).toBe(22);
  });

  it("sem DIFAL para contribuinte", () => {
    const result = calculateIcms({
      valor: 1000, crt: 3, ufOrigem: "SP", ufDestino: "MA",
      temST: false, tipoCliente: "cnpj_contribuinte",
    });
    expect(result.temDifal).toBe(false);
  });

  it("redução de base de cálculo", () => {
    const result = calculateIcms({
      valor: 100, crt: 3, ufOrigem: "MA", ufDestino: "MA",
      temST: false, tipoCliente: "cpf", reducaoBase: 50,
    });
    expect(result.vBC).toBe(50);
    expect(result.reducaoAplicada).toBe(true);
    expect(result.cstOuCsosn).toBe("20");
  });
});

// ═══════════════════════════════════════════════
// 4. ST ENGINE (hardcoded)
// ═══════════════════════════════════════════════

describe("ST Engine", () => {
  it("cerveja MA tem ST", () => {
    const config = getSTConfig("22030000", "MA");
    expect(config.temST).toBe(true);
    expect(config.mva).toBe(70);
    expect(config.aliquotaInterna).toBe(22);
  });

  it("produto sem ST", () => {
    const config = getSTConfig("61091000", "MA");
    expect(config.temST).toBe(false);
  });

  it("cálculo ST correto", () => {
    const result = calculateST(100, 22, 70, 22);
    expect(result.vBCST).toBe(170);
    expect(result.vICMSST).toBeGreaterThanOrEqual(0);
    expect(result.csosn).toBe("202");
  });

  it("ST já retido → valores zerados", () => {
    const result = calculateST(100, 22, 70, 22, undefined, true);
    expect(result.vBCST).toBe(0);
    expect(result.vICMSST).toBe(0);
    expect(result.csosn).toBe("500");
  });
});

// ═══════════════════════════════════════════════
// 5. VALIDADOR DE DOCUMENTO
// ═══════════════════════════════════════════════

describe("Validador de Documento Fiscal", () => {
  it("documento válido passa", () => {
    const result = validateFiscalDocument({
      crt: 1, modelo: 65, ufEmitente: "MA",
      items: [{
        name: "Camiseta", ncm: "61091000", cfop: "5102",
        csosn: "102", origem: 0, valor: 50, quantidade: 1,
      }],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("NCM inválido bloqueia", () => {
    const result = validateFiscalDocument({
      crt: 1, modelo: 65, ufEmitente: "MA",
      items: [{
        name: "Produto", ncm: "00000000", cfop: "5102",
        csosn: "102", origem: 0, valor: 50, quantidade: 1,
      }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "NCM_INVALID")).toBe(true);
  });

  it("CFOP interestadual em NFC-e bloqueia", () => {
    const result = validateFiscalDocument({
      crt: 3, modelo: 65, ufEmitente: "MA",
      items: [{
        name: "Produto", ncm: "61091000", cfop: "6102",
        cst: "00", origem: 0, valor: 50, quantidade: 1,
      }],
    });
    expect(result.errors.some(e => e.code === "CFOP_NFCE_INTER")).toBe(true);
  });

  it("ST obrigatória sem CSOSN de ST bloqueia", () => {
    const result = validateFiscalDocument({
      crt: 1, modelo: 65, ufEmitente: "MA",
      items: [{
        name: "Cerveja", ncm: "22030000", cfop: "5405",
        csosn: "102", origem: 0, valor: 10, quantidade: 1,
        temST: true,
      }],
    });
    expect(result.errors.some(e => e.code === "ST_CSOSN_MISMATCH")).toBe(true);
  });

  it("PIS CST inválido para SN bloqueia", () => {
    const result = validateFiscalDocument({
      crt: 1, modelo: 65, ufEmitente: "MA",
      items: [{
        name: "Produto", ncm: "61091000", cfop: "5102",
        csosn: "102", origem: 0, valor: 50, quantidade: 1,
        pisCst: "01", vPis: 0.65,
      }],
    });
    expect(result.errors.some(e => e.code === "PIS_CST_SIMPLES")).toBe(true);
  });

  it("CEST obrigatório ausente gera warning em AUTO", () => {
    const result = validateFiscalDocument({
      crt: 1, modelo: 65, ufEmitente: "MA",
      fiscalMode: "AUTO",
      items: [{
        name: "Refrigerante", ncm: "22021010", cfop: "5405",
        csosn: "202", origem: 0, valor: 5, quantidade: 10,
        temST: true, exigeCEST: true,
      }],
    });
    expect(result.warnings.some(w => w.code === "CEST_MISSING")).toBe(true);
  });

  it("CEST obrigatório ausente gera ERROR em STRICT", () => {
    const result = validateFiscalDocument({
      crt: 1, modelo: 65, ufEmitente: "MA",
      fiscalMode: "STRICT",
      items: [{
        name: "Refrigerante", ncm: "22021010", cfop: "5405",
        csosn: "202", origem: 0, valor: 5, quantidade: 10,
        temST: true, exigeCEST: true,
      }],
    });
    expect(result.errors.some(e => e.code === "CEST_MISSING")).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 6. PIPELINE COMPLETA
// ═══════════════════════════════════════════════

describe("Fiscal Pipeline", () => {
  it("venda interna Simples — pipeline completa", () => {
    const result = runFiscalPipeline(
      [{ name: "Camiseta", ncm: "61091000", cfop: "5102", valor: 50, quantidade: 2, origem: 0 }],
      { crt: 1, modelo: 65, ufEmitente: "MA", tipoCliente: "cpf" },
    );
    expect(result.valid).toBe(true);
    expect(result.items[0].pisCofins.cstPis).toBe("49");
    expect(result.items[0].icms.vICMS).toBe(0);
    expect(result.totals.vProd).toBe(100);
  });

  it("venda interestadual com DIFAL — pipeline", () => {
    const result = runFiscalPipeline(
      [{ name: "Notebook", ncm: "84713012", cfop: "5102", valor: 3000, quantidade: 1, origem: 0 }],
      { crt: 3, modelo: 55, ufEmitente: "SP", ufDestinatario: "MA", tipoCliente: "cpf" },
    );
    expect(result.items[0].icms.temDifal).toBe(true);
    expect(result.items[0].xmlData.vICMSUFDest).toBeGreaterThan(0);
    expect(result.items[0].xmlData.cfop).toMatch(/^6/);
  });

  it("produto com ST na pipeline", () => {
    const result = runFiscalPipeline(
      [{ name: "Cerveja", ncm: "22030000", cfop: "5102", valor: 10, quantidade: 5, origem: 0 }],
      { crt: 1, modelo: 65, ufEmitente: "MA", tipoCliente: "cpf" },
    );
    expect(result.items[0].classification.temST).toBe(true);
    expect(result.auditLog.stCount).toBe(1);
  });

  it("PIS monofásico na pipeline", () => {
    const result = runFiscalPipeline(
      [{ name: "Gasolina", ncm: "27101259", valor: 500, quantidade: 1, origem: 0 }],
      { crt: 3, modelo: 55, ufEmitente: "SP", ufDestinatario: "SP", tipoCliente: "cpf" },
    );
    expect(result.items[0].pisCofins.mode).toBe("monofasico");
    expect(result.items[0].xmlData.vPis).toBe(0);
    expect(result.auditLog.monoCount).toBe(1);
  });

  it("audit log gerado corretamente", () => {
    const result = runFiscalPipeline(
      [{ name: "Prod1", ncm: "61091000", valor: 100, quantidade: 1, origem: 0 }],
      { crt: 1, modelo: 65, ufEmitente: "MA", tipoCliente: "cpf" },
    );
    expect(result.auditLog.crt).toBe(1);
    expect(result.auditLog.itemCount).toBe(1);
    expect(result.auditLog.timestamp).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════
// 7. CACHE DE REGRAS
// ═══════════════════════════════════════════════

describe("Fiscal Rules Cache", () => {
  it("set e get funcionam", () => {
    const cache = new FiscalRulesCache<string>({ ttlMs: 60000 });
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("TTL expira entradas", () => {
    const cache = new FiscalRulesCache<string>({ ttlMs: 1 });
    cache.set("key1", "value1");
    // Wait 2ms
    const start = Date.now();
    while (Date.now() - start < 5) {}
    expect(cache.get("key1")).toBeNull();
  });

  it("invalidate remove entrada", () => {
    const cache = new FiscalRulesCache<string>();
    cache.set("k", "v");
    cache.invalidate("k");
    expect(cache.get("k")).toBeNull();
  });

  it("invalidateByPrefix remove grupo", () => {
    const cache = new FiscalRulesCache<string>();
    cache.set("st:22030000:MA", "v1");
    cache.set("st:22030000:SP", "v2");
    cache.set("pis:22030000", "v3");
    cache.invalidateByPrefix("st:");
    expect(cache.get("st:22030000:MA")).toBeNull();
    expect(cache.get("pis:22030000")).toBe("v3");
  });

  it("max entries com eviction", () => {
    const cache = new FiscalRulesCache<number>({ maxEntries: 3 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4); // deve evictar "a"
    expect(cache.size).toBe(3);
  });
});
