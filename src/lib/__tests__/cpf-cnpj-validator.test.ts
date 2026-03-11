import { describe, it, expect } from "vitest";
import { validateDoc, isValidCnpj } from "../cpf-cnpj-validator";

describe("CPF Validator", () => {
  it("validates a correct CPF", () => {
    expect(validateDoc("529.982.247-25").valid).toBe(true);
    expect(validateDoc("52998224725").valid).toBe(true);
  });

  it("rejects all-same-digit CPFs", () => {
    expect(validateDoc("111.111.111-11").valid).toBe(false);
    expect(validateDoc("000.000.000-00").valid).toBe(false);
  });

  it("rejects CPF with wrong check digits", () => {
    expect(validateDoc("529.982.247-00").valid).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(validateDoc("1234567").valid).toBe(false);
    expect(validateDoc("").valid).toBe(false);
  });
});

describe("CNPJ Validator", () => {
  it("validates a correct CNPJ", () => {
    expect(validateDoc("11.222.333/0001-81").valid).toBe(true);
    expect(validateDoc("11222333000181").valid).toBe(true);
  });

  it("rejects all-same-digit CNPJs", () => {
    expect(validateDoc("11.111.111/1111-11").valid).toBe(false);
  });

  it("rejects CNPJ with wrong check digits", () => {
    expect(validateDoc("11.222.333/0001-00").valid).toBe(false);
  });

  it("isValidCnpj helper works", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });
});
