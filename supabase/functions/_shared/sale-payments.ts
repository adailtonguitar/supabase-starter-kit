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

function mapPdvMethodToTPag(method: string | undefined | null): string {
  const m = String(method ?? "").trim().toLowerCase();
  if (!m) return "99";
  return PDV_METHOD_TO_TPAG[m] ?? "99";
}

/**
 * Garante código SEFAZ `tPag` com 2 dígitos ("01"…"99").
 * Aceita número, string numérica ou nome do método PDV ("pix", "debito", …).
 */
function normalizePaymentTPag(raw: unknown): string {
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

function hasPixId(row: Record<string, unknown> | undefined): boolean {
  return Boolean(
    row &&
    (
      (row.pix_tx_id != null && String(row.pix_tx_id).trim() !== "") ||
      (row.pixTxId != null && String(row.pixTxId).trim() !== "")
    )
  );
}

function getCardMethod(row: Record<string, unknown> | undefined): "03" | "04" | null {
  const method = String(row?.method ?? row?.payment_method ?? "").trim().toLowerCase();
  if (method === "credito" || method === "credit") return "03";
  if (method === "debito" || method === "debit") return "04";
  const raw = String(row?.tPag ?? row?.tp ?? "").trim();
  if (raw === "03" || raw === "04") return raw;
  return null;
}

function hasCardEvidence(row: Record<string, unknown> | undefined): boolean {
  if (!row) return false;
  const nsu = String(row.nsu ?? "").trim();
  const cardObj = (row.card && typeof row.card === "object" ? row.card : {}) as Record<string, unknown>;
  const auth = String(row.auth_code ?? row.authCode ?? row.cAut ?? cardObj.cAut ?? "").trim();
  const digits = String(row.card_last_digits ?? row.cardLastDigits ?? "").trim();
  return nsu !== "" || auth !== "" || digits !== "";
}

/**
 * Primeiro valor não vazio para normalizar tPag (evita `method: ""` bloquear `tPag` no payload).
 */
export function resolveRawPaymentForTpag(row: Record<string, unknown> | undefined): string {
  if (!row) return "";
  if (hasPixId(row)) return "pix";
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
export type ClassifiedPaymentForNfce = {
  kind: "dinheiro" | "pix" | "credito" | "debito" | "voucher" | "outros" | "prazo";
  method: string;
  tPag: string;
  amount: number;
  change: number;
  sanitized: Readonly<Record<string, unknown>>;
  sefazDetPag: Readonly<Record<string, unknown>>;
};

export type NormalizePaymentContext = {
  fallbackAmount: number;
  fallbackChange?: number;
};

function normalizeMoney(value: unknown, fallback: number): number {
  const n = Number(value);
  const resolved = Number.isFinite(n) ? n : fallback;
  return Math.round(resolved * 100) / 100;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      if (child && typeof child === "object") deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function freezePaymentResult(
  result: Omit<ClassifiedPaymentForNfce, "sanitized" | "sefazDetPag"> & {
    sanitized: Record<string, unknown>;
    sefazDetPag: Record<string, unknown>;
  },
): ClassifiedPaymentForNfce {
  return {
    ...result,
    sanitized: deepFreeze(result.sanitized),
    sefazDetPag: deepFreeze(result.sefazDetPag),
  };
}

function resolvePaymentKind(row: Record<string, unknown> | undefined): ClassifiedPaymentForNfce["kind"] {
  if (!row) return "outros";
  if (hasPixId(row)) return "pix";

  const cardMethod = getCardMethod(row);
  if (cardMethod === "03") return "credito";
  if (cardMethod === "04") return "debito";

  const rawMethod = String(row.method ?? row.payment_method ?? "").trim().toLowerCase();
  if (rawMethod === "dinheiro") return "dinheiro";
  if (rawMethod === "pix") return "pix";
  if (rawMethod === "credito" || rawMethod === "credit") return "credito";
  if (rawMethod === "debito" || rawMethod === "debit") return "debito";
  if (rawMethod === "voucher") return "voucher";
  if (rawMethod === "prazo") return "prazo";

  switch (normalizePaymentTPag(row.tPag ?? row.tp ?? rawMethod)) {
    case "01": return "dinheiro";
    case "03": return "credito";
    case "04": return "debito";
    case "05": return "voucher";
    case "17": return "pix";
    default: return "outros";
  }
}

function buildPixDetPag(source: Record<string, unknown>, amount: number): Record<string, unknown> {
  const cardObj = (source.card && typeof source.card === "object" ? source.card : {}) as Record<string, unknown>;
  const tpIntegra = Number(source.tpIntegra ?? cardObj.tpIntegra ?? 2);
  return {
    tPag: "17",
    vPag: amount,
    card: {
      tpIntegra: Number.isFinite(tpIntegra) ? tpIntegra : 2,
    },
  };
}

function buildCardDetPag(tPag: "03" | "04", source: Record<string, unknown>, amount: number): Record<string, unknown> {
  const cardObj = (source.card && typeof source.card === "object" ? source.card : {}) as Record<string, unknown>;
  const tpIntegra = Number(source.tpIntegra ?? cardObj.tpIntegra ?? 2);
  return {
    tPag,
    vPag: amount,
    card: {
      tpIntegra: Number.isFinite(tpIntegra) ? tpIntegra : 2,
      CNPJ: String(source.cnpj_credenciadora ?? cardObj.CNPJ ?? "").trim(),
      tBand: String(source.tBand ?? cardObj.tBand ?? "").trim(),
      cAut: String(source.cAut ?? cardObj.cAut ?? source.auth_code ?? source.authCode ?? "").trim(),
    },
  };
}

function buildPlainDetPag(tPag: string, amount: number): Record<string, unknown> {
  return { tPag, vPag: amount };
}

export function classifyAndNormalizePayment(
  row: Record<string, unknown> | undefined,
  context: NormalizePaymentContext,
): ClassifiedPaymentForNfce {
  const source = row ? { ...row } : {};
  const amount = normalizeMoney(source.amount ?? source.value ?? source.vPag, context.fallbackAmount);
  const change = normalizeMoney(source.change_amount ?? source.changeAmount, context.fallbackChange ?? 0);
  const kind = resolvePaymentKind(source);

  if (kind === "pix") {
    const sanitized: Record<string, unknown> = {
      method: "pix",
      payment_method: "pix",
      tPag: "17",
      amount,
      value: amount,
      vPag: amount,
      change_amount: change,
      pix_tx_id: source.pix_tx_id ?? source.pixTxId,
      nsu: source.nsu,
      auth_code: source.auth_code ?? source.authCode,
      authCode: source.authCode,
      card_last_digits: source.card_last_digits ?? source.cardLastDigits,
      cardLastDigits: source.cardLastDigits,
      cnpj_credenciadora: source.cnpj_credenciadora ?? ((source.card && typeof source.card === "object" ? source.card : {}) as Record<string, unknown>).CNPJ,
      tBand: source.tBand ?? ((source.card && typeof source.card === "object" ? source.card : {}) as Record<string, unknown>).tBand,
      cAut: source.cAut ?? ((source.card && typeof source.card === "object" ? source.card : {}) as Record<string, unknown>).cAut,
      tpIntegra: source.tpIntegra ?? ((source.card && typeof source.card === "object" ? source.card : {}) as Record<string, unknown>).tpIntegra ?? 2,
      card: {
        tpIntegra: source.tpIntegra ?? ((source.card && typeof source.card === "object" ? source.card : {}) as Record<string, unknown>).tpIntegra ?? 2,
      },
    };
    return freezePaymentResult({
      kind,
      method: "pix",
      tPag: "17",
      amount,
      change,
      sanitized,
      sefazDetPag: buildPixDetPag(sanitized, amount),
    });
  }

  if (kind === "credito" || kind === "debito") {
    const tPag = kind === "credito" ? "03" : "04";
    const sanitized: Record<string, unknown> = {
      method: kind,
      payment_method: kind,
      tPag,
      amount,
      value: amount,
      vPag: amount,
      change_amount: change,
      nsu: source.nsu,
      auth_code: source.auth_code ?? source.authCode,
      authCode: source.authCode,
      card_last_digits: source.card_last_digits ?? source.cardLastDigits,
      cardLastDigits: source.cardLastDigits,
      cnpj_credenciadora: source.cnpj_credenciadora ?? ((source.card && typeof source.card === "object" ? source.card : {}) as Record<string, unknown>).CNPJ,
      tpIntegra: source.tpIntegra ?? ((source.card && typeof source.card === "object" ? source.card : {}) as Record<string, unknown>).tpIntegra ?? 2,
      tBand: source.tBand ?? ((source.card && typeof source.card === "object" ? source.card : {}) as Record<string, unknown>).tBand,
      cAut: source.cAut ?? ((source.card && typeof source.card === "object" ? source.card : {}) as Record<string, unknown>).cAut ?? source.auth_code ?? source.authCode,
      card: source.card,
    };
    return freezePaymentResult({
      kind,
      method: kind,
      tPag,
      amount,
      change,
      sanitized,
      sefazDetPag: buildCardDetPag(tPag, sanitized, amount),
    });
  }

  const method = kind === "dinheiro" || kind === "voucher" || kind === "prazo" ? kind : getPrimaryPaymentMethod(source);
  const tPag = normalizePaymentTPag(method || resolveRawPaymentForTpag(source) || "99");
  const sanitized: Record<string, unknown> = {
    method: method || undefined,
    payment_method: method || undefined,
    tPag,
    amount,
    value: amount,
    vPag: amount,
    change_amount: change,
  };
  return freezePaymentResult({
    kind,
    method,
    tPag,
    amount,
    change,
    sanitized,
    sefazDetPag: buildPlainDetPag(tPag, amount),
  });
}

export function classifyPaymentForNfce(
  row: Record<string, unknown> | undefined,
  fallbackAmount: number,
): ClassifiedPaymentForNfce {
  return classifyAndNormalizePayment(row, { fallbackAmount });
}

export function assertValidPaymentForNfce(row: ClassifiedPaymentForNfce): void {
  if (row.tPag === "17") {
    const invalidKeys = ["nsu", "auth_code", "authCode", "card_last_digits", "cardLastDigits", "tBand", "cAut", "cnpj_credenciadora"]
      .filter((key) => row.sanitized[key] != null && String(row.sanitized[key]).trim() !== "");
    if (invalidKeys.length > 0) {
      throw new Error(`Pagamento PIX inválido: campos incompatíveis presentes (${invalidKeys.join(", ")}).`);
    }
    const pixCard = row.sanitized.card;
    const pixTpIntegra = row.sanitized.tpIntegra ?? (pixCard && typeof pixCard === "object" ? (pixCard as Record<string, unknown>).tpIntegra : undefined);
    if (!String(pixTpIntegra ?? "").trim()) {
      throw new Error("Pagamento PIX inválido: tpIntegra não informado.");
    }
    return;
  }

  if (row.tPag === "03" || row.tPag === "04") {
    const card = row.sefazDetPag.card;
    const auth = row.sanitized.cAut ?? row.sanitized.auth_code ?? row.sanitized.authCode;
    const band = row.sanitized.tBand ?? (card && typeof card === "object" ? (card as Record<string, unknown>).tBand : undefined);
    const cnpj = row.sanitized.cnpj_credenciadora ?? (card && typeof card === "object" ? (card as Record<string, unknown>).CNPJ : undefined);
    if (!String(auth ?? "").trim() || !String(band ?? "").trim() || !String(cnpj ?? "").trim()) {
      throw new Error(`Pagamento em cartão inválido: dados obrigatórios ausentes para tPag ${row.tPag}.`);
    }
  }
}

export function validateDetPagForEmission(payments: ReadonlyArray<ClassifiedPaymentForNfce>): void {
  for (const payment of payments) {
    const detPag = payment.sefazDetPag;
    const card = detPag.card && typeof detPag.card === "object" ? detPag.card as Record<string, unknown> : undefined;

    if (payment.kind === "pix") {
      if (String(detPag.tPag ?? "") !== "17") {
        throw new Error("Validação fiscal falhou: PIX com tPag diferente de 17.");
      }
      const invalidKeys = ["nsu", "auth_code", "authCode"]
        .filter((key) => payment.sanitized[key] != null && String(payment.sanitized[key]).trim() !== "");
      if (invalidKeys.length > 0) {
        throw new Error(`Validação fiscal falhou: PIX contém traços de cartão (${invalidKeys.join(", ")}).`);
      }
      if (card) {
        const cardKeys = Object.keys(card);
        if (cardKeys.some((key) => key !== "tpIntegra")) {
          throw new Error("Validação fiscal falhou: PIX contém dados de cartão além do mínimo permitido.");
        }
      }
    }

    if (payment.kind === "credito" || payment.kind === "debito") {
      if (String(detPag.tPag ?? "") !== payment.tPag) {
        throw new Error(`Validação fiscal falhou: ${payment.kind} com tPag divergente.`);
      }
      if (!card || !String(card.CNPJ ?? "").trim() || !String(card.tBand ?? "").trim() || !String(card.cAut ?? "").trim()) {
        throw new Error(`Validação fiscal falhou: ${payment.kind} sem grupo card completo.`);
      }
    }
  }
}

export function normalizePaymentsForNfce(
  rows: Array<Record<string, unknown>>,
  context: NormalizePaymentContext,
): ReadonlyArray<ClassifiedPaymentForNfce> {
  const normalized = rows.map((row) => {
    const classified = classifyAndNormalizePayment(row, context);
    assertValidPaymentForNfce(classified);
    return classified;
  });
  validateDetPagForEmission(normalized);
  return Object.freeze([...normalized]);
}

export function normalizePaymentsFromSaleData(params: {
  paymentsRaw: unknown;
  fallbackMethod?: unknown;
  fallbackAmount: number;
  fallbackChange?: number;
}): ReadonlyArray<ClassifiedPaymentForNfce> {
  let paymentRows = parseSalePaymentsJson(params.paymentsRaw);
  if (paymentRows.length === 0) {
    const method = String(params.fallbackMethod ?? "").trim();
    if (method) {
      paymentRows = [{ method, payment_method: method, amount: params.fallbackAmount, change_amount: params.fallbackChange ?? 0 }];
    }
  }
  return normalizePaymentsForNfce(paymentRows, {
    fallbackAmount: params.fallbackAmount,
    fallbackChange: params.fallbackChange,
  });
}

export function getPaymentChange(row: Record<string, unknown> | undefined): number {
  if (!row) return 0;
  const c = row.change_amount ?? row.changeAmount;
  const n = Number(c);
  return Number.isFinite(n) ? n : 0;
}
