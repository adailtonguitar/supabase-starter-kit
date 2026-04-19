import { describe, it, expect, beforeEach } from "vitest";
import {
  decideAutoApplyCfop,
  autoApplyCfop,
} from "../../../../shared/fiscal/cfop/auto-apply-cfop";
import {
  setAutoCfopEnabled,
} from "../../../../shared/fiscal/cfop/cfop-feature-flag";
import {
  appendLog,
  clearLog,
  getAcceptanceMetrics,
} from "../../../../shared/fiscal/cfop/cfop-suggestion-log";

const COMPANY = "company-test-1";
const USER = "user-1";

// Polyfill localStorage para ambiente node/vitest
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}
// @ts-expect-error injeta global
globalThis.window = globalThis.window || {};
// @ts-expect-error
globalThis.localStorage = new MemStorage();

function seedTrust(company: string, total = 40, accepted = 40) {
  clearLog(company);
  for (let i = 0; i < accepted; i++) {
    appendLog({
      company_id: company, user_id: USER, product_id: `p-ok-${i}`,
      cfop_sugerido: "5102", cfop_original: null,
      foi_aplicado: true, usuario_alterou_depois: false,
    });
  }
  for (let i = accepted; i < total; i++) {
    appendLog({
      company_id: company, user_id: USER, product_id: `p-bad-${i}`,
      cfop_sugerido: "5102", cfop_original: null,
      foi_aplicado: true, usuario_alterou_depois: true,
    });
  }
}

describe("auto-apply-cfop", () => {
  beforeEach(() => {
    clearLog(COMPANY);
    setAutoCfopEnabled(COMPANY, false);
  });

  it("flag OFF → nunca aplica (comportamento atual)", () => {
    seedTrust(COMPANY);
    const r = decideAutoApplyCfop({
      companyId: COMPANY, userId: USER, productId: "p1",
      currentCfop: "", produto: {},
    });
    expect(r.decision).toBe("kept_disabled");
    expect(r.changed).toBe(false);
    expect(r.cfop).toBe("5102"); // ainda devolve sugestão para uso opcional
  });

  it("flag ON + sem confiança → não aplica", () => {
    setAutoCfopEnabled(COMPANY, true);
    const r = decideAutoApplyCfop({
      companyId: COMPANY, userId: USER, productId: "p1",
      currentCfop: "", produto: {},
    });
    expect(r.decision).toBe("kept_low_confidence");
    expect(r.changed).toBe(false);
  });

  it("flag ON + confiança OK + CFOP vazio → aplica", () => {
    setAutoCfopEnabled(COMPANY, true);
    seedTrust(COMPANY, 40, 40);
    const r = decideAutoApplyCfop({
      companyId: COMPANY, userId: USER, productId: "p1",
      currentCfop: null, produto: { tipo_item: "revenda" },
    });
    expect(r.decision).toBe("applied_empty");
    expect(r.cfop).toBe("5102");
    expect(r.changed).toBe(true);
  });

  it("flag ON + confiança OK + CFOP=5101 legado em revenda → corrige para 5102", () => {
    setAutoCfopEnabled(COMPANY, true);
    seedTrust(COMPANY, 40, 40);
    const r = decideAutoApplyCfop({
      companyId: COMPANY, userId: USER, productId: "p1",
      currentCfop: "5101", produto: { tipo_item: "revenda" },
    });
    expect(r.decision).toBe("applied_legacy_fix");
    expect(r.cfop).toBe("5102");
    expect(r.changed).toBe(true);
  });

  it("CFOP já correto → mantém", () => {
    setAutoCfopEnabled(COMPANY, true);
    seedTrust(COMPANY, 40, 40);
    const r = decideAutoApplyCfop({
      companyId: COMPANY, userId: USER, productId: "p1",
      currentCfop: "5102", produto: { tipo_item: "revenda" },
    });
    expect(r.decision).toBe("kept_correct");
    expect(r.changed).toBe(false);
  });

  it("CFOP manual diferente (não-legado) → respeita", () => {
    setAutoCfopEnabled(COMPANY, true);
    seedTrust(COMPANY, 40, 40);
    const r = decideAutoApplyCfop({
      companyId: COMPANY, userId: USER, productId: "p1",
      currentCfop: "5103", produto: { tipo_item: "revenda" },
    });
    expect(r.decision).toBe("kept_manual");
    expect(r.cfop).toBe("5103");
  });

  it("Safety: ST (5405) → NUNCA auto-aplica", () => {
    setAutoCfopEnabled(COMPANY, true);
    seedTrust(COMPANY, 40, 40);
    const r = decideAutoApplyCfop({
      companyId: COMPANY, userId: USER, productId: "p1",
      currentCfop: "5405", produto: { tipo_item: "revenda" },
    });
    expect(r.decision).toBe("kept_unsafe_st");
    expect(r.changed).toBe(false);
  });

  it("Safety: interestadual (6xxx) → NUNCA auto-aplica", () => {
    setAutoCfopEnabled(COMPANY, true);
    seedTrust(COMPANY, 40, 40);
    const r = decideAutoApplyCfop({
      companyId: COMPANY, userId: USER, productId: "p1",
      currentCfop: "6102", produto: { tipo_item: "revenda" },
    });
    expect(r.decision).toBe("kept_unsafe_interstate");
    expect(r.changed).toBe(false);
  });

  it("autoApplyCfop persiste log e métricas refletem", () => {
    setAutoCfopEnabled(COMPANY, true);
    seedTrust(COMPANY, 40, 40);
    autoApplyCfop({
      companyId: COMPANY, userId: USER, productId: "p-new",
      currentCfop: "", produto: { tipo_item: "revenda" },
    });
    const m = getAcceptanceMetrics(COMPANY);
    expect(m.total).toBe(41);
    expect(m.applied).toBe(41);
  });
});
