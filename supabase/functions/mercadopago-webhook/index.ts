import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXPECTED_PRICES: Record<string, number> = {
  emissor: 99.9,
  starter: 149.9,
  essencial: 149.9,
  business: 199.9,
  profissional: 199.9,
  pro: 449.9,
};

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = getAdminClient();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const topic = body.type || body.topic;
  const dataId = body.data?.id || body.id;

  console.log("[mercadopago-webhook] Received:", JSON.stringify({ topic, dataId }));

  // Always log raw payload for audit
  await admin.from("payment_webhook_logs").insert({
    mp_payment_id: dataId ? String(dataId) : null,
    payload: body,
  });

  if (topic !== "payment" || !dataId) {
    return new Response(JSON.stringify({ ok: true, ignored: topic }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const MP_ACCESS_TOKEN =
    Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ||
    Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ||
    Deno.env.get("MP_ACCESS_TOKEN");

  if (!MP_ACCESS_TOKEN) {
    console.error("[mercadopago-webhook] MP token missing");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch payment from Mercado Pago
  const mpResp = await fetch(
    `https://api.mercadopago.com/v1/payments/${dataId}`,
    { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } },
  );

  if (!mpResp.ok) {
    const errText = await mpResp.text();
    console.error("[mercadopago-webhook] MP fetch error:", mpResp.status, errText);
    return new Response(
      JSON.stringify({ ok: true, note: "MP payment not found (possibly test ping)" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const payment = await mpResp.json();
  console.log("[mercadopago-webhook] Payment:", payment.id, "status:", payment.status, "amount:", payment.transaction_amount);

  // Parse external_reference
  let ref: { user_id?: string; company_id?: string; plan_key?: string } = {};
  try {
    ref = JSON.parse(payment.external_reference || "{}");
  } catch {
    console.warn("[mercadopago-webhook] Bad external_reference:", payment.external_reference);
  }

  // Resolve company_id (fallback if missing)
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

  // 1) Always upsert payment record (idempotent)
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
    console.error("[mercadopago-webhook] payments upsert error:", payErr);
  }

  if (payment.status !== "approved") {
    return new Response(JSON.stringify({ ok: true, status: payment.status }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!ref.user_id || !ref.plan_key) {
    console.error("[mercadopago-webhook] Missing user_id/plan_key in external_reference");
    return new Response(JSON.stringify({ error: "Invalid external_reference" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate amount (tolerance ±1 BRL)
  const expectedPrice = EXPECTED_PRICES[ref.plan_key];
  if (expectedPrice && Math.abs((payment.transaction_amount ?? 0) - expectedPrice) > 1) {
    console.error("[mercadopago-webhook] Amount mismatch", {
      expected: expectedPrice,
      got: payment.transaction_amount,
      plan: ref.plan_key,
    });
    return new Response(JSON.stringify({ error: "Amount mismatch" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2) Upsert subscription — extend if active, otherwise now+30d
  const now = new Date();
  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, status, subscription_end")
    .eq("user_id", ref.user_id)
    .maybeSingle();

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
    console.error("[mercadopago-webhook] subscription write error:", subErr);
    return new Response(JSON.stringify({ error: subErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

  return new Response(
    JSON.stringify({
      ok: true,
      action: "approved",
      subscription_end: newEnd.toISOString(),
      plan_key: ref.plan_key,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
