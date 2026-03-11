import { describe, it, expect } from "vitest";
import { maskCpfCnpj } from "../cpf-cnpj-mask";

describe("maskCpfCnpj", () => {
  it("formats CPF correctly", () => {
    expect(maskCpfCnpj("52998224725")).toBe("529.982.247-25");
  });

  it("formats partial CPF", () => {
    expect(maskCpfCnpj("529")).toBe("529");
    expect(maskCpfCnpj("529982")).toBe("529.982");
  });

  it("formats CNPJ correctly", () => {
    expect(maskCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("strips non-digits before formatting", () => {
    expect(maskCpfCnpj("529.982.247-25")).toBe("529.982.247-25");
  });

  it("truncates CNPJ to 14 digits", () => {
    expect(maskCpfCnpj("112223330001811234")).toBe("11.222.333/0001-81");
  });
});
