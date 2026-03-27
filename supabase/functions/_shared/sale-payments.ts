/**
 * Normaliza `sales.payments` (jsonb) e mapeia formas do PDV → tPag NFC-e.
 * Sem isso, string JSON ou objeto indexado virava "array vazio" → tPag 99 e rejeição SEFAZ.
 */

const PDV_METHOD_TO_TPAG: Record<string, string> = {
  dinheiro: "01",
  credito: "03",
  debito: "04",
  pix: "17",
  voucher: "05",
  outros: "99",
  prazo: "99",
  multi: "99",
};

export function mapPdvMethodToTPag(method: string | undefined | null): string {
  const m = String(method ?? "").trim().toLowerCase();
  if (!m) return "99";
  return PDV_METHOD_TO_TPAG[m] ?? "99";
}

/** Aceita array, string JSON, ou objeto { "0": {...}, "1": {...} }. */
export function parseSalePaymentsJson(raw: unknown): Array<Record<string, unknown>> {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p as Array<Record<string, unknown>>;
    } catch {
      return [];
    }
    return [];
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const keys = Object.keys(o).sort((a, b) => Number(a) - Number(b));
    if (keys.length && keys.every((k) => /^\d+$/.test(k))) {
      return keys.map((k) => o[k]).filter((v) => v && typeof v === "object") as Array<Record<string, unknown>>;
    }
  }
  return [];
}

export function getPrimaryPaymentMethod(row: Record<string, unknown> | undefined): string {
  if (!row) return "";
  const m = row.method ?? row.payment_method;
  return typeof m === "string" ? m.trim().toLowerCase() : "";
}

export function getPaymentChange(row: Record<string, unknown> | undefined): number {
  if (!row) return 0;
  const c = row.change_amount ?? row.changeAmount;
  const n = Number(c);
  return Number.isFinite(n) ? n : 0;
}
