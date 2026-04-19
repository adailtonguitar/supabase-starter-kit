// retry-webhooks: replays unprocessed payment_webhook_logs entries through the
// same MP processor used by the webhook.
import {
  fetchMpPayment,
  getAdminClient,
  getMpToken,
  processMpPayment,
} from "../_shared/billing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = getAdminClient();
  const token = getMpToken();
  if (!token) {
    return new Response(JSON.stringify({ error: "MP token missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: logs, error } = await admin
    .from("payment_webhook_logs")
    .select("id, mp_payment_id, payload, retry_count")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary = { total: logs?.length ?? 0, success: 0, failed: 0 };

  for (const log of logs ?? []) {
    const payload: any = log.payload ?? {};
    const dataId = log.mp_payment_id || payload?.data?.id || payload?.id;
    const topic = payload?.type || payload?.topic;

    let success = false;
    let errMsg: string | null = null;

    if (topic && topic !== "payment") {
      success = true; // non-payment events are no-ops
    } else if (!dataId) {
      errMsg = "no_payment_id";
    } else {
      const mp = await fetchMpPayment(dataId, token);
      if (!mp.ok) {
        errMsg = `mp_fetch_${mp.status}`;
        // 404 → mark processed (test ping) to drain queue
        if (mp.status === 404) success = true;
      } else {
        const r = await processMpPayment(admin, mp.payment);
        success = r.ok;
        if (!r.ok) errMsg = r.reason ?? "process_failed";
      }
    }

    console.log(JSON.stringify({
      type: "WEBHOOK_RETRY",
      payment_id: dataId ?? null,
      success,
      error: errMsg,
    }));

    await admin
      .from("payment_webhook_logs")
      .update({
        processed: success,
        processed_at: success ? new Date().toISOString() : null,
        error_message: errMsg,
        retry_count: (log.retry_count ?? 0) + 1,
      })
      .eq("id", log.id);

    if (success) summary.success++;
    else summary.failed++;
  }

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
