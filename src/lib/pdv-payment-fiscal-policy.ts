import type { PaymentResult } from "@/services/types";

/**
 * PIX / débito / crédito / múltiplas (TEF) costumam ter mais latência entre o commit da venda
 * e a visibilidade de `sale_items` para leitores da fila — evita enfileirar antes do `emit` direto.
 * Dinheiro (e demais) continua usando `fiscal_queue` para rastreio/reprocesso.
 */
export function pdvPaymentsBypassFiscalQueue(_payments: PaymentResult[]): boolean {
  return false;
}

/** Aguarda replicação eventual após `finalize_sale_atomic` (best-effort). */
export function pdvPostSaleVisibilityDelayMs(payments: PaymentResult[]): number {
  return 2000;
}
