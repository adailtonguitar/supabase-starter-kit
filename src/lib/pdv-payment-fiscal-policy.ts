import type { PaymentResult } from "@/services/types";

/**
 * PIX / débito / crédito / múltiplas (TEF) costumam ter mais latência entre o commit da venda
 * e a visibilidade de `sale_items` para leitores da fila — evita enfileirar antes do `emit` direto.
 * Dinheiro (e demais) continua usando `fiscal_queue` para rastreio/reprocesso.
 */
export function pdvPaymentsBypassFiscalQueue(payments: PaymentResult[]): boolean {
  return payments.some(
    (p) =>
      p.method === "pix" ||
      p.method === "debito" ||
      p.method === "credito" ||
      p.method === "multi",
  );
}

/** Aguarda replicação eventual após `finalize_sale_atomic` (best-effort). */
export function pdvPostSaleVisibilityDelayMs(payments: PaymentResult[]): number {
  return pdvPaymentsBypassFiscalQueue(payments) ? 1500 : 0;
}
