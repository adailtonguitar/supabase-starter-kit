import { describe, it, expect } from "vitest";
import { parseSefazRejection, formatRejectionMessage } from "../sefaz-rejection-parser";

describe("SEFAZ Rejection Parser", () => {
  it("parses 'Rejeição 302' format", () => {
    const result = parseSefazRejection("Rejeição 302: Uso denegado");
    expect(result).not.toBeNull();
    expect(result!.code).toBe("302");
    expect(result!.field).toBe("customer");
  });

  it("parses '[cStat=778]' format", () => {
    const result = parseSefazRejection("Erro cStat=778 NCM inválido");
    expect(result).not.toBeNull();
    expect(result!.code).toBe("778");
    expect(result!.field).toBe("items");
  });

  it("parses '[204]' bracket format", () => {
    const result = parseSefazRejection("Erro [204] duplicidade");
    expect(result!.code).toBe("204");
  });

  it("parses '327 -' dash format", () => {
    const result = parseSefazRejection("327 - CFOP inválido");
    expect(result!.code).toBe("327");
    expect(result!.field).toBe("items");
  });

  it("extracts code from details object", () => {
    const result = parseSefazRejection("Erro genérico", { cStat: 865 });
    expect(result!.code).toBe("865");
    expect(result!.field).toBe("payment");
  });

  it("extracts from details.codigo_status", () => {
    const result = parseSefazRejection("falha", { codigo_status: 225 });
    expect(result!.code).toBe("225");
  });

  it("returns generic for unmapped codes", () => {
    const result = parseSefazRejection("Rejeição 999: desconhecido");
    expect(result!.code).toBe("999");
    expect(result!.guidance).toContain("não mapeado");
  });

  it("returns null when no code found", () => {
    expect(parseSefazRejection("erro genérico sem código")).toBeNull();
  });

  it("formatRejectionMessage includes all parts", () => {
    const msg = formatRejectionMessage({
      code: "302",
      title: "Uso denegado",
      guidance: "CPF irregular",
      field: "customer",
    });
    expect(msg).toContain("[302]");
    expect(msg).toContain("Uso denegado");
    expect(msg).toContain("CPF irregular");
  });

  // Key rejections coverage
  it.each([
    ["203", "emitente"],
    ["210", "emitente"],
    ["281", "emitente"],
    ["388", "items"],
    ["528", "items"],
    ["865", "payment"],
  ])("maps rejection %s to field %s", (code, expectedField) => {
    const result = parseSefazRejection(`Rejeição ${code}: test`);
    expect(result!.field).toBe(expectedField);
  });
});
