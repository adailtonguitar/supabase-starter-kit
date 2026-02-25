import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EXPECTED_PRICES: Record<string, number> = {
  essencial: 149.9,
  profissional: 199.9,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("[mercadopago-webhook] Received:", JSON.stringify(body));

    // MP sends different notification formats
    const topic = body.type || body.topic;
    const dataId = body.data?.id || body.id;

    if (topic !== "payment" || !dataId) {
      console.log("[mercadopago-webhook] Ignoring:", topic);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch payment from Mercado Pago API to validate
    const MP_ACCESS_TOKEN =
      Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ||
      Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ||
      Deno.env.get("MP_ACCESS_TOKEN");

    if (!MP_ACCESS_TOKEN) {
      console.error("[mercadopago-webhook] MP token not configured");
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
      return new Response(JSON.stringify({ error: "Failed to verify payment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payment = await mpResponse.json();
    console.log("[mercadopago-webhook] Payment:", payment.id, "status:", payment.status, "amount:", payment.transaction_amount);

    if (payment.status !== "approved") {
      console.log("[mercadopago-webhook] Not approved:", payment.status);
      return new Response(JSON.stringify({ ok: true, status: payment.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse external_reference
    let ref: { user_id?: string; company_id?: string; plan_key?: string; type?: string } = {};
    try {
      ref = JSON.parse(payment.external_reference || "{}");
    } catch {
      console.error("[mercadopago-webhook] Bad external_reference:", payment.external_reference);
    }

    if (!ref.user_id || !ref.plan_key) {
      console.error("[mercadopago-webhook] Missing user_id/plan_key");
      return new Response(JSON.stringify({ error: "Invalid reference" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate amount matches plan price (tolerance ±1 BRL for rounding)
    const expectedPrice = EXPECTED_PRICES[ref.plan_key];
    if (expectedPrice && Math.abs(payment.transaction_amount - expectedPrice) > 1) {
      console.error("[mercadopago-webhook] Amount mismatch! Expected:", expectedPrice, "Got:", payment.transaction_amount);
      return new Response(JSON.stringify({ error: "Amount mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to bypass RLS
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Idempotency check
    const { data: existing } = await adminClient
      .from("payments")
      .select("id")
      .eq("mp_payment_id", String(payment.id))
      .eq("status", "approved")
      .maybeSingle();

    if (existing) {
      console.log("[mercadopago-webhook] Already processed:", existing.id);
      return new Response(JSON.stringify({ ok: true, action: "already_processed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get company_id from user
    let companyId = ref.company_id;
    if (!companyId) {
      const { data: cu } = await adminClient
        .from("company_users")
        .select("company_id")
        .eq("user_id", ref.user_id)
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
    }

    // Update subscription — extend 30 days
    const { data: existingSub } = await adminClient
      .from("subscriptions")
      .select("id, subscription_end")
      .eq("user_id", ref.user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date();
    let newEnd: Date;

    if (existingSub?.subscription_end) {
      const currentEnd = new Date(existingSub.subscription_end);
      // If still active, extend from current end; otherwise from now
      const base = currentEnd > now ? currentEnd : now;
      newEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
    } else {
      newEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    if (existingSub) {
      await adminClient
        .from("subscriptions")
        .update({
          status: "active",
          plan_key: ref.plan_key,
          subscription_end: newEnd.toISOString(),
        })
        .eq("id", existingSub.id);
    } else {
      await adminClient.from("subscriptions").insert({
        user_id: ref.user_id,
        plan_key: ref.plan_key,
        status: "active",
        subscription_end: newEnd.toISOString(),
      });
    }

    console.log("[mercadopago-webhook] ✅ Subscription activated until:", newEnd.toISOString());

    return new Response(
      JSON.stringify({ ok: true, action: "approved", expires: newEnd.toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[mercadopago-webhook] Error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
