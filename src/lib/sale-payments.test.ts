import { describe, expect, it } from "vitest";
import {
  assertValidPaymentForNfce,
  classifyAndNormalizePayment,
  normalizePaymentsForNfce,
  normalizePaymentsFromSaleData,
  validateDetPagForEmission,
} from "../../supabase/functions/_shared/sale-payments";

describe("classifyAndNormalizePayment", () => {
  it("normalizes pix deterministically with provider-compatible detPag", () => {
    const result = classifyAndNormalizePayment(
      { method: "pix", amount: 7, pix_tx_id: "PIX-123" },
      { fallbackAmount: 7 },
    );

    expect(result.kind).toBe("pix");
    expect(result.tPag).toBe("17");
    expect(result.sefazDetPag).toEqual({
      tPag: "17",
      vPag: 7,
      card: { tpIntegra: 2 },
    });
    expect(() => assertValidPaymentForNfce(result)).not.toThrow();
  });

  it("normalizes credit card with required card fields", () => {
    const result = classifyAndNormalizePayment(
      {
        method: "credito",
        amount: 10,
        cnpj_credenciadora: "12345678000199",
        tBand: "01",
        cAut: "ABC123",
      },
      { fallbackAmount: 10 },
    );

    expect(result.kind).toBe("credito");
    expect(result.tPag).toBe("03");
    expect(result.sefazDetPag).toEqual({
      tPag: "03",
      vPag: 10,
      card: {
        tpIntegra: 2,
        CNPJ: "12345678000199",
        tBand: "01",
        cAut: "ABC123",
      },
    });
    expect(() => assertValidPaymentForNfce(result)).not.toThrow();
  });

  it("rejects mixed pix and card evidence before emit", () => {
    const result = classifyAndNormalizePayment(
      {
        method: "pix",
        amount: 5,
        pix_tx_id: "PIX-999",
        auth_code: "AUTH-1",
      },
      { fallbackAmount: 5 },
    );

    expect(() => assertValidPaymentForNfce(result)).toThrow(/Pagamento PIX inválido/);
  });

  it("rejects pix with nsu", () => {
    const result = classifyAndNormalizePayment(
      {
        method: "pix",
        amount: 5,
        pix_tx_id: "PIX-999",
        nsu: "12345",
      },
      { fallbackAmount: 5 },
    );

    expect(() => assertValidPaymentForNfce(result)).toThrow(/Pagamento PIX inválido/);
  });

  it("normalizes debit card with required card fields", () => {
    const result = classifyAndNormalizePayment(
      {
        payment_method: "debito",
        amount: 10,
        cnpj_credenciadora: "12345678000199",
        tBand: "02",
        cAut: "DEBIT-1",
      },
      { fallbackAmount: 10 },
    );

    expect(result.kind).toBe("debito");
    expect(result.tPag).toBe("04");
    expect(() => assertValidPaymentForNfce(result)).not.toThrow();
  });

  it("rejects credit without card data", () => {
    const result = classifyAndNormalizePayment(
      {
        method: "credito",
        amount: 10,
      },
      { fallbackAmount: 10 },
    );

    expect(() => assertValidPaymentForNfce(result)).toThrow(/cartão inválido/);
  });

  it("normalizes multiple payments deterministically", () => {
    const result = normalizePaymentsForNfce(
      [
        { method: "pix", amount: 5, pix_tx_id: "PIX-1" },
        { method: "dinheiro", amount: 3, change_amount: 0 },
      ],
      { fallbackAmount: 8 },
    );

    expect(result).toHaveLength(2);
    expect(result[0].tPag).toBe("17");
    expect(result[1].tPag).toBe("01");
    expect(() => validateDetPagForEmission(result)).not.toThrow();
  });

  it("keeps troco separate from pix amount", () => {
    const result = classifyAndNormalizePayment(
      { method: "pix", amount: 7, change_amount: 2, pix_tx_id: "PIX-7" },
      { fallbackAmount: 7, fallbackChange: 2 },
    );

    expect(result.change).toBe(2);
    expect(result.sefazDetPag).toEqual({
      tPag: "17",
      vPag: 7,
      card: { tpIntegra: 2 },
    });
  });

  it("prioritizes pix_tx_id over inconsistent payment_method", () => {
    const result = classifyAndNormalizePayment(
      { payment_method: "credito", amount: 7, pix_tx_id: "PIX-override" },
      { fallbackAmount: 7 },
    );

    expect(result.kind).toBe("pix");
    expect(result.tPag).toBe("17");
  });

  it("normalizes payload read from database", () => {
    const result = normalizePaymentsFromSaleData({
      paymentsRaw: JSON.stringify([{ method: "pix", amount: 9, pix_tx_id: "PIX-db" }]),
      fallbackMethod: "credito",
      fallbackAmount: 9,
    });

    expect(result[0].kind).toBe("pix");
    expect(result[0].tPag).toBe("17");
  });

  it("is deterministic when reprocessing the same sale", () => {
    const params = {
      paymentsRaw: [{ method: "pix", amount: 9, pix_tx_id: "PIX-repeat" }],
      fallbackMethod: "pix",
      fallbackAmount: 9,
    };

    const first = normalizePaymentsFromSaleData(params);
    const second = normalizePaymentsFromSaleData(params);

    expect(first).toEqual(second);
  });

  it("supports legacy payment payload with indexed object", () => {
    const result = normalizePaymentsFromSaleData({
      paymentsRaw: {
        0: { payment_method: "dinheiro", amount: 4 },
        1: { payment_method: "pix", amount: 6, pix_tx_id: "PIX-legacy" },
      },
      fallbackAmount: 10,
    });

    expect(result).toHaveLength(2);
    expect(result[0].tPag).toBe("01");
    expect(result[1].tPag).toBe("17");
  });
});
