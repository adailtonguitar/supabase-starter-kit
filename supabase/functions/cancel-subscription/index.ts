/**
 * cancel-subscription
 *
 * Solicita cancelamento da assinatura do cliente.
 *
 * Regras de negócio:
 *  - Cliente mantém acesso até `cancel_effective_date` (= subscription_end atual).
 *  - Sistema NÃO cobra próxima renovação (renovação aqui é manual, disparada
 *    pelo próprio cliente em /renovar — se status=scheduled_cancel, o front
 *    não oferece mais esse botão).
 *  - Se o cancelamento for solicitado dentro de 7 dias do último pagamento
 *    aprovado (CDC art. 49 — direito de arrependimento), marca refund_requested
 *    e registra o valor a ser reembolsado. O reembolso em si é feito
 *    manualmente no painel do MP pelo admin.
 *  - Motivo é OBRIGATÓRIO.
 *  - Detalhe livre é obrigatório quando motivo = 'other'.
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

const ALLOWED_REASONS = new Set([
  "price_too_high",
  "low_usage",
  "missing_features",
  "bugs_issues",
  "poor_support",
  "switched_provider",
  "business_closed",
  "other",
]);

const REFUND_WINDOW_DAYS = 7;

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  req: Request,
): Response {
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
      console.error("[cancel-subscription] Missing env vars");
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

    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason : null;
    const reasonDetails = typeof body?.reason_details === "string" ? body.reason_details.trim() : "";
    const requestRefund = body?.request_refund === true;

    if (!reason || !ALLOWED_REASONS.has(reason)) {
      return jsonResponse({ error: "Motivo inválido ou ausente" }, 400, req);
    }
    if (reason === "other" && reasonDetails.length < 5) {
      return jsonResponse(
        { error: 'Quando o motivo é "Outro", detalhe o motivo com pelo menos 5 caracteres.' },
        400,
        req,
      );
    }

    // Busca assinatura ativa do usuário
    const { data: subscription, error: subErr } = await admin
      .from("subscriptions")
      .select(
        "id, user_id, company_id, plan_key, status, subscription_end, canceled_at",
      )
      .eq("user_id", userId)
      .in("status", ["active", "scheduled_cancel"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr) {
      console.error("[cancel-subscription] DB error fetching sub:", subErr);
      return jsonResponse({ error: "Erro ao buscar assinatura" }, 500, req);
    }
    if (!subscription) {
      return jsonResponse(
        { error: "Nenhuma assinatura ativa encontrada para cancelar" },
        404,
        req,
      );
    }
    if (subscription.status === "scheduled_cancel") {
      return jsonResponse(
        {
          error: "Sua assinatura já está agendada para cancelamento.",
          cancel_effective_date: subscription.canceled_at,
        },
        409,
        req,
      );
    }

    // Busca último pagamento aprovado para calcular elegibilidade de arrependimento (7 dias)
    const { data: lastPayment } = await admin
      .from("payments")
      .select("id, amount, status, created_at, approved_at")
      .eq("user_id", userId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const paymentDateStr =
      (lastPayment?.approved_at as string | null) ??
      (lastPayment?.created_at as string | null) ??
      null;
    const paymentDate = paymentDateStr ? new Date(paymentDateStr) : null;
    const daysSincePayment = paymentDate
      ? Math.floor((Date.now() - paymentDate.getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const withinRefundWindow =
      daysSincePayment !== null && daysSincePayment <= REFUND_WINDOW_DAYS;

    const refundEligible = withinRefundWindow && Boolean(lastPayment?.amount);
    const willRefund = requestRefund && refundEligible;

    // Se cliente pediu reembolso mas não é elegível, falha explicitamente
    if (requestRefund && !refundEligible) {
      return jsonResponse(
        {
          error:
            "Pedido de reembolso fora do prazo de 7 dias do último pagamento (CDC art. 49). Você pode cancelar assinatura, mas sem reembolso.",
          days_since_payment: daysSincePayment,
        },
        409,
        req,
      );
    }

    const nowIso = new Date().toISOString();
    const effectiveDate = subscription.subscription_end || nowIso;

    // Atualização atômica
    const updatePayload: Record<string, unknown> = {
      status: "scheduled_cancel",
      canceled_at: nowIso,
      cancel_effective_date: effectiveDate,
      cancel_reason: reason,
      cancel_reason_details: reasonDetails || null,
      canceled_by: userId,
    };

    if (willRefund) {
      updatePayload.refund_requested = true;
      updatePayload.refund_status = "pending";
      updatePayload.refund_amount = lastPayment?.amount ?? null;
    }

    const { error: updErr } = await admin
      .from("subscriptions")
      .update(updatePayload)
      .eq("id", subscription.id);

    if (updErr) {
      console.error("[cancel-subscription] DB error updating sub:", updErr);
      return jsonResponse({ error: "Erro ao registrar cancelamento" }, 500, req);
    }

    // Log da ação (se action_logs existir; ignora silenciosamente senão)
    try {
      await admin.from("action_logs").insert({
        user_id: userId,
        company_id: subscription.company_id,
        action: "subscription_canceled",
        entity_type: "subscriptions",
        entity_id: subscription.id,
        metadata: {
          reason,
          reason_details: reasonDetails || null,
          refund_requested: willRefund,
          refund_amount: willRefund ? lastPayment?.amount : null,
          days_since_payment: daysSincePayment,
        },
      });
    } catch (logErr) {
      console.warn("[cancel-subscription] Failed to log action:", logErr);
    }

    console.log("[cancel-subscription] OK", {
      subscription_id: subscription.id,
      user_id: userId,
      reason,
      refund: willRefund,
    });

    return jsonResponse(
      {
        success: true,
        subscription_id: subscription.id,
        status: "scheduled_cancel",
        cancel_effective_date: effectiveDate,
        refund: willRefund
          ? {
              requested: true,
              status: "pending",
              amount: lastPayment?.amount ?? null,
              message:
                "Seu reembolso está pendente de processamento. Nosso time vai estornar no Mercado Pago em até 5 dias úteis.",
            }
          : {
              requested: false,
              eligible: refundEligible,
              message: refundEligible
                ? "Você está dentro do prazo de arrependimento, mas optou por não solicitar reembolso."
                : `Fora do prazo de arrependimento de ${REFUND_WINDOW_DAYS} dias.`,
            },
      },
      200,
      req,
    );
  } catch (error: unknown) {
    console.error("[cancel-subscription] Unexpected error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return jsonResponse({ error: msg }, 500, req);
  }
});
