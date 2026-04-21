import { createClient } from "npm:@supabase/supabase-js@2";
import { sendExternalAlert } from "../_shared/alerts.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";

const ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
  "https://anthosystem.com.br",
  "https://www.anthosystem.com.br",
  "https://id-preview--d4ab3861-f98c-4c08-a556-30aa884845a3.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

function jsonOk(req: Request, body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: getCorsHeaders(req) });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: getCorsHeaders(req) });
    }
    const userId = claimsData.claims.sub as string;

    // Verify super_admin
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("admin_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: getCorsHeaders(req) });
    }

    const body = await req.json();
    const { action } = body;

    // ── Rate limit server-side: última defesa contra token comprometido
    // ── ou client modificado. Janela de 60s, 20 ações por user/ação.
    // ── Coerente com adminActionLimiter do frontend (20/60s).
    if (action) {
      const rlKey = `admin-action:${userId}:${action}`;
      const rl = await checkRateLimit(adminClient, rlKey, 20, 60);
      if (!rl.allowed) {
        return rateLimitResponse(rl, getCorsHeaders(req));
      }
    }

    // ── close_stuck_cash_sessions ──
    if (action === "close_stuck_cash_sessions") {
      const hoursThreshold = body.hours_threshold || 24;
      const cutoff = new Date(Date.now() - hoursThreshold * 3600000).toISOString();

      const { data: sessions, error: fetchErr } = await adminClient
        .from("cash_sessions")
        .select("id, company_id, opened_at")
        .eq("status", "aberto")
        .lte("opened_at", cutoff);

      if (fetchErr) throw fetchErr;

      if (!sessions || sessions.length === 0) {
        return jsonOk(req, { closed: 0 });
      }

      const ids = sessions.map(s => s.id);
      const { error: updateErr } = await adminClient
        .from("cash_sessions")
        .update({
          status: "fechado",
          closed_at: new Date().toISOString(),
          notes: "[ADMIN_FORCE_CLOSED] Fechado em massa pelo administrador",
        })
        .in("id", ids);

      if (updateErr) throw updateErr;
      return jsonOk(req, { closed: ids.length });
    }

    // ── clear_old_errors ──
    if (action === "clear_old_errors") {
      const daysThreshold = body.days_threshold || 7;
      const cutoff = new Date(Date.now() - daysThreshold * 86400000).toISOString();

      const { error: delErr, count } = await adminClient
        .from("system_errors")
        .delete({ count: "exact" })
        .lt("created_at", cutoff);

      if (delErr) throw delErr;
      return jsonOk(req, { deleted: count || 0 });
    }

    // ── send_notification ──
    if (action === "send_notification") {
      const { title, message, type, company_id } = body;
      if (!title || !message) {
        return new Response(JSON.stringify({ error: "title and message required" }), {
          status: 400, headers: getCorsHeaders(req),
        });
      }

      const { error: insertErr } = await adminClient
        .from("admin_notifications")
        .insert({
          title,
          message,
          type: type || "info",
          company_id: company_id || null,
          created_by: userId,
        });

      if (insertErr) throw insertErr;
      return jsonOk(req, { success: true });
    }

    // ── toggle_block_company ──
    if (action === "toggle_block_company") {
      const { company_id, is_blocked, block_reason } = body;
      if (!company_id) {
        return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: getCorsHeaders(req) });
      }

      const { error } = await adminClient
        .from("companies")
        .update({ is_blocked: !!is_blocked, block_reason: is_blocked ? (block_reason || "Bloqueado pelo administrador.") : null })
        .eq("id", company_id);

      if (error) throw error;
      return jsonOk(req, { success: true });
    }

    // ── update_company_plan ──
    if (action === "update_company_plan") {
      const { plan_id, plan, status, max_users, fiscal_enabled, advanced_reports_enabled, financial_module_level } = body;
      if (!plan_id) {
        return new Response(JSON.stringify({ error: "plan_id required" }), { status: 400, headers: getCorsHeaders(req) });
      }

      const updateData: Record<string, unknown> = {};
      if (plan !== undefined) updateData.plan = plan;
      if (status !== undefined) updateData.status = status;
      if (max_users !== undefined) updateData.max_users = max_users;
      if (fiscal_enabled !== undefined) updateData.fiscal_enabled = fiscal_enabled;
      if (advanced_reports_enabled !== undefined) updateData.advanced_reports_enabled = advanced_reports_enabled;
      if (financial_module_level !== undefined) updateData.financial_module_level = financial_module_level;

      const { error } = await adminClient
        .from("company_plans")
        .update(updateData)
        .eq("id", plan_id);

      if (error) throw error;
      return jsonOk(req, { success: true });
    }

    // ── toggle_demo ──
    if (action === "toggle_demo") {
      const { company_id, is_demo } = body;
      if (!company_id) {
        return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: getCorsHeaders(req) });
      }

      const { error } = await adminClient
        .from("companies")
        .update({ is_demo: !!is_demo })
        .eq("id", company_id);

      if (error) throw error;
      return jsonOk(req, { success: true });
    }

    // ── force_close_cash_session (single) ──
    if (action === "force_close_cash_session") {
      const { session_id } = body;
      if (!session_id) {
        return new Response(JSON.stringify({ error: "session_id required" }), { status: 400, headers: getCorsHeaders(req) });
      }

      const { error } = await adminClient
        .from("cash_sessions")
        .update({ status: "fechado", closed_at: new Date().toISOString(), notes: "[ADMIN_FORCE_CLOSED] Fechado remotamente pelo administrador" })
        .eq("id", session_id);

      if (error) throw error;
      return jsonOk(req, { success: true });
    }

    // ── clear_company_errors ──
    if (action === "clear_company_errors") {
      const { company_id } = body;
      if (!company_id) {
        return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: getCorsHeaders(req) });
      }

      const { error, count } = await adminClient
        .from("system_errors")
        .delete({ count: "exact" })
        .eq("company_id", company_id);

      if (error) throw error;
      return jsonOk(req, { deleted: count || 0 });
    }

    // ── update_whatsapp_support ──
    if (action === "update_whatsapp_support") {
      const { company_id, whatsapp_support } = body;
      if (!company_id) {
        return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: getCorsHeaders(req) });
      }

      const { error } = await adminClient
        .from("companies")
        .update({ whatsapp_support: whatsapp_support || null })
        .eq("id", company_id);

      if (error) throw error;
      return jsonOk(req, { success: true });
    }

    // ── test_alert_channels ──
    // Dispara um alerta de teste nos canais externos configurados
    // (Discord/Slack/Telegram) e retorna o status de cada um.
    if (action === "test_alert_channels") {
      const severity = (body.severity || "warning") as "info" | "warning" | "critical";
      const customMessage =
        typeof body.message === "string" && body.message.trim()
          ? body.message.trim()
          : "Este é um alerta de TESTE enviado pelo painel administrativo. Se você está vendo isso, o canal está funcionando corretamente.";

      const hasDiscord = !!Deno.env.get("ALERT_DISCORD_WEBHOOK_URL");
      const hasSlack = !!Deno.env.get("ALERT_SLACK_WEBHOOK_URL");
      const hasTelegram =
        !!Deno.env.get("ALERT_TELEGRAM_BOT_TOKEN") &&
        !!Deno.env.get("ALERT_TELEGRAM_CHAT_ID");

      const result = await sendExternalAlert({
        title: "🧪 Teste de canal de alertas",
        message: customMessage,
        severity,
        source: "admin-action/test_alert_channels",
        url: "https://anthosystem.com.br/admin",
        fields: {
          enviado_por: userId,
          severidade: severity,
          timestamp: new Date().toISOString(),
        },
      });

      return jsonOk(req, {
        success: true,
        configured: {
          discord: hasDiscord,
          slack: hasSlack,
          telegram: hasTelegram,
        },
        result,
      });
    }

    // ── get_whatsapp_support ──
    if (action === "get_whatsapp_support") {
      const { company_id } = body;
      if (!company_id) {
        return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: getCorsHeaders(req) });
      }

      const { data, error } = await adminClient
        .from("companies")
        .select("whatsapp_support")
        .eq("id", company_id)
        .maybeSingle();

      if (error) throw error;
      return jsonOk(req, { whatsapp_support: data?.whatsapp_support || null });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: getCorsHeaders(req),
    });
  } catch (err: unknown) {
    console.error("admin-action error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: getCorsHeaders(req),
    });
  }
});
