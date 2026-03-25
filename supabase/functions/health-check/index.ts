import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface HealthResult {
  service: string;
  status: "ok" | "error";
  latency_ms: number;
  error?: string;
}

async function checkDatabase(client: any): Promise<HealthResult> {
  const start = Date.now();
  try {
    const { error } = await client
      .from("companies")
      .select("id", { count: "exact", head: true })
      .limit(1);
    return {
      service: "database",
      status: error ? "error" : "ok",
      latency_ms: Date.now() - start,
      ...(error && { error: error.message }),
    };
  } catch (err: any) {
    return { service: "database", status: "error", latency_ms: Date.now() - start, error: err.message };
  }
}

async function checkAuth(client: any): Promise<HealthResult> {
  const start = Date.now();
  try {
    const { error } = await client.auth.getSession();
    return {
      service: "auth",
      status: error ? "error" : "ok",
      latency_ms: Date.now() - start,
      ...(error && { error: error.message }),
    };
  } catch (err: any) {
    return { service: "auth", status: "error", latency_ms: Date.now() - start, error: err.message };
  }
}

async function checkStorage(client: any): Promise<HealthResult> {
  const start = Date.now();
  try {
    const { error } = await client.storage.listBuckets();
    return {
      service: "storage",
      status: error ? "error" : "ok",
      latency_ms: Date.now() - start,
      ...(error && { error: error.message }),
    };
  } catch (err: any) {
    return { service: "storage", status: "error", latency_ms: Date.now() - start, error: err.message };
  }
}

/** 
 * Ping an Edge Function to verify it's deployed and reachable.
 * ANY HTTP response (even 4xx/5xx) means the function is alive.
 * Only network errors or timeouts indicate the function is truly down.
 */
async function checkEdgeFunction(supabaseUrl: string, fnName: string): Promise<HealthResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ health_check: true }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    await resp.text(); // consume body
    // ANY response means the function is deployed and running
    // 502 = gateway can't reach function (boot failure), flag as error
    const trulyDown = resp.status === 502;
    return {
      service: `edge:${fnName}`,
      status: trulyDown ? "error" : "ok",
      latency_ms: Date.now() - start,
      ...(trulyDown && { error: `HTTP ${resp.status}` }),
    };
  } catch (err: any) {
    return { 
      service: `edge:${fnName}`, 
      status: "error", 
      latency_ms: Date.now() - start, 
      error: err.name === "AbortError" ? "Timeout (8s)" : err.message,
    };
  }
}

const CRITICAL_FUNCTIONS = [
  "check-subscription",
  "emit-nfce",
  "create-checkout",
  "payment-webhook",
  "ai-support",
  "generate-ai-report",
];

async function sendAlert(resendKey: string, alertEmail: string, failedServices: HealthResult[]) {
  const rows = failedServices
    .map(
      (s) =>
        `<tr><td style="padding:8px;border:1px solid #fecaca;">${s.service}</td><td style="padding:8px;border:1px solid #fecaca;color:#dc2626;">${s.error || "Falha"}</td><td style="padding:8px;border:1px solid #fecaca;">${s.latency_ms}ms</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
      <div style="background:#dc2626;padding:16px;text-align:center;border-radius:8px 8px 0 0;">
        <h2 style="color:white;margin:0;">🚨 Alerta de Indisponibilidade</h2>
      </div>
      <div style="padding:16px;border:1px solid #fecaca;background:#fef2f2;">
        <p>Os seguintes serviços estão com falha:</p>
        <table width="100%" cellspacing="0" style="font-size:13px;">
          <tr style="background:#fee2e2;"><th style="padding:8px;text-align:left;">Serviço</th><th style="padding:8px;text-align:left;">Erro</th><th style="padding:8px;">Latência</th></tr>
          ${rows}
        </table>
        <p style="font-size:12px;color:#64748b;margin-top:12px;">Detectado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
      </div>
      <div style="background:#1a1a2e;padding:12px;text-align:center;border-radius:0 0 8px 8px;">
        <p style="color:#64748b;margin:0;font-size:11px;">AnthoSystem — Health Monitor</p>
      </div>
    </div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: "AnthoSystem <noreply@anthosystem.com.br>",
      to: [alertEmail],
      subject: `🚨 ALERTA: ${failedServices.length} serviço(s) fora do ar — AnthoSystem`,
      html,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTotal = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const alertEmail = Deno.env.get("ALERT_EMAIL") || "adailtonguitar@gmail.com";
    const client = createClient(supabaseUrl, serviceRoleKey);

    // Run infrastructure + Edge Function checks in parallel
    const [db, auth, storage, ...edgeResults] = await Promise.all([
      checkDatabase(client),
      checkAuth(client),
      checkStorage(client),
      ...CRITICAL_FUNCTIONS.map((fn) => checkEdgeFunction(supabaseUrl, fn)),
    ]);

    const checks = [db, auth, storage, ...edgeResults];
    const failedServices = checks.filter((c) => c.status === "error");
    const allOk = failedServices.length === 0;
    const totalLatency = Date.now() - startTotal;

    // Log to uptime_logs table
    try {
      await client.from("uptime_logs").insert({
        status: allOk ? "ok" : "degraded",
        checks: JSON.stringify(checks),
        total_latency_ms: totalLatency,
        failed_services: failedServices.map((f) => f.service),
      });
    } catch {
      // Table might not exist yet
    }

    // Log failures to system_errors for admin visibility
    if (!allOk) {
      try {
        for (const failed of failedServices) {
          await client.from("system_errors").insert({
            error_type: "health_check_failure",
            message: `${failed.service}: ${failed.error || "Falha"}`,
            metadata: JSON.stringify({ latency_ms: failed.latency_ms, timestamp: new Date().toISOString() }),
          });
        }
      } catch {
        // system_errors table might not exist
      }
    }

    // Send alert email if any service is down
    if (!allOk && resendKey) {
      try {
        await sendAlert(resendKey, alertEmail, failedServices);
      } catch (emailErr) {
        console.error("[health-check] Alert email error:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({
        status: allOk ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        total_latency_ms: totalLatency,
        services_checked: checks.length,
        services_ok: checks.filter((c) => c.status === "ok").length,
        services_failed: failedServices.length,
        checks,
      }),
      {
        status: allOk ? 200 : 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    console.error("[health-check] Critical error:", err);
    const message = err instanceof Error ? err.message : "Erro crítico";
    return new Response(JSON.stringify({ status: "critical", error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
