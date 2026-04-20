import { createClient } from "npm:@supabase/supabase-js@2";
import {
  fetchMpPayment,
  getAdminClient,
  getMpToken,
  processMpPayment,
  searchLatestApprovedMpPayment,
} from "../_shared/billing.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const paymentId = body?.paymentId ? String(body.paymentId) : null;
    const simulatedPayment = body?.payment ?? null;
    const callerEmail = String(body?.userEmail || "").trim() || null;

    console.log(JSON.stringify({
      type: "TEST_WEBHOOK_INVOKED",
      payment_id: paymentId ?? simulatedPayment?.id ?? null,
      caller_user_id: claimsData.claims.sub,
      ts: new Date().toISOString(),
    }));

    const admin = getAdminClient();
    let payment = simulatedPayment;

    if (!payment) {
      const token = getMpToken();
      if (!token) {
        return new Response(JSON.stringify({ error: "MP token missing" }), {
          status: 500,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
      let resolvedPaymentId = paymentId;
      if (!resolvedPaymentId) {
        const latest = await searchLatestApprovedMpPayment(token, {
          userId: claimsData.claims.sub,
          userEmail: callerEmail,
        });
        if (!latest.ok) {
          return new Response(JSON.stringify({ error: `mp_search_${latest.status}`, detail: latest.body }), {
            status: 400,
            headers: { ...headers, "Content-Type": "application/json" },
          });
        }
        resolvedPaymentId = latest.payment?.id ? String(latest.payment.id) : null;
      }
      if (!resolvedPaymentId) {
        return new Response(JSON.stringify({ error: "payment_not_found_for_user" }), {
          status: 404,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
      const mp = await fetchMpPayment(resolvedPaymentId, token);
      if (!mp.ok) {
        return new Response(JSON.stringify({ error: `mp_fetch_${mp.status}`, detail: mp.body }), {
          status: 400,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
      payment = mp.payment;
    }

    const result = await processMpPayment(admin, payment);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
    console.error(JSON.stringify({ type: "TEST_WEBHOOK_ERROR", reason: message, ts: new Date().toISOString() }));
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});