// ============================================================================
// process-dunning
// ----------------------------------------------------------------------------
// Roda diariamente (ex.: pg_cron 06:00 BRT → supabase.functions.invoke).
// Para cada assinatura com subscription_end no passado ou próximo de vencer:
//   1) calcula novo grace_stage via compute_grace_stage()
//   2) se mudou, grava dunning_events + atualiza subscription.grace_stage
//   3) envia e-mail progressivo (3d antes / vencida / overdue grave)
//      — no máx 1 notificação por 20h, ignora se já notificou naquele stage
//
// SEGURO: idempotente. Roda várias vezes sem efeito colateral.
// Exige role service_role (SUPABASE_SERVICE_ROLE_KEY).
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendExternalAlert } from "../_shared/alerts.ts";

const MIN_HOURS_BETWEEN_NOTIFY = 20;

const ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
  "https://anthosystem.com.br",
  "https://www.anthosystem.com.br",
];

function corsFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
}

interface DunningTarget {
  subscription_id: string;
  company_id: string | null;
  user_id: string | null;
  plan_key: string;
  status: string;
  subscription_end: string;
  current_stage: string | null;
  computed_stage: string | null;
  dunning_last_notified_at: string | null;
  dunning_notification_count: number;
  company_name: string | null;
  company_email: string | null;
  payment_retry_count: number;
  payment_failed_at: string | null;
}

const PLAN_PRICES: Record<string, number> = {
  emissor: 99.9,
  starter: 149.9,
  business: 199.9,
  pro: 349.9,
};

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 3_600_000;
}

function formatBR(dateISO: string): string {
  try {
    return new Date(dateISO).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return dateISO;
  }
}

function buildEmail(
  stage: string,
  target: DunningTarget,
  daysUntil: number,
  daysOver: number,
): { subject: string; html: string } {
  const companyName = target.company_name ?? "sua empresa";
  const plan = target.plan_key.toUpperCase();
  const price = PLAN_PRICES[target.plan_key]?.toFixed(2).replace(".", ",") ?? "—";
  const renewUrl = "https://anthosystem.com.br/renovar";

  if (stage === "pre_due" && daysUntil <= 3) {
    return {
      subject: `Sua assinatura Antho vence em ${daysUntil} dia(s)`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#0f172a">Olá, ${companyName}!</h2>
          <p>Sua assinatura <strong>${plan}</strong> (R$ ${price}/mês) vence em
          <strong>${daysUntil} dia(s)</strong> — ${formatBR(target.subscription_end)}.</p>
          <p>Para evitar interrupção, renove agora:</p>
          <p><a href="${renewUrl}" style="background:#16a34a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">Renovar assinatura</a></p>
          <p style="color:#64748b;font-size:12px">Se já pagou, ignore este e-mail.</p>
        </div>`,
    };
  }

  if (stage === "warning") {
    return {
      subject: `Pagamento pendente — seu plano Antho venceu há ${daysOver} dia(s)`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#b45309">Pagamento pendente</h2>
          <p>Olá, ${companyName}! Sua assinatura <strong>${plan}</strong> venceu em
          ${formatBR(target.subscription_end)}.</p>
          <p>Você ainda tem acesso total, mas em <strong>${Math.max(0, 4 - daysOver)} dia(s)</strong> seu sistema entrará em modo somente-leitura
          (você poderá ver os dados mas não emitir nem cadastrar nada).</p>
          <p><a href="${renewUrl}" style="background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">Renovar agora</a></p>
          <p style="color:#64748b;font-size:12px">Dúvidas? suporte@anthosystem.com.br</p>
        </div>`,
    };
  }

  if (stage === "readonly") {
    return {
      subject: `Sistema em modo somente-leitura — ${daysOver} dias sem renovação`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#b91c1c">Sua conta está em modo somente-leitura</h2>
          <p>Olá, ${companyName}. Seu plano <strong>${plan}</strong> está vencido há
          <strong>${daysOver} dia(s)</strong> e entrou em modo restrito. Você consegue ver relatórios
          e dados, mas não pode emitir NF-e, fechar venda nem cadastrar produtos.</p>
          <p>Em <strong>${Math.max(0, 15 - daysOver)} dia(s)</strong> o acesso será totalmente bloqueado.</p>
          <p><a href="${renewUrl}" style="background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">Renovar assinatura</a></p>
        </div>`,
    };
  }

  return {
    subject: `Sua conta Antho foi bloqueada — ${daysOver} dias sem pagamento`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#7f1d1d">Acesso bloqueado</h2>
        <p>Olá, ${companyName}. Seu plano está vencido há <strong>${daysOver} dias</strong>
        e o acesso foi temporariamente suspenso.</p>
        <p>Renove agora para recuperar imediatamente:</p>
        <p><a href="${renewUrl}" style="background:#7f1d1d;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">Renovar e reativar</a></p>
        <p style="color:#64748b;font-size:12px">Seus dados estão preservados e serão restaurados após o pagamento.</p>
      </div>`,
  };
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Antho System <noreply@anthosystem.com.br>",
        to: [to],
        subject,
        html,
      }),
    });
    return r.ok;
  } catch (e) {
    console.error("[process-dunning] resend error", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsFor(req) });
  }

  const startedAt = Date.now();
  const summary = {
    scanned: 0,
    stage_transitions: 0,
    notifications_sent: 0,
    notifications_failed: 0,
    errors: [] as string[],
  };

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: targets, error } = await admin
      .from("dunning_targets")
      .select("*")
      .returns<DunningTarget[]>();

    if (error) throw error;
    summary.scanned = targets?.length ?? 0;

    const now = new Date();

    for (const t of targets ?? []) {
      try {
        const endDate = new Date(t.subscription_end);
        const daysUntil = Math.ceil((endDate.getTime() - now.getTime()) / 86_400_000);
        const daysOver = daysBetween(endDate, now);
        const newStage = t.computed_stage; // null | warning | readonly | blocked
        const prevStage = t.current_stage;

        // 1) Atualiza stage se mudou
        if (newStage !== prevStage) {
          const { error: updErr } = await admin
            .from("subscriptions")
            .update({ grace_stage: newStage })
            .eq("id", t.subscription_id);

          if (!updErr) {
            summary.stage_transitions++;
            await admin.from("dunning_events").insert({
              subscription_id: t.subscription_id,
              company_id: t.company_id,
              user_id: t.user_id,
              event_type: "stage_changed",
              previous_stage: prevStage,
              new_stage: newStage,
              meta: { days_over: daysOver, subscription_end: t.subscription_end },
            });
          } else {
            summary.errors.push(`update_stage_${t.subscription_id}: ${updErr.message}`);
          }
        }

        // 2) Decide se precisa notificar
        const lastNotified = t.dunning_last_notified_at ? new Date(t.dunning_last_notified_at) : null;
        const hoursSinceLast = lastNotified ? hoursBetween(lastNotified, now) : Infinity;
        const cooldownOk = hoursSinceLast >= MIN_HOURS_BETWEEN_NOTIFY;

        let notifyStage: string | null = null;
        if (newStage === null && daysUntil >= 0 && daysUntil <= 3 && cooldownOk) {
          notifyStage = "pre_due";
        } else if (newStage && (newStage !== prevStage || cooldownOk)) {
          notifyStage = newStage; // warning | readonly | blocked
        }

        if (notifyStage && t.company_email) {
          const { subject, html } = buildEmail(notifyStage, t, Math.max(0, daysUntil), daysOver);
          const ok = await sendEmail(t.company_email, subject, html);
          if (ok) {
            summary.notifications_sent++;
            await admin
              .from("subscriptions")
              .update({
                dunning_last_notified_at: now.toISOString(),
                dunning_notification_count: t.dunning_notification_count + 1,
              })
              .eq("id", t.subscription_id);

            await admin.from("dunning_events").insert({
              subscription_id: t.subscription_id,
              company_id: t.company_id,
              user_id: t.user_id,
              event_type: `reminder_sent_${notifyStage}`,
              new_stage: newStage,
              meta: { days_until: daysUntil, days_over: daysOver, email: t.company_email },
            });
          } else {
            summary.notifications_failed++;
          }
        }
      } catch (err) {
        summary.errors.push(
          `target_${t.subscription_id}: ${err instanceof Error ? err.message : "?"}`,
        );
      }
    }

    // 3) Alerta externo opcional para admin se muitos overdue
    if (summary.stage_transitions > 0) {
      sendExternalAlert({
        title: "Dunning diário processado",
        message: `${summary.scanned} assinaturas analisadas. ${summary.stage_transitions} transições de estágio e ${summary.notifications_sent} e-mails enviados.`,
        severity: summary.errors.length > 0 ? "warning" : "info",
        source: "process-dunning",
        fields: {
          scanned: summary.scanned,
          transitions: summary.stage_transitions,
          notified: summary.notifications_sent,
          failed: summary.notifications_failed,
          errors: summary.errors.length,
        },
      }).catch(() => { /* best-effort */ });
    }

    return new Response(
      JSON.stringify({ ok: true, elapsed_ms: Date.now() - startedAt, ...summary }),
      { status: 200, headers: corsFor(req) },
    );
  } catch (err) {
    console.error("[process-dunning] fatal", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
        ...summary,
      }),
      { status: 500, headers: corsFor(req) },
    );
  }
});
