import { createClient } from "npm:@supabase/supabase-js@2.49.1";

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
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function logWebhookEvent(
  adminClient: ReturnType<typeof getAdminClient>,
  data: {
    mp_payment_id?: string;
    event_type: string;
    status?: string;
    amount?: number;
    plan_key?: string;
    user_id?: string;
    company_id?: string;
    raw_payload?: unknown;
    error_message?: string;
    processed: boolean;
  }
) {
  try {
    await adminClient.from("payment_webhook_logs").insert({
      mp_payment_id: data.mp_payment_id || null,
      event_type: data.event_type,
      status: data.status || null,
      amount: data.amount || null,
      plan_key: data.plan_key || null,
      user_id: data.user_id || null,
      company_id: data.company_id || null,
      raw_payload: data.raw_payload || null,
      error_message: data.error_message || null,
      processed: data.processed,
    });
  } catch (err) {
    console.error("[mercadopago-webhook] Failed to log event:", err);
  }
}

async function processPayment(
  adminClient: ReturnType<typeof getAdminClient>,
  payment: any,
  ref: { user_id?: string; company_id?: string; plan_key?: string }
): Promise<{ ok: boolean; error?: string; expires?: string }> {
  // Validate amount matches plan price (tolerance ±1 BRL for rounding)
  const expectedPrice = EXPECTED_PRICES[ref.plan_key!];
  if (expectedPrice && Math.abs(payment.transaction_amount - expectedPrice) > 1) {
    const msg = `Amount mismatch! Expected: ${expectedPrice} Got: ${payment.transaction_amount}`;
    console.error("[mercadopago-webhook]", msg);
    return { ok: false, error: msg };
  }

  // Idempotency check
  const { data: existing } = await adminClient
    .from("payments")
    .select("id")
    .eq("mp_payment_id", String(payment.id))
    .eq("status", "approved")
    .maybeSingle();

  if (existing) {
    console.log("[mercadopago-webhook] Already processed:", existing.id);
    return { ok: true };
  }

  // Get company_id from user
  let companyId = ref.company_id;
  if (!companyId) {
    const { data: cu } = await adminClient
      .from("company_users")
      .select("company_id")
      .eq("user_id", ref.user_id!)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    companyId = cu?.company_id;
  }

  // Insert payment
  const { error: payErr } = await adminClient.from("payments").insert({
    company_id: companyId,
    user_id: ref.user_id,
    plan_key: ref.plan_key,
    amount: payment.transaction_amount,
    method: payment.payment_type_id || "unknown",
    status: "approved",
    transaction_id: String(payment.id),
    mp_payment_id: String(payment.id),
  });

  if (payErr) {
    console.error("[mercadopago-webhook] Insert payment error:", payErr);
    return { ok: false, error: `Insert payment failed: ${payErr.message}` };
  }

  // Update subscription — extend 30 days
  const { data: existingSub } = await adminClient
    .from("subscriptions")
    .select("id, subscription_end")
    .eq("user_id", ref.user_id!)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date();
  let newEnd: Date;

  if (existingSub?.subscription_end) {
    const currentEnd = new Date(existingSub.subscription_end);
    const base = currentEnd > now ? currentEnd : now;
    newEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
  } else {
    newEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  if (existingSub) {
    const { error: updErr } = await adminClient
      .from("subscriptions")
      .update({
        status: "active",
        plan_key: ref.plan_key,
        subscription_end: newEnd.toISOString(),
      })
      .eq("id", existingSub.id);
    if (updErr) return { ok: false, error: `Update subscription failed: ${updErr.message}` };
  } else {
    const { error: insErr } = await adminClient.from("subscriptions").insert({
      user_id: ref.user_id,
      plan_key: ref.plan_key,
      status: "active",
      subscription_end: newEnd.toISOString(),
    });
    if (insErr) return { ok: false, error: `Insert subscription failed: ${insErr.message}` };
  }

  console.log("[mercadopago-webhook] ✅ Subscription activated until:", newEnd.toISOString());
  return { ok: true, expires: newEnd.toISOString() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const adminClient = getAdminClient();

  try {
    const body = await req.json();
    console.log("[mercadopago-webhook] Received:", JSON.stringify(body));

    const topic = body.type || body.topic;
    const dataId = body.data?.id || body.id;

    if (topic !== "payment" || !dataId) {
      console.log("[mercadopago-webhook] Ignoring:", topic);
      await logWebhookEvent(adminClient, {
        event_type: topic || "unknown",
        raw_payload: body,
        processed: false,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch payment from Mercado Pago API
    const MP_ACCESS_TOKEN =
      Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ||
      Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ||
      Deno.env.get("MP_ACCESS_TOKEN");

    if (!MP_ACCESS_TOKEN) {
      console.error("[mercadopago-webhook] MP token not configured");
      await logWebhookEvent(adminClient, {
        mp_payment_id: String(dataId),
        event_type: "payment",
        error_message: "MP_ACCESS_TOKEN not configured",
        raw_payload: body,
        processed: false,
      });
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${dataId}`,
      { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } }
    );

    if (!mpResponse.ok) {
      const errText = await mpResponse.text();
      console.error("[mercadopago-webhook] MP fetch error:", mpResponse.status, errText);
      await logWebhookEvent(adminClient, {
        mp_payment_id: String(dataId),
        event_type: "payment.fetch_error",
        error_message: `MP API ${mpResponse.status}: ${errText.slice(0, 500)}`,
        raw_payload: body,
        processed: false,
      });
      return new Response(JSON.stringify({ ok: true, note: "Payment not found in MP API (possibly a test)" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payment = await mpResponse.json();
    console.log("[mercadopago-webhook] Payment:", payment.id, "status:", payment.status, "amount:", payment.transaction_amount);

    // Parse external_reference
    let ref: { user_id?: string; company_id?: string; plan_key?: string; type?: string } = {};
    try {
      ref = JSON.parse(payment.external_reference || "{}");
    } catch {
      console.error("[mercadopago-webhook] Bad external_reference:", payment.external_reference);
    }

    // Log all payment events (approved or not)
    await logWebhookEvent(adminClient, {
      mp_payment_id: String(payment.id),
      event_type: `payment.${payment.status}`,
      status: payment.status,
      amount: payment.transaction_amount,
      plan_key: ref.plan_key,
      user_id: ref.user_id,
      company_id: ref.company_id,
      raw_payload: { payment_id: payment.id, status: payment.status, amount: payment.transaction_amount, method: payment.payment_type_id, external_reference: ref },
      processed: payment.status === "approved",
    });

    if (payment.status !== "approved") {
      console.log("[mercadopago-webhook] Not approved:", payment.status);
      return new Response(JSON.stringify({ ok: true, status: payment.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ref.user_id || !ref.plan_key) {
      console.error("[mercadopago-webhook] Missing user_id/plan_key");
      await logWebhookEvent(adminClient, {
        mp_payment_id: String(payment.id),
        event_type: "payment.invalid_reference",
        error_message: "Missing user_id or plan_key in external_reference",
        raw_payload: { payment_id: payment.id, external_reference: payment.external_reference },
        processed: false,
      });
      return new Response(JSON.stringify({ error: "Invalid reference" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process payment with retry logic
    let result = await processPayment(adminClient, payment, ref);

    if (!result.ok && result.error) {
      console.warn("[mercadopago-webhook] First attempt failed, retrying in 2s...", result.error);
      await new Promise(resolve => setTimeout(resolve, 2000));
      result = await processPayment(adminClient, payment, ref);

      if (!result.ok) {
        // Log failed retry for manual investigation
        await logWebhookEvent(adminClient, {
          mp_payment_id: String(payment.id),
          event_type: "payment.processing_failed",
          status: "approved",
          amount: payment.transaction_amount,
          plan_key: ref.plan_key,
          user_id: ref.user_id,
          company_id: ref.company_id,
          error_message: `Failed after retry: ${result.error}`,
          raw_payload: { payment_id: payment.id, ref },
          processed: false,
        });

        return new Response(
          JSON.stringify({ error: result.error }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Update log as processed
    await adminClient
      .from("payment_webhook_logs")
      .update({ processed: true })
      .eq("mp_payment_id", String(payment.id))
      .eq("event_type", `payment.approved`);

    return new Response(
      JSON.stringify({ ok: true, action: "approved", expires: result.expires }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[mercadopago-webhook] Error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";

    await logWebhookEvent(adminClient, {
      event_type: "payment.exception",
      error_message: msg,
      processed: false,
    });

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
