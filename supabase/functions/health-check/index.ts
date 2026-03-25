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

// ── Infrastructure checks ──

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
    await resp.text();
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

// ── App error check ──

async function checkAppErrors(client: any): Promise<{ count: number; topErrors: string[] }> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Filter out known non-actionable errors (IndexedDB version conflicts, ResizeObserver, chunk loading)
    const NON_ACTIONABLE = [
      "requested version",
      "ResizeObserver",
      "Loading chunk",
    ];

    const { data, count } = await client
      .from("system_errors")
      .select("error_message", { count: "exact" })
      .gte("created_at", oneHourAgo)
      .not("error_message", "ilike", "%requested version%")
      .not("error_message", "ilike", "%ResizeObserver%")
      .not("error_message", "ilike", "%Loading chunk%")
      .order("created_at", { ascending: false })
      .limit(5);

    const topErrors = (data || []).map((r: any) => r.error_message?.slice(0, 100) || "Erro desconhecido");
    return { count: count || 0, topErrors };
  } catch {
    return { count: 0, topErrors: [] };
  }
}

// ── Deduplication: get previous failed services ──

async function getPreviousFailedServices(client: any): Promise<Set<string>> {
  try {
    const { data } = await client
      .from("uptime_logs")
      .select("failed_services")
      .order("created_at", { ascending: false })
      .limit(1);

    if (data?.[0]?.failed_services) {
      return new Set(data[0].failed_services as string[]);
    }
  } catch {
    // Table might not exist
  }
  return new Set();
}

// ── Alert emails ──

const CRITICAL_FUNCTIONS = [
  "check-subscription",
  "emit-nfce",
  "create-checkout",
  "payment-webhook",
  "ai-support",
  "generate-ai-report",
];

const APP_ERROR_THRESHOLD = 5;

function buildAlertHtml(
  failedServices: HealthResult[],
  appErrors: { count: number; topErrors: string[] } | null,
  isNewFailure: boolean,
): string {
  let sections = "";

  // Service failures section
  if (failedServices.length > 0 && isNewFailure) {
    const rows = failedServices
      .map(
        (s) =>
          `<tr><td style="padding:8px;border:1px solid #fecaca;">${s.service}</td><td style="padding:8px;border:1px solid #fecaca;color:#dc2626;">${s.error || "Falha"}</td><td style="padding:8px;border:1px solid #fecaca;">${s.latency_ms}ms</td></tr>`
      )
      .join("");

    sections += `
      <p style="font-weight:bold;color:#dc2626;">🔴 Serviços fora do ar (NOVO):</p>
      <table width="100%" cellspacing="0" style="font-size:13px;margin-bottom:16px;">
        <tr style="background:#fee2e2;"><th style="padding:8px;text-align:left;">Serviço</th><th style="padding:8px;text-align:left;">Erro</th><th style="padding:8px;">Latência</th></tr>
        ${rows}
      </table>`;
  }

  // App errors section
  if (appErrors && appErrors.count >= APP_ERROR_THRESHOLD) {
    const errorRows = appErrors.topErrors
      .map((e) => `<li style="margin:4px 0;font-size:13px;color:#92400e;">${e}</li>`)
      .join("");

    sections += `
      <p style="font-weight:bold;color:#d97706;">⚠️ Pico de erros de aplicação: ${appErrors.count} erro(s) na última hora</p>
      <ul style="margin:8px 0;padding-left:20px;">${errorRows}</ul>`;
  }

  return `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
      <div style="background:#dc2626;padding:16px;text-align:center;border-radius:8px 8px 0 0;">
        <h2 style="color:white;margin:0;">🚨 Alerta do Sistema</h2>
      </div>
      <div style="padding:16px;border:1px solid #fecaca;background:#fef2f2;">
        ${sections}
        <p style="font-size:12px;color:#64748b;margin-top:12px;">Detectado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
      </div>
      <div style="background:#1a1a2e;padding:12px;text-align:center;border-radius:0 0 8px 8px;">
        <p style="color:#64748b;margin:0;font-size:11px;">AnthoSystem — Health Monitor</p>
      </div>
    </div>`;
}

async function sendAlert(resendKey: string, alertEmail: string, html: string, subject: string) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: "AnthoSystem <noreply@anthosystem.com.br>",
      to: [alertEmail],
      subject,
      html,
    }),
  });
}

// ── Main handler ──

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

    // Run all checks in parallel
    const [db, auth, storage, previousFailed, appErrors, ...edgeResults] = await Promise.all([
      checkDatabase(client),
      checkAuth(client),
      checkStorage(client),
      getPreviousFailedServices(client),
      checkAppErrors(client),
      ...CRITICAL_FUNCTIONS.map((fn) => checkEdgeFunction(supabaseUrl, fn)),
    ]);

    const checks: HealthResult[] = [db, auth, storage, ...edgeResults];
    const failedServices = checks.filter((c) => c.status === "error");
    const allOk = failedServices.length === 0;
    const totalLatency = Date.now() - startTotal;

    // ── Deduplication: find NEW failures only ──
    const currentFailedSet = new Set(failedServices.map((f) => f.service));
    const newFailures = failedServices.filter((f) => !previousFailed.has(f.service));
    const hasNewFailures = newFailures.length > 0;

    // ── App error spike detection ──
    const hasAppErrorSpike = appErrors.count >= APP_ERROR_THRESHOLD;

    // Log to uptime_logs
    try {
      await client.from("uptime_logs").insert({
        status: allOk ? "ok" : "degraded",
        checks: JSON.stringify(checks),
        total_latency_ms: totalLatency,
        failed_services: Array.from(currentFailedSet),
      });
    } catch {
      // Table might not exist yet
    }

    // Log infrastructure failures to system_errors
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

    // ── Send alert only when there's something NEW to report ──
    const shouldAlert = (hasNewFailures || hasAppErrorSpike) && resendKey;

    if (shouldAlert) {
      try {
        const parts: string[] = [];
        if (hasNewFailures) parts.push(`${newFailures.length} serviço(s) fora do ar`);
        if (hasAppErrorSpike) parts.push(`${appErrors.count} erros de app/hora`);
        const subject = `🚨 ALERTA: ${parts.join(" + ")} — AnthoSystem`;

        const html = buildAlertHtml(
          newFailures,
          hasAppErrorSpike ? appErrors : null,
          hasNewFailures,
        );
        await sendAlert(resendKey, alertEmail, html, subject);
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
        new_failures: newFailures.length,
        app_errors_last_hour: appErrors.count,
        alert_sent: !!shouldAlert,
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
