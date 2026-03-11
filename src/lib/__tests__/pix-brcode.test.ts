import { describe, it, expect } from "vitest";
import { generatePixPayload } from "../pix-brcode";

describe("PIX BRCode Generator", () => {
  it("generates a valid payload string", () => {
    const payload = generatePixPayload({
      pixKey: "teste@email.com",
      merchantName: "Loja Teste",
      merchantCity: "São Paulo",
      amount: 50.00,
    });
    expect(payload).toContain("br.gov.bcb.pix");
    expect(payload).toContain("teste@email.com");
    expect(payload).toContain("50.00");
    expect(payload).toContain("LOJA TESTE");
    expect(payload).toContain("SAO PAULO"); // normalized ASCII
    expect(payload.length).toBeGreaterThan(50);
  });

  it("generates payload without amount", () => {
    const payload = generatePixPayload({
      pixKey: "12345678901",
      merchantName: "Test",
      merchantCity: "RJ",
    });
    expect(payload).not.toContain("54"); // no amount field ID
    expect(payload).toContain("br.gov.bcb.pix");
  });

  it("formats phone keys with +55 prefix", () => {
    const payload = generatePixPayload({
      pixKey: "11999887766",
      pixKeyType: "phone",
      merchantName: "Test",
      merchantCity: "SP",
    });
    expect(payload).toContain("+5511999887766");
  });

  it("ends with CRC16 checksum (63 + 04 digits)", () => {
    const payload = generatePixPayload({
      pixKey: "test@test.com",
      merchantName: "Test",
      merchantCity: "SP",
    });
    // CRC field: "63" + "04" + 4 hex chars
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);
  });
});
