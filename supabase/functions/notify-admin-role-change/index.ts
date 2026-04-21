/**
 * notify-admin-role-change
 *
 * Chamada pelo trigger tg_admin_roles_audit() quando qualquer mudança
 * envolvendo 'super_admin' acontece em public.admin_roles. Dispara alerta
 * externo (Discord/Slack/Telegram) com severidade CRÍTICA.
 *
 * Segurança: a função é chamada apenas pelo próprio banco via pg_net com
 * o SUPABASE_SERVICE_ROLE_KEY. Exigimos esse header e rejeitamos qualquer
 * outra origem.
 *
 * Payload esperado:
 *   {
 *     event_type: "INSERT" | "UPDATE" | "DELETE",
 *     actor_id: string | null,
 *     target_user_id: string,
 *     old_role: string | null,
 *     new_role: string | null,
 *     ip: string | null,
 *     user_agent: string | null,
 *     at: string (ISO)
 *   }
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendExternalAlert } from "../_shared/alerts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  event_type: "INSERT" | "UPDATE" | "DELETE";
  actor_id: string | null;
  target_user_id: string;
  old_role: string | null;
  new_role: string | null;
  ip: string | null;
  user_agent: string | null;
  at: string;
}

function describeEvent(p: Payload): { title: string; summary: string } {
  const who = p.target_user_id.slice(0, 8);
  if (p.event_type === "INSERT" && p.new_role === "super_admin") {
    return {
      title: "🚨 NOVO super_admin criado",
      summary: `Usuário ${who} recebeu role super_admin.`,
    };
  }
  if (p.event_type === "DELETE" && p.old_role === "super_admin") {
    return {
      title: "🚨 super_admin removido",
      summary: `Usuário ${who} perdeu role super_admin.`,
    };
  }
  if (p.event_type === "UPDATE") {
    return {
      title: "🚨 Role admin alterada",
      summary: `Usuário ${who} mudou de ${p.old_role ?? "—"} para ${p.new_role ?? "—"}.`,
    };
  }
  return {
    title: "Mudança em admin_roles",
    summary: `event=${p.event_type} target=${who} old=${p.old_role ?? "—"} new=${p.new_role ?? "—"}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceKey || !supabaseUrl) {
      return new Response(JSON.stringify({ error: "Missing env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Autenticação: só aceita chamadas do DB via pg_net com service_role.
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader !== `Bearer ${serviceKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as Payload;

    // Enriquecer com e-mails
    const admin = createClient(supabaseUrl, serviceKey);
    let actorEmail: string | null = null;
    let targetEmail: string | null = null;

    if (payload.actor_id) {
      const { data } = await admin.auth.admin.getUserById(payload.actor_id);
      actorEmail = data?.user?.email ?? null;
    }
    {
      const { data } = await admin.auth.admin.getUserById(payload.target_user_id);
      targetEmail = data?.user?.email ?? null;
    }

    const { title, summary } = describeEvent(payload);

    const lines = [
      summary,
      "",
      `**Alvo:** ${targetEmail ?? payload.target_user_id}`,
      `**Ator:** ${actorEmail ?? payload.actor_id ?? "sistema / SQL direto"}`,
      `**Quando:** ${new Date(payload.at).toLocaleString("pt-BR")}`,
      payload.ip ? `**IP:** ${payload.ip}` : null,
      payload.user_agent ? `**UA:** ${payload.user_agent.slice(0, 100)}` : null,
      "",
      payload.actor_id
        ? "✓ Feito por conta autenticada."
        : "⚠️ Sem actor_id — possivelmente SQL direto no Supabase Studio ou script. Verifique auditoria do banco.",
    ].filter(Boolean).join("\n");

    const result = await sendExternalAlert({
      title,
      message: lines,
      severity: "critical",
      source: "notify-admin-role-change",
      url: "https://anthosystem.com.br/admin",
      fields: {
        event: payload.event_type,
        old_role: payload.old_role,
        new_role: payload.new_role,
        actor: actorEmail ?? payload.actor_id,
        target: targetEmail ?? payload.target_user_id,
      },
    });

    return new Response(
      JSON.stringify({ ok: true, result, event: payload.event_type }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[notify-admin-role-change] error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
