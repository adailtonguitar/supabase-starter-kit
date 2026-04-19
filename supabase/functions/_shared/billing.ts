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
  starter: 149.9,
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
  let ref: { user_id?: string; company_id?: string; plan_key?: string } = {};
  try {
    ref = JSON.parse(payment.external_reference || "{}");
  } catch {
    /* ignore */
  }

  // Validate plan_key against internal whitelist
  if (ref.plan_key && !ALLOWED_PLAN_KEYS.includes(ref.plan_key as any)) {
    return { ok: false, reason: `invalid_plan_key:${ref.plan_key}` };
  }

  // Resolve company_id fallback
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
    return { ok: false, reason: `payments_upsert_error:${payErr.message}` };
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
    return { ok: false, reason: "missing_user_or_plan_in_external_reference" };
  }

  // Validate amount (±1 BRL tolerance)
  const expected = EXPECTED_PRICES[ref.plan_key];
  if (expected && Math.abs((payment.transaction_amount ?? 0) - expected) > 1) {
    return {
      ok: false,
      reason: `amount_mismatch:expected=${expected}:got=${payment.transaction_amount}`,
    };
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
    return { ok: false, reason: `subscription_write_error:${subErr.message}` };
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
