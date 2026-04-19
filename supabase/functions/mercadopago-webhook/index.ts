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

function extractTopic(body: any, url: URL) {
  const action = body?.action || url.searchParams.get("action");
  return body?.type || body?.topic || url.searchParams.get("type") ||
    url.searchParams.get("topic") ||
    (typeof action === "string" ? action.split(".")[0] : null);
}

function extractPaymentId(body: any, url: URL) {
  const directId = body?.data?.id || body?.id || url.searchParams.get("data.id") ||
    url.searchParams.get("data[id]") || url.searchParams.get("id");
  if (directId) return String(directId);

  const resource = body?.resource || url.searchParams.get("resource");
  if (typeof resource === "string") {
    const match = resource.match(/\/payments\/([^/?]+)/);
    if (match?.[1]) return match[1];
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  const admin = getAdminClient();
  const url = new URL(req.url);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const topic = extractTopic(body, url);
  const dataId = extractPaymentId(body, url);
  const query = Object.fromEntries(url.searchParams.entries());
  const payload = typeof body === "object" && body !== null && !Array.isArray(body)
    ? { ...body, _query: query }
    : { _raw_body: body ?? null, _query: query };

  console.log(JSON.stringify({
    type: "WEBHOOK_HIT",
    topic,
    dataId,
    payload,
    ts: new Date().toISOString(),
  }));

  let logId: string | null = null;
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

  try {
    const { data: logRow, error: logError } = await admin
      .from("payment_webhook_logs")
      .insert({
        mp_payment_id: dataId ? String(dataId) : null,
        payload,
      })
      .select("id")
      .single();

    if (logError) {
      console.error(JSON.stringify({
        type: "WEBHOOK_LOG_INSERT_ERROR",
        topic,
        dataId,
        reason: logError.message,
        ts: new Date().toISOString(),
      }));
    }

    logId = logRow?.id ?? null;

    if (topic !== "payment" || !dataId) {
      await markProcessed(true);
      return new Response(JSON.stringify({ ok: true, ignored: topic ?? "unknown" }), {
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
      console.error(JSON.stringify({
        type: "WEBHOOK_MP_FETCH_ERROR",
        payment_id: String(dataId),
        status: mp.status,
        body: mp.body,
        ts: new Date().toISOString(),
      }));
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
  } catch (error) {
    const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
    console.error(JSON.stringify({
      type: "WEBHOOK_ERROR",
      topic,
      dataId,
      reason: message,
      ts: new Date().toISOString(),
    }));
    await markProcessed(false, message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
