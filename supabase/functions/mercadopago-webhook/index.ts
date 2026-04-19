import {
  fetchMpPayment,
  getAdminClient,
  getMpToken,
  processMpPayment,
} from "../_shared/billing.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
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

  console.log("[mp-webhook] in:", JSON.stringify({ topic, dataId }));

  // Always log raw payload for audit/retry
  const { data: logRow } = await admin
    .from("payment_webhook_logs")
    .insert({
      mp_payment_id: dataId ? String(dataId) : null,
      payload: body,
    })
    .select("id")
    .single();
  const logId = logRow?.id;

  const markProcessed = async (success: boolean, errorMsg?: string) => {
    if (!logId) return;
    await admin
      .from("payment_webhook_logs")
      .update({
        processed: success,
        processed_at: success ? new Date().toISOString() : null,
        error_message: errorMsg ?? null,
      })
      .eq("id", logId);
  };

  if (topic !== "payment" || !dataId) {
    await markProcessed(true);
    return new Response(JSON.stringify({ ok: true, ignored: topic }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const token = getMpToken();
  if (!token) {
    await markProcessed(false, "mp_token_missing");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const mp = await fetchMpPayment(dataId, token);
  if (!mp.ok) {
    console.error("[mp-webhook] MP fetch:", mp.status, mp.body);
    // Test pings: not found is OK, mark processed to skip retry storm
    await markProcessed(true, `mp_fetch_${mp.status}`);
    return new Response(
      JSON.stringify({ ok: true, note: "MP payment not found (test ping?)" }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }

  const result = await processMpPayment(admin, mp.payment);
  await markProcessed(result.ok, result.ok ? null : result.reason);

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 400,
    headers: { ...headers, "Content-Type": "application/json" },
  });
});
