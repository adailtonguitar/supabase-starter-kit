/**
 * Testes do Motor Fiscal Automático
 */
import { describe, it, expect } from "vitest";
import {
  resolveFiscal,
  resolveIdDest,
  resolveIndPres,
  autoCfop,
  calculateDifal,
  isContribuinte,
  validateFiscalInputs,
  buildIcmsUFDestXmlBlock,
  type FiscalEmitente,
  type FiscalDestinatario,
  type FiscalProduto,
  type FiscalVenda,
  type TaxRule,
} from "../../../shared/fiscal/engine";

// ─── Helpers ───
const emit = (uf = "MA", crt = 1): FiscalEmitente => ({ uf, crt });
const dest = (uf: string, doc: string, ie?: string): FiscalDestinatario => ({ uf, doc, ie });
const prod = (valor: number, cfop = "5102", ncm = "94036000"): FiscalProduto => ({ ncm, cfop, valor });
const venda = (pt = 1): FiscalVenda => ({ presenceType: pt });

describe("resolveFiscal — Cenários completos", () => {
  it("MA→MA interna presencial (Simples)", () => {
    const r = resolveFiscal(emit("MA", 1), dest("MA", "12345678901"), prod(100), venda(1));
    expect(r.cfop).toBe("5102");
    expect(r.idDest).toBe(1);
    expect(r.indPres).toBe(1);
    expect(r.isInterstate).toBe(false);
    expect(r.csosn).toBe("102");
    expect(r.cst).toBeNull();
    expect(r.icms.valor).toBe(0);
    expect(r.difal.applies).toBe(false);
  });

  it("MA→PI interestadual contribuinte (Simples)", () => {
    const r = resolveFiscal(emit("MA", 1), dest("PI", "12345678000195", "123456789"), prod(1000), venda(1));
    expect(r.cfop).toBe("6102");
    expect(r.idDest).toBe(2);
    expect(r.isInterstate).toBe(true);
    expect(r.csosn).toBe("102");
    expect(r.difal.applies).toBe(false); // contribuinte = sem DIFAL
  });

  it("MA→PI interestadual NÃO contribuinte → DIFAL", () => {
    const r = resolveFiscal(emit("MA", 1), dest("PI", "12345678901"), prod(1000), venda(2));
    expect(r.cfop).toBe("6102");
    expect(r.idDest).toBe(2);
    expect(r.indPres).toBe(2); // internet
    expect(r.difal.applies).toBe(true);
    expect(r.difal.vBCUFDest).toBe(1000);
    expect(r.difal.pICMSInter).toBe(12); // MA→PI = 12%
    expect(r.difal.pICMSUFDest).toBe(21); // PI interna
    expect(r.difal.vICMSUFDest).toBe(90); // (21-12)/100 * 1000 = 90
    expect(r.difal.vFCPUFDest).toBe(0); // PI sem FCP
    expect(r.difal.vICMSUFRemet).toBe(0); // 100% destino desde 2019
  });

  it("SP→MA interestadual NÃO contribuinte → DIFAL com 7%", () => {
    const rule: TaxRule = {
      uf_origem: "SP", uf_destino: "MA",
      aliq_interestadual: 7, aliq_interna_destino: 22, fcp_percent: 2,
    };
    const r = resolveFiscal(emit("SP", 3), dest("MA", "12345678901"), prod(500), venda(1), rule);
    expect(r.cfop).toBe("6102");
    expect(r.idDest).toBe(2);
    expect(r.difal.applies).toBe(true);
    expect(r.difal.pICMSInter).toBe(7);
    expect(r.difal.pICMSUFDest).toBe(22);
    expect(r.difal.vICMSUFDest).toBe(75); // (22-7)/100 * 500
    expect(r.difal.vFCPUFDest).toBe(10); // 2% * 500
  });

  it("Regime Normal destaca ICMS", () => {
    const r = resolveFiscal(emit("SP", 3), dest("SP", "12345678000195"), prod(1000, "5102"), venda(1));
    expect(r.cst).toBe("00");
    expect(r.csosn).toBeNull();
    expect(r.icms.aliquota).toBe(18); // SP interna
    expect(r.icms.baseCalculo).toBe(1000);
    expect(r.icms.valor).toBe(180);
  });

  it("Venda online → indPres=2", () => {
    const r = resolveFiscal(emit(), dest("MA", "12345678901"), prod(100), venda(2));
    expect(r.indPres).toBe(2);
  });

  it("Venda telefone → indPres=3", () => {
    const r = resolveFiscal(emit(), dest("MA", "12345678901"), prod(100), venda(3));
    expect(r.indPres).toBe(3);
  });
});

describe("autoCfop", () => {
  it("5102 interestadual → 6102", () => expect(autoCfop("5102", true)).toBe("6102"));
  it("6102 interna → 5102", () => expect(autoCfop("6102", false)).toBe("5102"));
  it("5405 interestadual → 6405", () => expect(autoCfop("5405", true)).toBe("6405"));
  it("inválido fallback → 5102", () => expect(autoCfop("xxx", false)).toBe("5102"));
});

describe("isContribuinte", () => {
  it("CPF = não contribuinte", () => expect(isContribuinte(dest("MA", "12345678901"))).toBe(false));
  it("CNPJ sem IE = não contribuinte", () => expect(isContribuinte(dest("MA", "12345678000195"))).toBe(false));
  it("CNPJ com IE = contribuinte", () => expect(isContribuinte(dest("MA", "12345678000195", "123456789"))).toBe(true));
  it("override explícito", () => expect(isContribuinte({ uf: "MA", doc: "12345678901", isContribuinte: true })).toBe(true));
});

describe("calculateDifal", () => {
  it("mesma UF = sem DIFAL", () => {
    expect(calculateDifal(1000, "MA", "MA").applies).toBe(false);
  });

  it("UF vazia = sem DIFAL", () => {
    expect(calculateDifal(1000, "MA", "").applies).toBe(false);
  });

  it("MA→PI padrão", () => {
    const d = calculateDifal(1000, "MA", "PI");
    expect(d.applies).toBe(true);
    expect(d.pICMSInter).toBe(12);
    expect(d.pICMSUFDest).toBe(21);
    expect(d.vICMSUFDest).toBe(90);
    expect(d.vFCPUFDest).toBe(0);
  });

  it("com tax_rule customizada", () => {
    const rule: TaxRule = {
      uf_origem: "SP", uf_destino: "MA",
      aliq_interestadual: 7, aliq_interna_destino: 22, fcp_percent: 2,
    };
    const d = calculateDifal(1000, "SP", "MA", rule);
    expect(d.pICMSInter).toBe(7);
    expect(d.vICMSUFDest).toBe(150); // (22-7)/100 * 1000
    expect(d.vFCPUFDest).toBe(20);
  });

  it("ignora tax_rule antiga de FCP para PI", () => {
    const staleRule: TaxRule = {
      uf_origem: "MA", uf_destino: "PI",
      aliq_interestadual: 12, aliq_interna_destino: 21, fcp_percent: 2,
    };
    const d = calculateDifal(1000, "MA", "PI", staleRule);
    expect(d.pFCPUFDest).toBe(0);
    expect(d.vFCPUFDest).toBe(0);
  });
});

describe("validateFiscalInputs", () => {
  it("tudo OK = sem erros", () => {
    const errs = validateFiscalInputs(emit(), dest("MA", "12345678901"), prod(100), venda(1));
    expect(errs).toHaveLength(0);
  });

  it("NCM vazio = erro", () => {
    const errs = validateFiscalInputs(emit(), dest("MA", "12345678901"), { ...prod(100), ncm: "" }, venda(1));
    expect(errs.some(e => e.field === "produto.ncm")).toBe(true);
  });

  it("UF destino vazia = erro", () => {
    const errs = validateFiscalInputs(emit(), dest("", "12345678901"), prod(100), venda(1));
    expect(errs.some(e => e.field === "destinatario.uf")).toBe(true);
  });

  it("presenceType inválido = erro", () => {
    const errs = validateFiscalInputs(emit(), null, prod(100), venda(0));
    expect(errs.some(e => e.field === "venda.presenceType")).toBe(true);
  });
});

describe("buildIcmsUFDestXmlBlock", () => {
  it("sem DIFAL = null", () => {
    const block = buildIcmsUFDestXmlBlock({ applies: false, vBCUFDest: 0, pFCPUFDest: 0, pICMSUFDest: 0, pICMSInter: 0, pICMSInterPart: 100, vFCPUFDest: 0, vICMSUFDest: 0, vICMSUFRemet: 0 });
    expect(block).toBeNull();
  });

  it("com DIFAL = bloco completo", () => {
    const d = calculateDifal(1000, "MA", "PI");
    const block = buildIcmsUFDestXmlBlock(d);
    expect(block).not.toBeNull();
    expect(block!.vBCUFDest).toBe(1000);
    expect(block!.vICMSUFDest).toBe(90);
  });
});
