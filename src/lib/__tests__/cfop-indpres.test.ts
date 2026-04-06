/**
 * Tests for CFOP interstate detection and indPres logic
 */
import { describe, it, expect } from "vitest";

// ─── CFOP auto-detection logic (mirrors backend + frontend) ───
function autoCfop(itemCfop: string, emitUF: string, destUF: string): string {
  const isInterstate = destUF.length === 2 && emitUF.toUpperCase() !== destUF.toUpperCase();
  let cfop = itemCfop;
  if (isInterstate && cfop.startsWith("5")) {
    cfop = "6" + cfop.substring(1);
  } else if (!isInterstate && cfop.startsWith("6")) {
    cfop = "5" + cfop.substring(1);
  }
  return cfop;
}

function resolveIdDest(emitUF: string, destUF: string): number {
  return destUF.length === 2 && emitUF.toUpperCase() !== destUF.toUpperCase() ? 2 : 1;
}

function resolveIndPres(rawPresence: unknown): number {
  const val = Number(rawPresence);
  return [1, 2, 3, 4, 9].includes(val) ? val : 1;
}

describe("CFOP interestadual auto-detection", () => {
  it("MA→MA = 5102 (interna)", () => {
    expect(autoCfop("5102", "MA", "MA")).toBe("5102");
  });

  it("MA→PI = 6102 (interestadual)", () => {
    expect(autoCfop("5102", "MA", "PI")).toBe("6102");
  });

  it("SP→RJ = 6102 (interestadual)", () => {
    expect(autoCfop("5102", "SP", "RJ")).toBe("6102");
  });

  it("keeps 6xxx→5xxx when same state", () => {
    expect(autoCfop("6102", "MA", "MA")).toBe("5102");
  });

  it("preserves suffix (5405→6405)", () => {
    expect(autoCfop("5405", "SP", "MG")).toBe("6405");
  });

  it("no destUF = keeps original", () => {
    expect(autoCfop("5102", "MA", "")).toBe("5102");
  });
});

describe("idDest resolution", () => {
  it("same state = 1 (interna)", () => {
    expect(resolveIdDest("MA", "MA")).toBe(1);
  });

  it("different state = 2 (interestadual)", () => {
    expect(resolveIdDest("MA", "PI")).toBe(2);
  });

  it("empty dest = 1 (default interna)", () => {
    expect(resolveIdDest("MA", "")).toBe(1);
  });
});

describe("indPres resolution", () => {
  it("presencial = 1", () => {
    expect(resolveIndPres(1)).toBe(1);
  });

  it("internet = 2", () => {
    expect(resolveIndPres(2)).toBe(2);
  });

  it("telefone = 3", () => {
    expect(resolveIndPres(3)).toBe(3);
  });

  it("outros = 9", () => {
    expect(resolveIndPres(9)).toBe(9);
  });

  it("undefined defaults to 1 (presencial)", () => {
    expect(resolveIndPres(undefined)).toBe(1);
  });

  it("0 defaults to 1 (presencial)", () => {
    expect(resolveIndPres(0)).toBe(1);
  });

  it("invalid value defaults to 1", () => {
    expect(resolveIndPres(7)).toBe(1);
  });
});
