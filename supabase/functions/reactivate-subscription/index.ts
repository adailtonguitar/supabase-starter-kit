/**
 * reactivate-subscription
 *
 * Permite ao cliente desfazer o cancelamento enquanto ainda tem acesso
 * (status = scheduled_cancel e cancel_effective_date no futuro).
 *
 * Se já havia pedido de reembolso pendente, o reembolso é anulado
 * (refund_status passa a 'denied' com nota explicativa).
 */

import { createClient } from "npm:@supabase/supabase-js@2";

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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401, req);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[reactivate-subscription] Missing env vars");
      return jsonResponse({ error: "Server misconfigured" }, 500, req);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401, req);
    }
    const userId = userData.user.id;

    const { data: subscription, error: subErr } = await admin
      .from("subscriptions")
      .select(
        "id, status, subscription_end, cancel_effective_date, refund_status, refund_requested",
      )
      .eq("user_id", userId)
      .eq("status", "scheduled_cancel")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr) {
      console.error("[reactivate-subscription] DB error:", subErr);
      return jsonResponse({ error: "Erro ao buscar assinatura" }, 500, req);
    }
    if (!subscription) {
      return jsonResponse(
        { error: "Nenhuma assinatura agendada para cancelamento encontrada." },
        404,
        req,
      );
    }

    // Se já passou da data efetiva, não pode reativar (precisa renovar via checkout)
    const effectiveDate = subscription.cancel_effective_date
      ? new Date(subscription.cancel_effective_date as string)
      : null;
    if (effectiveDate && effectiveDate.getTime() <= Date.now()) {
      return jsonResponse(
        {
          error:
            "O período já expirou. Para voltar a usar, por favor faça uma nova assinatura em /renovar.",
        },
        409,
        req,
      );
    }

    const updatePayload: Record<string, unknown> = {
      status: "active",
      canceled_at: null,
      cancel_effective_date: null,
      cancel_reason: null,
      cancel_reason_details: null,
      canceled_by: null,
    };

    // Se havia reembolso pendente, anula o pedido (cliente voltou atrás)
    let refundCanceled = false;
    if (subscription.refund_requested && subscription.refund_status === "pending") {
      updatePayload.refund_requested = false;
      updatePayload.refund_status = "denied";
      updatePayload.refund_notes = "Pedido anulado pelo próprio cliente ao reativar a assinatura.";
      refundCanceled = true;
    }

    const { error: updErr } = await admin
      .from("subscriptions")
      .update(updatePayload)
      .eq("id", subscription.id);

    if (updErr) {
      console.error("[reactivate-subscription] Update error:", updErr);
      return jsonResponse({ error: "Erro ao reativar assinatura" }, 500, req);
    }

    try {
      await admin.from("action_logs").insert({
        user_id: userId,
        action: "subscription_reactivated",
        entity_type: "subscriptions",
        entity_id: subscription.id,
        metadata: { refund_canceled: refundCanceled },
      });
    } catch (logErr) {
      console.warn("[reactivate-subscription] Failed to log action:", logErr);
    }

    return jsonResponse(
      {
        success: true,
        subscription_id: subscription.id,
        status: "active",
        refund_canceled: refundCanceled,
        message: refundCanceled
          ? "Assinatura reativada. Seu pedido de reembolso foi anulado."
          : "Assinatura reativada com sucesso.",
      },
      200,
      req,
    );
  } catch (error: unknown) {
    console.error("[reactivate-subscription] Unexpected error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return jsonResponse({ error: msg }, 500, req);
  }
});
