/**
 * Testes do Motor de Decisão Fiscal
 * Cobertura: DIFAL, CFOP, coerência idDest×indPres, fail-safe
 */
import { describe, it, expect } from "vitest";
import {
  makeFiscalDecision,
  validateFiscalIntegrity,
  buildFiscalAuditEntry,
  type DecisionEmitente,
  type DecisionDestinatario,
  type DecisionProduto,
  type DecisionVenda,
} from "../../../shared/fiscal/decision-engine";

const emitenteMA: DecisionEmitente = { uf: "MA", crt: 1 };
const emitenteSP: DecisionEmitente = { uf: "SP", crt: 3 };

const produtoBase: DecisionProduto = {
  name: "Produto Teste",
  ncm: "61091000",
  cfop: "5102",
  valor: 100,
  origem: 0,
};

// ─── DIFAL ───

describe("DIFAL — Venda interestadual com CPF", () => {
  it("deve exigir DIFAL quando CPF + interestadual", () => {
    const dest: DecisionDestinatario = { uf: "SP", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 2, modelo: 55 };
    const decision = makeFiscalDecision(emitenteMA, dest, produtoBase, venda);

    expect(decision.requiresDifal).toBe(true);
    expect(decision.difal.applies).toBe(true);
    expect(decision.difal.vBCUFDest).toBe(100);
    expect(decision.difal.pICMSInter).toBe(12); // MA→SP = 12%
    expect(decision.difal.pICMSUFDest).toBe(18); // SP = 18%
    expect(decision.difal.vICMSUFDest).toBe(6); // (18-12)% * 100
    expect(decision.difal.vICMSUFRemet).toBe(0); // 100% destino desde 2019
    expect(decision.isInterstate).toBe(true);
    expect(decision.idDest).toBe(2);
  });

  it("deve calcular DIFAL com alíquota 7% (SP→MA)", () => {
    const dest: DecisionDestinatario = { uf: "MA", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 2, modelo: 55 };
    const decision = makeFiscalDecision(emitenteSP, dest, produtoBase, venda);

    expect(decision.requiresDifal).toBe(true);
    expect(decision.difal.applies).toBe(true);
    expect(decision.difal.pICMSInter).toBe(7); // SP→MA = 7%
    expect(decision.difal.pICMSUFDest).toBe(22); // MA = 22%
    expect(decision.difal.vICMSUFDest).toBe(15); // (22-7)% * 100
  });

  it("deve aplicar FCP=0 para PI (prevenir Rejeição 793)", () => {
    const dest: DecisionDestinatario = { uf: "PI", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 2, modelo: 55 };
    const decision = makeFiscalDecision(emitenteMA, dest, produtoBase, venda);

    expect(decision.difal.pFCPUFDest).toBe(0);
    expect(decision.difal.vFCPUFDest).toBe(0);
  });

  it("deve aplicar FCP para RJ", () => {
    const dest: DecisionDestinatario = { uf: "RJ", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 2, modelo: 55 };
    const decision = makeFiscalDecision(emitenteMA, dest, produtoBase, venda);

    expect(decision.difal.pFCPUFDest).toBe(2);
    expect(decision.difal.vFCPUFDest).toBe(2); // 2% * 100
  });

  it("deve usar taxRule customizada quando disponível", () => {
    const dest: DecisionDestinatario = { uf: "SP", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 2, modelo: 55 };
    const taxRule = { aliq_interestadual: 12, aliq_interna_destino: 20, fcp_percent: 1 };
    const decision = makeFiscalDecision(emitenteMA, dest, produtoBase, venda, taxRule);

    expect(decision.difal.pICMSUFDest).toBe(20);
    expect(decision.difal.pFCPUFDest).toBe(1);
    expect(decision.difal.vICMSUFDest).toBe(8); // (20-12)% * 100
    expect(decision.difal.vFCPUFDest).toBe(1); // 1% * 100
  });
});

describe("DIFAL — Venda dentro do estado", () => {
  it("não deve aplicar DIFAL em venda interna", () => {
    const dest: DecisionDestinatario = { uf: "MA", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 1, modelo: 55 };
    const decision = makeFiscalDecision(emitenteMA, dest, produtoBase, venda);

    expect(decision.requiresDifal).toBe(false);
    expect(decision.difal.applies).toBe(false);
    expect(decision.isInterstate).toBe(false);
    expect(decision.idDest).toBe(1);
  });
});

describe("DIFAL — Contribuinte ICMS", () => {
  it("não deve aplicar DIFAL para contribuinte (CNPJ com IE)", () => {
    const dest: DecisionDestinatario = {
      uf: "SP", doc: "12345678000199", ie: "123456789", indIEDest: 1,
    };
    const venda: DecisionVenda = { presenceType: 2, modelo: 55 };
    const decision = makeFiscalDecision(emitenteMA, dest, produtoBase, venda);

    expect(decision.requiresDifal).toBe(false);
    expect(decision.difal.applies).toBe(false);
  });

  it("deve aplicar DIFAL para CNPJ sem IE (não contribuinte)", () => {
    const dest: DecisionDestinatario = {
      uf: "SP", doc: "12345678000199", indIEDest: 9,
    };
    const venda: DecisionVenda = { presenceType: 2, modelo: 55 };
    const decision = makeFiscalDecision(emitenteMA, dest, produtoBase, venda);

    expect(decision.requiresDifal).toBe(true);
    expect(decision.difal.applies).toBe(true);
  });
});

// ─── Coerência idDest × indPres ───

describe("Coerência idDest × indPres", () => {
  it("deve auto-corrigir indPres=1 para 2 em operação interestadual", () => {
    const dest: DecisionDestinatario = { uf: "SP", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 1, modelo: 55 };
    const decision = makeFiscalDecision(emitenteMA, dest, produtoBase, venda);

    expect(decision.indPres).toBe(2);
    expect(decision.appliedRules.some(r => r.includes("auto-corrigido") && r.includes("1") && r.includes("2"))).toBe(true);
  });

  it("deve manter indPres=2 em operação interestadual", () => {
    const dest: DecisionDestinatario = { uf: "SP", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 2, modelo: 55 };
    const decision = makeFiscalDecision(emitenteMA, dest, produtoBase, venda);

    expect(decision.indPres).toBe(2);
  });

  it("deve manter indPres=1 em operação interna", () => {
    const dest: DecisionDestinatario = { uf: "MA", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 1, modelo: 55 };
    const decision = makeFiscalDecision(emitenteMA, dest, produtoBase, venda);

    expect(decision.indPres).toBe(1);
  });
});

// ─── CFOP automático ───

describe("CFOP automático por cenário", () => {
  it("deve converter 5102→6102 em operação interestadual", () => {
    const dest: DecisionDestinatario = { uf: "SP", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 2, modelo: 55 };
    const decision = makeFiscalDecision(emitenteMA, dest, produtoBase, venda);

    expect(decision.cfop).toBe("6102");
  });

  it("deve converter 6102→5102 em operação interna", () => {
    const dest: DecisionDestinatario = { uf: "MA", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 1, modelo: 55 };
    const prod = { ...produtoBase, cfop: "6102" };
    const decision = makeFiscalDecision(emitenteMA, dest, prod, venda);

    expect(decision.cfop).toBe("5102");
  });

  it("deve forçar CFOP 5xxx para NFC-e", () => {
    const dest: DecisionDestinatario = { uf: "SP", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 1, modelo: 65 };
    const prod = { ...produtoBase, cfop: "6102" };
    const decision = makeFiscalDecision(emitenteMA, dest, prod, venda);

    expect(decision.cfop).toBe("5102");
  });
});

// ─── Validação de integridade ───

describe("validateFiscalIntegrity", () => {
  it("deve bloquear NCM inválido", () => {
    const prod = { ...produtoBase, ncm: "00000000" };
    const venda: DecisionVenda = { presenceType: 1, modelo: 55 };
    const dest: DecisionDestinatario = { uf: "MA", doc: "12345678901", indIEDest: 9 };
    const result = validateFiscalIntegrity(emitenteMA, dest, [prod], venda);

    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === "PROD_NCM_INVALID")).toBe(true);
  });

  it("deve bloquear NF-e sem destinatário", () => {
    const venda: DecisionVenda = { presenceType: 1, modelo: 55 };
    const result = validateFiscalIntegrity(emitenteMA, null, [produtoBase], venda);

    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === "DEST_REQUIRED_NFE")).toBe(true);
  });

  it("deve retornar warning para CFOP incompatível (auto-corrigível)", () => {
    const dest: DecisionDestinatario = { uf: "SP", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 2, modelo: 55 };
    const prod = { ...produtoBase, cfop: "5102" }; // interno, mas operação é interestadual
    const result = validateFiscalIntegrity(emitenteMA, dest, [prod], venda);

    expect(result.valid).toBe(true); // warning, não erro
    expect(result.issues.some(i => i.code === "CFOP_WRONG_DIRECTION")).toBe(true);
  });

  it("deve avisar sobre DIFAL obrigatório para CPF interestadual", () => {
    const dest: DecisionDestinatario = { uf: "SP", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 2, modelo: 55 };
    const result = validateFiscalIntegrity(emitenteMA, dest, [produtoBase], venda);

    expect(result.issues.some(i => i.code === "DIFAL_REQUIRED_CPF")).toBe(true);
  });

  it("deve validar cenário válido sem erros", () => {
    const dest: DecisionDestinatario = { uf: "MA", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 1, modelo: 65 };
    const result = validateFiscalIntegrity(emitenteMA, dest, [produtoBase], venda);

    expect(result.valid).toBe(true);
    expect(result.issues.filter(i => i.severity === "error")).toHaveLength(0);
  });

  it("deve bloquear CRT inválido", () => {
    const emit = { uf: "MA", crt: 5 as any };
    const dest: DecisionDestinatario = { uf: "MA", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 1, modelo: 55 };
    const result = validateFiscalIntegrity(emit, dest, [produtoBase], venda);

    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === "EMIT_CRT_INVALID")).toBe(true);
  });
});

// ─── Audit Log ───

describe("buildFiscalAuditEntry", () => {
  it("deve gerar audit entry com DIFAL aplicado", () => {
    const dest: DecisionDestinatario = { uf: "SP", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 2, modelo: 55 };
    const decision = makeFiscalDecision(emitenteMA, dest, produtoBase, venda);

    const entry = buildFiscalAuditEntry({
      action: "emit_nfe",
      emitente: emitenteMA,
      destinatario: dest,
      modelo: 55,
      decision,
      blocked: false,
    });

    expect(entry.difalApplied).toBe(true);
    expect(entry.blocked).toBe(false);
    expect(entry.details.requiresDifal).toBe(true);
    expect(entry.details.difalValues).not.toBeNull();
  });

  it("deve registrar bloqueio", () => {
    const entry = buildFiscalAuditEntry({
      action: "emit_nfe",
      emitente: emitenteMA,
      destinatario: null,
      modelo: 55,
      blocked: true,
      blockReason: "Destinatário obrigatório",
    });

    expect(entry.blocked).toBe(true);
    expect(entry.blockReason).toBe("Destinatário obrigatório");
  });
});

// ─── Cobertura de edge cases ───

describe("Edge cases", () => {
  it("sem destinatário em NFC-e deve ser válido", () => {
    const venda: DecisionVenda = { presenceType: 1, modelo: 65 };
    const result = validateFiscalIntegrity(emitenteMA, null, [produtoBase], venda);

    expect(result.valid).toBe(true);
  });

  it("CFOP inválido deve bloquear", () => {
    const dest: DecisionDestinatario = { uf: "MA", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 1, modelo: 55 };
    const prod = { ...produtoBase, cfop: "abc" };
    const result = validateFiscalIntegrity(emitenteMA, dest, [prod], venda);

    expect(result.valid).toBe(false);
  });

  it("produto com valor zero deve bloquear", () => {
    const dest: DecisionDestinatario = { uf: "MA", doc: "12345678901", indIEDest: 9 };
    const venda: DecisionVenda = { presenceType: 1, modelo: 55 };
    const prod = { ...produtoBase, valor: 0 };
    const result = validateFiscalIntegrity(emitenteMA, dest, [prod], venda);

    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === "PROD_VALOR_ZERO")).toBe(true);
  });

  it("UF do emitente inválida deve bloquear", () => {
    const emit = { uf: "XX", crt: 1 };
    const venda: DecisionVenda = { presenceType: 1, modelo: 55 };
    const result = validateFiscalIntegrity(emit, null, [produtoBase], venda);

    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === "EMIT_UF_INVALID")).toBe(true);
  });
});
