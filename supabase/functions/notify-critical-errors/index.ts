/**
 * notify-critical-errors
 *
 * Varre a tabela public.system_errors periodicamente, identifica erros
 * CRÍTICOS ainda não notificados e envia resumo por e-mail via Resend.
 *
 * Critérios de "crítico" (qualquer um dispara o e-mail):
 *   1. Padrões em error_message: network, payment, auth, fiscal, etc.
 *   2. ErrorBoundary disparou (crash total da app)
 *   3. Mais de 5 erros distintos no intervalo
 *   4. Mais de 20 erros totais no intervalo
 *   5. Mesmo erro repetiu mais de 10 vezes
 *
 * Após notificar, marca system_errors.notified_at = now() para evitar duplicata.
 *
 * Agendamento: via pg_cron ou Scheduled Function, recomendado a cada 15 minutos.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOTIFICATION_EMAIL =
  Deno.env.get("ERROR_NOTIFICATION_EMAIL") || "contato@anthosystem.com.br";

/** Janela mínima de maturação do erro antes de ser considerado (1 min) */
const MIN_AGE_SECONDS = 60;

/** Máximo de erros a puxar por execução */
const MAX_ERRORS_PER_RUN = 500;

/** Padrões críticos no error_message (case-insensitive) */
const CRITICAL_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /network\s*error/i, label: "Falha de rede" },
  { regex: /failed to fetch/i, label: "Falha de rede" },
  { regex: /payment|pagamento|mercadopago|mercado\s*pago/i, label: "Pagamento" },
  { regex: /auth|login|unauthorized|jwt|session/i, label: "Autenticação" },
  { regex: /nfc?-?e|sefaz|fiscal|emiss[aã]o/i, label: "Fiscal" },
  { regex: /cannot read|undefined is not|null is not/i, label: "Erro de código" },
  { regex: /permission\s*denied|rls|row.level/i, label: "Permissão / RLS" },
  { regex: /deadlock|timeout|connection\s*refused/i, label: "Banco de dados" },
];

/** Actions consideradas críticas (disparam sempre) */
const CRITICAL_ACTIONS = new Set([
  "ErrorBoundary",
  "payment.failed",
  "fiscal.emit.failed",
  "window.onerror",
]);

interface SystemError {
  id: string;
  user_id: string | null;
  user_email: string | null;
  page: string | null;
  action: string | null;
  error_message: string;
  error_stack: string | null;
  browser: string | null;
  device: string | null;
  created_at: string;
}

interface ClassifiedError extends SystemError {
  critical: boolean;
  critical_reason: string | null;
}

function classifyError(err: SystemError): ClassifiedError {
  if (err.action && CRITICAL_ACTIONS.has(err.action)) {
    return { ...err, critical: true, critical_reason: `Action: ${err.action}` };
  }

  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.regex.test(err.error_message)) {
      return { ...err, critical: true, critical_reason: pattern.label };
    }
  }

  return { ...err, critical: false, critical_reason: null };
}

function fingerprint(err: SystemError): string {
  // Agrupa por primeiras palavras da mensagem (simples mas efetivo)
  return err.error_message.slice(0, 100).toLowerCase().trim();
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildEmailHtml(
  errors: ClassifiedError[],
  groups: Map<string, ClassifiedError[]>,
): string {
  const criticalCount = errors.filter((e) => e.critical).length;
  const totalCount = errors.length;
  const distinctCount = groups.size;
  const windowStart = new Date(
    errors.reduce((earliest, e) => {
      const t = new Date(e.created_at).getTime();
      return t < earliest ? t : earliest;
    }, Date.now()),
  );

  const topGroups = Array.from(groups.entries())
    .map(([fp, errs]) => ({ fingerprint: fp, count: errs.length, sample: errs[0] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const criticalList = errors
    .filter((e) => e.critical)
    .slice(0, 15)
    .map(
      (e) => `
      <tr>
        <td>${escapeHtml(new Date(e.created_at).toLocaleString("pt-BR"))}</td>
        <td><strong style="color:#d32f2f;">${escapeHtml(e.critical_reason)}</strong></td>
        <td>${escapeHtml(e.user_email) || "<em>anônimo</em>"}</td>
        <td>${escapeHtml(e.page)}</td>
        <td><code>${escapeHtml(e.error_message.slice(0, 200))}</code></td>
      </tr>`,
    )
    .join("");

  const groupsList = topGroups
    .map(
      (g) => `
      <tr>
        <td style="text-align:center; font-weight:bold; color:${
          g.count > 5 ? "#d32f2f" : "#333"
        };">${g.count}×</td>
        <td><code>${escapeHtml(g.sample.error_message.slice(0, 180))}</code></td>
        <td>${escapeHtml(g.sample.page)}</td>
      </tr>`,
    )
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 800px;">
      <h2 style="color: #d32f2f;">⚠️ Alerta de Erros — AnthoSystem</h2>
      <p>
        Detectamos atividade anômala nos últimos minutos. Resumo:
      </p>
      <ul>
        <li><strong>${totalCount}</strong> erro(s) total(is)</li>
        <li><strong>${criticalCount}</strong> erro(s) crítico(s)</li>
        <li><strong>${distinctCount}</strong> assinatura(s) distinta(s)</li>
        <li>Início da janela: ${windowStart.toLocaleString("pt-BR")}</li>
      </ul>

      ${
        criticalList
          ? `
        <h3 style="color: #d32f2f;">Erros Críticos (primeiros 15)</h3>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; font-size:12px; width:100%;">
          <thead style="background:#ffebee;">
            <tr>
              <th align="left">Quando</th>
              <th align="left">Tipo</th>
              <th align="left">Usuário</th>
              <th align="left">Página</th>
              <th align="left">Mensagem</th>
            </tr>
          </thead>
          <tbody>${criticalList}</tbody>
        </table>
      `
          : ""
      }

      <h3>Top 10 grupos de erros (agregado)</h3>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; font-size:12px; width:100%;">
        <thead style="background:#f5f5f5;">
          <tr>
            <th width="60">Vezes</th>
            <th align="left">Mensagem</th>
            <th align="left">Página</th>
          </tr>
        </thead>
        <tbody>${groupsList}</tbody>
      </table>

      <p style="margin-top:20px; font-size:12px; color:#666;">
        Para detalhes completos e gestão dos erros, acesse o painel admin em
        <a href="https://anthosystem.com.br/registro-erros">/registro-erros</a>.
      </p>
      <p style="font-size:11px; color:#999;">
        Este e-mail é automático e enviado a cada ciclo de notificação.
        Erros já incluídos aqui não serão re-enviados.
      </p>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Missing SUPABASE env vars" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Busca erros pendentes (notified_at IS NULL) com idade mínima de 1 min
    const cutoff = new Date(Date.now() - MIN_AGE_SECONDS * 1000).toISOString();

    const { data: rawErrors, error: fetchErr } = await admin
      .from("system_errors")
      .select(
        "id, user_id, user_email, page, action, error_message, error_stack, browser, device, created_at",
      )
      .is("notified_at", null)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(MAX_ERRORS_PER_RUN);

    if (fetchErr) {
      console.error("[notify-critical-errors] Fetch error:", fetchErr);
      return new Response(
        JSON.stringify({ error: "Failed to fetch errors", detail: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const errors: SystemError[] = (rawErrors || []) as SystemError[];
    if (errors.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, notified: 0, reason: "Nenhum erro pendente" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Classifica e agrupa
    const classified = errors.map(classifyError);
    const groups = new Map<string, ClassifiedError[]>();
    for (const e of classified) {
      const fp = fingerprint(e);
      const arr = groups.get(fp) ?? [];
      arr.push(e);
      groups.set(fp, arr);
    }

    // Regras de disparo
    const criticalErrors = classified.filter((e) => e.critical);
    const distinctCount = groups.size;
    const maxGroupCount = Array.from(groups.values()).reduce(
      (max, arr) => Math.max(max, arr.length),
      0,
    );

    const shouldNotify =
      criticalErrors.length > 0 ||
      errors.length > 20 ||
      distinctCount >= 5 ||
      maxGroupCount >= 10;

    if (!shouldNotify) {
      // Marca como notificados mesmo assim (baixa severidade — não polui fila)
      const allIds = errors.map((e) => e.id);
      await admin
        .from("system_errors")
        .update({ notified_at: new Date().toISOString() })
        .in("id", allIds);

      return new Response(
        JSON.stringify({
          ok: true,
          notified: 0,
          marked_as_read: allIds.length,
          reason: "Abaixo do limiar crítico — só marcados como vistos",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Envia e-mail
    const subject = `⚠️ ${criticalErrors.length > 0 ? criticalErrors.length + " erro(s) crítico(s) — " : ""}${errors.length} erro(s) total — AnthoSystem`;
    const html = buildEmailHtml(classified, groups);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "Antho System Alerts <noreply@anthosystem.com.br>",
        to: [NOTIFICATION_EMAIL],
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const text = await resendRes.text();
      console.error("[notify-critical-errors] Resend failed:", resendRes.status, text);
      return new Response(
        JSON.stringify({
          error: "Failed to send email",
          status: resendRes.status,
          details: text,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Marca como notificados
    const allIds = errors.map((e) => e.id);
    const { error: updErr } = await admin
      .from("system_errors")
      .update({ notified_at: new Date().toISOString() })
      .in("id", allIds);

    if (updErr) {
      console.error("[notify-critical-errors] Mark notified failed:", updErr);
      // e-mail já foi; não retornamos erro total
    }

    const resendData = await resendRes.json().catch(() => ({}));

    return new Response(
      JSON.stringify({
        ok: true,
        notified: allIds.length,
        critical_count: criticalErrors.length,
        distinct_groups: distinctCount,
        email_sent_to: NOTIFICATION_EMAIL,
        resend_id: resendData?.id ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("[notify-critical-errors] Unexpected error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
