import { describe, it, expect } from "vitest";
import { generatePixPayload } from "../pix-brcode";

describe("PIX BRCode - All Key Types", () => {
  const base = { merchantName: "Loja Teste", merchantCity: "São Paulo", amount: 25.50 };

  it("CPF key", () => {
    const payload = generatePixPayload({ ...base, pixKey: "52998224725" });
    expect(payload).toContain("52998224725");
    expect(payload).toContain("25.50");
  });

  it("CNPJ key", () => {
    const payload = generatePixPayload({ ...base, pixKey: "11222333000181" });
    expect(payload).toContain("11222333000181");
  });

  it("email key", () => {
    const payload = generatePixPayload({ ...base, pixKey: "loja@email.com" });
    expect(payload).toContain("loja@email.com");
  });

  it("phone key with +55 prefix auto-added", () => {
    const payload = generatePixPayload({ ...base, pixKey: "11999887766", pixKeyType: "phone" });
    expect(payload).toContain("+5511999887766");
  });

  it("phone key already with +55", () => {
    const payload = generatePixPayload({ ...base, pixKey: "+5511999887766", pixKeyType: "phone" });
    expect(payload).toContain("+5511999887766");
  });

  it("random/EVP key", () => {
    const evp = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const payload = generatePixPayload({ ...base, pixKey: evp });
    expect(payload).toContain(evp);
  });

  it("with description", () => {
    const payload = generatePixPayload({ ...base, pixKey: "test@test.com", description: "Pedido 123" });
    expect(payload).toContain("Pedido 123");
  });

  it("with custom txId", () => {
    const payload = generatePixPayload({ ...base, pixKey: "test@test.com", txId: "VENDA001" });
    expect(payload).toContain("VENDA001");
  });

  it("truncates merchant name to 25 chars", () => {
    const payload = generatePixPayload({
      ...base,
      pixKey: "test@test.com",
      merchantName: "Nome Muito Grande Da Empresa Que Excede o Limite",
    });
    // Name should be uppercase and max 25 chars
    expect(payload).toContain("NOME MUITO GRANDE DA EMPR");
  });

  it("normalizes accented characters", () => {
    const payload = generatePixPayload({
      ...base,
      pixKey: "test@test.com",
      merchantCity: "São José dos Campos",
    });
    expect(payload).toContain("SAO JOSE DOS CA"); // truncated to 15
  });
});
