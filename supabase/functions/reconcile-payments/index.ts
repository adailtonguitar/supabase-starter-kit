// reconcile-payments: scans last 2 days of payments, queries Mercado Pago and
// fixes subscriptions when MP says approved but DB doesn't reflect it.
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

  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("payments")
    .select("id, mp_payment_id, status, company_id")
    .gte("created_at", since)
    .not("mp_payment_id", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary = { checked: 0, reconciled: 0, errors: 0, skipped: 0 };

  for (const p of rows ?? []) {
    summary.checked++;
    const mp = await fetchMpPayment(p.mp_payment_id!, token);
    if (!mp.ok) {
      summary.errors++;
      console.log(JSON.stringify({
        type: "RECONCILE_CHECK",
        company_id: p.company_id,
        payment_id: p.mp_payment_id,
        status_mp: `fetch_${mp.status}`,
        status_db: p.status,
      }));
      continue;
    }

    const statusMp = mp.payment.status;
    console.log(JSON.stringify({
      type: "RECONCILE_CHECK",
      company_id: p.company_id,
      payment_id: p.mp_payment_id,
      status_mp: statusMp,
      status_db: p.status,
    }));

    // Mismatch: MP approved but DB not approved → re-process
    if (statusMp === "approved" && p.status !== "approved") {
      const r = await processMpPayment(admin, mp.payment);
      if (r.ok) summary.reconciled++;
      else summary.errors++;
    } else if (statusMp !== p.status) {
      // Sync non-approved status drift (e.g. refunded, cancelled)
      await admin
        .from("payments")
        .update({ status: statusMp ?? "unknown" })
        .eq("id", p.id);
      summary.reconciled++;
    } else {
      summary.skipped++;
    }
  }

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
