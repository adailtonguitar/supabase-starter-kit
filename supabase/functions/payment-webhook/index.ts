import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This is a PUBLIC webhook — no auth required, but we validate with MP
    const body = await req.json();
    console.log("[payment-webhook] Received:", JSON.stringify({ type: body.type || body.topic, id: body.data?.id || body.id }));

    // Mercado Pago sends different notification types
    const topic = body.type || body.topic;
    const paymentId = body.data?.id || body.id;

    if (topic !== "payment" || !paymentId) {
      console.log("[payment-webhook] Ignoring non-payment notification:", topic);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch payment details from Mercado Pago to validate
    const MP_ACCESS_TOKEN =
      Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ||
      Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ||
      Deno.env.get("MP_ACCESS_TOKEN");

    if (!MP_ACCESS_TOKEN) {
      console.error("[payment-webhook] MP_ACCESS_TOKEN not configured");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        },
      }
    );

    if (!mpResponse.ok) {
      const errText = await mpResponse.text();
      console.error("[payment-webhook] MP fetch error:", errText);
      return new Response(JSON.stringify({ error: "Failed to fetch payment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payment = await mpResponse.json();
    console.log("[payment-webhook] Payment status:", payment.status, "amount:", payment.transaction_amount);

    if (payment.status !== "approved") {
      console.log("[payment-webhook] Payment not approved, status:", payment.status);
      return new Response(JSON.stringify({ ok: true, status: payment.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse external_reference to get user_id and plan_key
    let externalRef: { user_id?: string; plan_key?: string } = {};
    try {
      externalRef = JSON.parse(payment.external_reference || "{}");
    } catch {
      console.error("[payment-webhook] Failed to parse external_reference:", payment.external_reference);
    }

    if (!externalRef.user_id || !externalRef.plan_key) {
      console.error("[payment-webhook] Missing user_id or plan_key in external_reference");
      return new Response(JSON.stringify({ error: "Invalid external_reference" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to update subscription (bypasses RLS)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: result, error: rpcError } = await adminClient.rpc(
      "process_payment_approval",
      {
        p_mp_payment_id: String(paymentId),
        p_transaction_id: String(payment.id),
        p_method: payment.payment_type_id || "unknown",
        p_amount: payment.transaction_amount,
        p_user_id: externalRef.user_id,
        p_plan_key: externalRef.plan_key,
      }
    );

    if (rpcError) {
      console.error("[payment-webhook] RPC error:", rpcError);
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[payment-webhook] Result:", JSON.stringify(result));

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[payment-webhook] Error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
