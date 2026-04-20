// Shared billing constants and processing logic for MP webhook + retry/reconcile.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const ALLOWED_PLAN_KEYS = [
  "emissor",
  "starter",
  "essencial",
  "business",
  "profissional",
  "pro",
] as const;

export const EXPECTED_PRICES: Record<string, number> = {
  emissor: 99.9,
  starter: 1.0, // TESTE: valor reduzido temporariamente
  essencial: 149.9,
  business: 199.9,
  profissional: 199.9,
  pro: 449.9,
};

export const ALLOWED_SUB_STATUS = ["active", "expired", "canceled", "past_due"] as const;

export function getAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function getMpToken(): string | null {
  return (
    Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ||
    Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ||
    Deno.env.get("MP_ACCESS_TOKEN") ||
    null
  );
}

export async function fetchMpPayment(paymentId: string | number, token: string) {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    return { ok: false as const, status: r.status, body: await r.text() };
  }
  return { ok: true as const, payment: await r.json() };
}

export async function searchLatestApprovedMpPayment(
  token: string,
  params: { userId?: string | null; userEmail?: string | null },
) {
  const buildUrl = (withEmail: boolean) => {
    const url = new URL("https://api.mercadopago.com/v1/payments/search");
    url.searchParams.set("sort", "date_created");
    url.searchParams.set("criteria", "desc");
    url.searchParams.set("status", "approved");
    url.searchParams.set("limit", "20");
    if (withEmail && params.userEmail) {
      url.searchParams.set("payer.email", params.userEmail);
    }
    return url.toString();
  };

  const doFetch = async (withEmail: boolean) => {
    const r = await fetch(buildUrl(withEmail), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      return { ok: false as const, status: r.status, body: await r.text() };
    }
    return { ok: true as const, data: await r.json() };
  };

  const primary = await doFetch(!!params.userEmail);
  const fallback = !primary.ok && params.userEmail ? await doFetch(false) : primary;
  if (!fallback.ok) return fallback;

  const results = Array.isArray(fallback.data?.results) ? fallback.data.results : [];
  const normalizedEmail = String(params.userEmail || "").trim().toLowerCase();
  const normalizedUserId = String(params.userId || "").trim();

  const matched = results.filter((payment: any) => {
    const paymentEmail = String(payment?.payer?.email || "").trim().toLowerCase();
    const externalReference = String(payment?.external_reference || "");

    if (normalizedUserId) {
      try {
        const parsed = JSON.parse(externalReference || "{}");
        if (parsed?.user_id === normalizedUserId) return true;
      } catch {
        if (externalReference.includes(normalizedUserId)) return true;
      }
    }

    if (normalizedEmail && paymentEmail === normalizedEmail) return true;
    return false;
  });

  const payment = matched.sort((a: any, b: any) => {
    const aTs = new Date(a?.date_approved || a?.date_created || 0).getTime();
    const bTs = new Date(b?.date_approved || b?.date_created || 0).getTime();
    return bTs - aTs;
  })[0];

  return { ok: true as const, payment: payment ?? null, scanned: results.length, matched: matched.length };
}

export interface ProcessResult {
  ok: boolean;
  reason?: string;
  action?: string;
  status_db?: string;
  status_mp?: string;
  company_id?: string | null;
  plan_key?: string | null;
  subscription_end?: string | null;
}

/**
 * Idempotent processor: upserts payment row and, when approved, upserts the
 * subscription (extending if active). Used by webhook, retry-webhooks and
 * reconcile-payments to guarantee a single source of truth.
 */
export async function processMpPayment(
  admin: SupabaseClient,
  payment: any,
): Promise<ProcessResult> {
  console.log(JSON.stringify({
    type: "PROCESS_PAYMENT_START",
    payment_id: String(payment?.id ?? ""),
    status_mp: payment?.status ?? null,
    external_reference_present: !!payment?.external_reference,
    ts: new Date().toISOString(),
  }));

  const fail = (reason: string): ProcessResult => {
    console.error(JSON.stringify({
      type: "PROCESS_PAYMENT_ERROR",
      payment_id: String(payment?.id ?? ""),
      reason,
      status_mp: payment?.status ?? null,
      ts: new Date().toISOString(),
    }));
    return { ok: false, reason };
  };

  let ref: { user_id?: string; company_id?: string; plan_key?: string } = {};
  try {
    ref = JSON.parse(payment.external_reference || "{}");
  } catch {
    /* ignore */
  }

  // FALLBACK: se faltar dado essencial no external_reference, buscar na tabela payments
  let usedFallback = false;
  if (!ref.user_id || !ref.company_id || !ref.plan_key) {
    const { data: existingPay } = await admin
      .from("payments")
      .select("user_id, company_id, plan_key")
      .eq("mp_payment_id", String(payment.id))
      .maybeSingle();
    if (existingPay) {
      const before = { ...ref };
      ref.user_id = ref.user_id || existingPay.user_id || undefined;
      ref.company_id = ref.company_id || existingPay.company_id || undefined;
      ref.plan_key = ref.plan_key || existingPay.plan_key || undefined;
      if (
        ref.user_id !== before.user_id ||
        ref.company_id !== before.company_id ||
        ref.plan_key !== before.plan_key
      ) {
        usedFallback = true;
        console.log(JSON.stringify({
          type: "PAYMENT_FALLBACK_USED",
          payment_id: String(payment.id),
          company_id: ref.company_id ?? null,
          plan_key: ref.plan_key ?? null,
          ts: new Date().toISOString(),
        }));
      }
    }
  }

  // Validate plan_key against internal whitelist
  if (ref.plan_key && !ALLOWED_PLAN_KEYS.includes(ref.plan_key as any)) {
    return fail(`invalid_plan_key:${ref.plan_key}`);
  }

  // Resolve company_id fallback via company_users
  let companyId = ref.company_id || null;
  if (!companyId && ref.user_id) {
    const { data: cu } = await admin
      .from("company_users")
      .select("company_id")
      .eq("user_id", ref.user_id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    companyId = cu?.company_id ?? null;
  }

  // 1) Idempotent payment upsert
  const { error: payErr } = await admin
    .from("payments")
    .upsert(
      {
        mp_payment_id: String(payment.id),
        user_id: ref.user_id ?? null,
        company_id: companyId,
        plan_key: ref.plan_key ?? null,
        amount: payment.transaction_amount ?? 0,
        status: payment.status ?? "unknown",
      },
      { onConflict: "mp_payment_id" },
    );
  if (payErr) {
    return fail(`payments_upsert_error:${payErr.message}`);
  }

  if (payment.status !== "approved") {
    return {
      ok: true,
      action: "logged_only",
      status_mp: payment.status,
      company_id: companyId,
      plan_key: ref.plan_key ?? null,
    };
  }

  if (!ref.user_id || !ref.plan_key) {
    console.error(JSON.stringify({
      type: "PAYMENT_FALLBACK_FAILED",
      payment_id: String(payment.id),
      reason: !ref.user_id ? "missing_user_id" : "missing_plan_key",
      fallback_attempted: usedFallback,
      ts: new Date().toISOString(),
    }));
    return fail("missing_user_or_plan_after_fallback");
  }

  // Validate amount (±1 BRL tolerance)
  const expected = EXPECTED_PRICES[ref.plan_key];
  if (expected && Math.abs((payment.transaction_amount ?? 0) - expected) > 1) {
    return fail(`amount_mismatch:expected=${expected}:got=${payment.transaction_amount}`);
  }

  // 2) Subscription upsert per company_id (single source of truth)
  const now = new Date();
  let existing: any = null;
  if (companyId) {
    const { data } = await admin
      .from("subscriptions")
      .select("id, status, subscription_end")
      .eq("company_id", companyId)
      .maybeSingle();
    existing = data;
  } else {
    const { data } = await admin
      .from("subscriptions")
      .select("id, status, subscription_end")
      .eq("user_id", ref.user_id)
      .is("company_id", null)
      .maybeSingle();
    existing = data;
  }

  const baseDate =
    existing?.status === "active" &&
    existing?.subscription_end &&
    new Date(existing.subscription_end) > now
      ? new Date(existing.subscription_end)
      : now;
  const newEnd = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  let subErr;
  if (existing) {
    ({ error: subErr } = await admin
      .from("subscriptions")
      .update({
        status: "active",
        plan_key: ref.plan_key,
        company_id: companyId,
        user_id: ref.user_id,
        subscription_end: newEnd.toISOString(),
      })
      .eq("id", existing.id));
  } else {
    ({ error: subErr } = await admin.from("subscriptions").insert({
      user_id: ref.user_id,
      company_id: companyId,
      plan_key: ref.plan_key,
      status: "active",
      subscription_end: newEnd.toISOString(),
    }));
  }

  if (subErr) {
    return fail(`subscription_write_error:${subErr.message}`);
  }

  console.log(JSON.stringify({
    type: "SUBSCRIPTION_UPDATE",
    company_id: companyId,
    user_id: ref.user_id,
    plan_key: ref.plan_key,
    status: "active",
    subscription_end: newEnd.toISOString(),
    ts: new Date().toISOString(),
  }));

  console.log(JSON.stringify({
    type: "PROCESS_PAYMENT_SUCCESS",
    payment_id: String(payment?.id ?? ""),
    company_id: companyId,
    user_id: ref.user_id,
    plan_key: ref.plan_key,
    status_db: "active",
    subscription_end: newEnd.toISOString(),
    ts: new Date().toISOString(),
  }));

  return {
    ok: true,
    action: "approved",
    status_mp: payment.status,
    status_db: "active",
    company_id: companyId,
    plan_key: ref.plan_key,
    subscription_end: newEnd.toISOString(),
  };
}
