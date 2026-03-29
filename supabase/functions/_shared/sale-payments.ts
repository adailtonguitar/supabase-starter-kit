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

/**
 * Garante código SEFAZ `tPag` com 2 dígitos ("01"…"99").
 * Aceita número, string numérica ou nome do método PDV ("pix", "debito", …).
 */
export function normalizePaymentTPag(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.trunc(raw);
    if (n >= 0 && n <= 99) return String(n).padStart(2, "0");
  }
  const s = String(raw ?? "").trim();
  if (/^\d{1,2}$/.test(s)) return s.padStart(2, "0");
  return mapPdvMethodToTPag(s.toLowerCase());
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
  if (row.pix_tx_id != null && String(row.pix_tx_id).trim()) return "pix";
  if (row.pixTxId != null && String(row.pixTxId).trim()) return "pix";
  const m = row.method ?? row.payment_method;
  if (typeof m === "string" && m.trim()) return m.trim().toLowerCase();
  if (typeof m === "number" && Number.isFinite(m)) return String(m);
  return "";
}

/**
 * Primeiro valor não vazio para normalizar tPag (evita `method: ""` bloquear `tPag` no payload).
 */
export function resolveRawPaymentForTpag(row: Record<string, unknown> | undefined): string {
  if (!row) return "";
  if (row.pix_tx_id != null && String(row.pix_tx_id).trim()) return "pix";
  if (row.pixTxId != null && String(row.pixTxId).trim()) return "pix";
  const tryOne = (v: unknown): string => {
    if (v == null) return "";
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "string") return v.trim();
    return "";
  };
  const a = tryOne(row.method);
  if (a) return a;
  const b = tryOne(row.payment_method);
  if (b) return b;
  const c = tryOne(row.tPag ?? row.tp);
  return c;
}

/** tPag NFC-e (2 dígitos) com regras anti-391: PIX nunca fica 03/04; PIX implícito via pix_tx_id. */
export function rowToTPagForNfce(row: Record<string, unknown> | undefined): string {
  const raw = resolveRawPaymentForTpag(row) || "99";
  let tp = normalizePaymentTPag(raw);
  const sm = String(row?.method ?? row?.payment_method ?? "").trim().toLowerCase();
  if (sm === "pix" && (tp === "03" || tp === "04")) tp = "17";
  const hasPixId =
    (row?.pix_tx_id != null && String(row.pix_tx_id).trim() !== "") ||
    (row?.pixTxId != null && String(row.pixTxId).trim() !== "");
  if ((tp === "03" || tp === "04") && hasPixId) tp = "17";
  return tp;
}

export function getPaymentChange(row: Record<string, unknown> | undefined): number {
  if (!row) return 0;
  const c = row.change_amount ?? row.changeAmount;
  const n = Number(c);
  return Number.isFinite(n) ? n : 0;
}
