export type Money = number & { readonly __brand: "Money" };

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function assertMoney(value: unknown, label = "valor"): asserts value is number {
  if (!isFiniteNumber(value)) throw new Error(`${label} inválido (NaN/Infinity)`);
}

export function assertNonNegativeMoney(value: unknown, label = "valor"): asserts value is number {
  assertMoney(value, label);
  if (value < 0) throw new Error(`${label} inválido (negativo)`);
}

export function roundMoney(value: number): number {
  // Avoid float accumulation; always store/display rounded cents.
  return Math.round(value * 100) / 100;
}

export function toCents(value: number): number {
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function sumMoney(values: number[]): number {
  const cents = values.reduce((acc, v) => {
    assertMoney(v);
    return acc + toCents(v);
  }, 0);
  return fromCents(cents);
}

export function ensureMoneyEquals(a: number, b: number, label = "valores", toleranceCents = 1): void {
  assertMoney(a);
  assertMoney(b);
  const diff = Math.abs(toCents(a) - toCents(b));
  if (diff > toleranceCents) {
    throw new Error(`${label} não conferem (diferença ${fromCents(diff).toFixed(2)})`);
  }
}

/**
 * Split an amount into N installments in cents.
 * Guarantees: all are non-negative integers and sum == total.
 */
export function splitInstallments(total: number, installments: number): number[] {
  assertNonNegativeMoney(total, "total");
  if (!Number.isInteger(installments) || installments <= 0) throw new Error("parcelas inválidas");

  const totalCents = toCents(total);
  const base = Math.floor(totalCents / installments);
  const remainder = totalCents - base * installments;

  const parts = Array.from({ length: installments }, (_, i) => base + (i < remainder ? 1 : 0));
  const sum = parts.reduce((s, v) => s + v, 0);
  if (sum !== totalCents) throw new Error("falha ao dividir parcelas (inconsistência interna)");
  return parts;
}

