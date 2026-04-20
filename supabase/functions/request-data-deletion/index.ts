/**
 * request-data-deletion
 *
 * LGPD Art. 18, VI — Direito de eliminação.
 *
 * Registra um pedido formal de exclusão dos dados pessoais do titular.
 * O processamento é manual pelo admin, dentro do prazo legal de 15 dias úteis.
 *
 * Regras importantes:
 *  - Dados fiscais (NF-e / NFC-e emitidas) NÃO podem ser eliminados por
 *    obrigação legal de guarda de 5 anos (CONFAZ / Ajuste SINIEF).
 *    Serão anonimizados quando possível e conservados pelo prazo mínimo legal.
 *  - Se o usuário for único administrador ativo de uma empresa, a exclusão fica
 *    condicionada à resolução da empresa (cancelamento/transferência de propriedade).
 *
 * Também envia notificação por e-mail ao admin para ação humana.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DPO_EMAIL = Deno.env.get("DPO_EMAIL") || "contato@anthosystem.com.br";

interface DeletionRequestBody {
  reason?: string;
  confirm_email?: string;
}

interface MembershipRow {
  company_id: string;
  role?: string | null;
  is_active?: boolean | null;
}

async function sendEmail(params: {
  resendKey: string;
  to: string;
  subject: string;
  html: string;
}) {
  return await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.resendKey}`,
    },
    body: JSON.stringify({
      from: "Antho System LGPD <noreply@anthosystem.com.br>",
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as DeletionRequestBody;
    const reason = (body.reason || "").trim();
    const confirmEmail = (body.confirm_email || "").trim().toLowerCase();

    if (!confirmEmail || confirmEmail !== (user.email || "").toLowerCase()) {
      return new Response(
        JSON.stringify({
          error: "E-mail de confirmação não confere com o cadastrado.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Impede duplicata — um pedido pending já existe?
    const { data: existingPending } = await admin
      .from("data_subject_requests")
      .select("id, requested_at")
      .eq("user_id", user.id)
      .eq("type", "deletion")
      .in("status", ["pending", "in_progress"])
      .maybeSingle();

    if (existingPending) {
      return new Response(
        JSON.stringify({
          error: "Você já tem um pedido de exclusão em andamento.",
          existing_request_id: existingPending.id,
          requested_at: existingPending.requested_at,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Detecta se é único admin ativo de alguma empresa
    const { data: memberships } = await admin
      .from("company_users")
      .select("company_id, role, is_active")
      .eq("user_id", user.id);

    const userMemberships: MembershipRow[] = (memberships || []) as MembershipRow[];
    const adminCompanies: string[] = [];
    const companyConstraints: Array<{ company_id: string; total_admins: number }> = [];

    for (const m of userMemberships) {
      const isAdmin = m.role === "admin" || m.role === "owner";
      const isActive = m.is_active !== false;
      if (!isAdmin || !isActive) continue;

      const { count } = await admin
        .from("company_users")
        .select("user_id", { count: "exact", head: true })
        .eq("company_id", m.company_id)
        .in("role", ["admin", "owner"])
        .neq("user_id", user.id);

      const totalOtherAdmins = count ?? 0;
      if (totalOtherAdmins === 0) {
        adminCompanies.push(m.company_id);
      }
      companyConstraints.push({
        company_id: m.company_id,
        total_admins: totalOtherAdmins + 1,
      });
    }

    const blocked = adminCompanies.length > 0;

    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const userAgent = req.headers.get("user-agent") || null;

    const detailsJson = {
      reason: reason || "Não informado",
      blocked_by_sole_admin: blocked,
      sole_admin_of_companies: adminCompanies,
      memberships_snapshot: companyConstraints,
    };

    const { data: inserted, error: insertErr } = await admin
      .from("data_subject_requests")
      .insert({
        user_id: user.id,
        user_email: user.email || "",
        user_name:
          ((user.user_metadata as Record<string, unknown> | null)?.name as
            | string
            | undefined) || null,
        type: "deletion",
        status: "pending",
        details: JSON.stringify(detailsJson),
        ip_address: ip,
        user_agent: userAgent,
      })
      .select("id, requested_at")
      .single();

    if (insertErr) {
      console.error("[request-data-deletion] insert error:", insertErr);
      return new Response(
        JSON.stringify({
          error: "Falha ao registrar pedido.",
          detail: insertErr.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Notifica admin/DPO por e-mail (se resend configurado)
    if (resendKey) {
      try {
        const adminHtml = `
          <h2 style="color:#d32f2f;">🔴 Novo pedido de exclusão — LGPD Art. 18, VI</h2>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; font-size:13px;">
            <tr><td><strong>Usuário</strong></td><td>${user.email} (${user.id})</td></tr>
            <tr><td><strong>Pedido ID</strong></td><td>${inserted.id}</td></tr>
            <tr><td><strong>Recebido em</strong></td><td>${new Date().toLocaleString("pt-BR")}</td></tr>
            <tr><td><strong>Prazo legal</strong></td><td>15 dias úteis (${new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR")})</td></tr>
            <tr><td><strong>Motivo declarado</strong></td><td>${reason || "<em>não informado</em>"}</td></tr>
            <tr><td><strong>Bloqueado por único admin?</strong></td><td>${blocked ? "⚠️ SIM — empresas: " + adminCompanies.join(", ") : "Não"}</td></tr>
            <tr><td><strong>IP</strong></td><td>${ip || "n/a"}</td></tr>
          </table>
          <p style="margin-top:16px;">
            <strong>Ação necessária:</strong> acessar o painel admin,
            revisar o pedido e executar o processamento.
            ${
              blocked
                ? '<br/><br/><strong style="color:#d32f2f;">ATENÇÃO:</strong> Este usuário é único admin de uma ou mais empresas. A exclusão precisa de resolução da empresa (cancelamento ou transferência) antes de ser processada.'
                : ""
            }
          </p>
          <p style="font-size:11px; color:#666;">
            Obrigações de retenção fiscal (NF-e, NFC-e) devem ser respeitadas:
            anonimize, não exclua fisicamente documentos fiscais.
          </p>
        `;

        await sendEmail({
          resendKey,
          to: DPO_EMAIL,
          subject: `🔴 LGPD — Pedido de exclusão recebido (${user.email})`,
          html: adminHtml,
        });

        // Confirmação para o titular
        const userHtml = `
          <h2>Recebemos seu pedido de exclusão</h2>
          <p>Olá,</p>
          <p>Confirmamos o recebimento da sua solicitação de eliminação dos dados pessoais registrados em nosso sistema, conforme seu direito garantido pelo art. 18, VI da LGPD (Lei nº 13.709/2018).</p>
          <ul>
            <li><strong>Protocolo:</strong> ${inserted.id}</li>
            <li><strong>Data do pedido:</strong> ${new Date().toLocaleString("pt-BR")}</li>
            <li><strong>Prazo de atendimento:</strong> até 15 dias úteis (${new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR")})</li>
          </ul>
          ${
            blocked
              ? `
          <div style="background:#fff3cd; border:1px solid #ffc107; padding:12px; border-radius:6px; margin:16px 0;">
            <strong>Atenção:</strong> Identificamos que você é único administrador de uma ou mais empresas cadastradas. Antes da exclusão dos seus dados pessoais, será necessário definir o destino da(s) empresa(s) — cancelamento ou transferência de titularidade. Entraremos em contato para resolver isso.
          </div>`
              : ""
          }
          <p>Nosso time irá analisar seu pedido e retornar com um status em até 15 dias úteis. Dados sujeitos a obrigação legal de retenção (documentos fiscais emitidos, por exemplo) não podem ser eliminados, mas serão anonimizados sempre que possível.</p>
          <p>Se tiver dúvidas, responda este e-mail ou entre em contato:</p>
          <p>— Equipe AnthoSystem</p>
        `;

        await sendEmail({
          resendKey,
          to: user.email!,
          subject: `Pedido de exclusão LGPD recebido — Protocolo ${inserted.id.slice(0, 8)}`,
          html: userHtml,
        });
      } catch (mailErr) {
        console.warn("[request-data-deletion] email failed:", mailErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        request_id: inserted.id,
        requested_at: inserted.requested_at,
        deadline: new Date(
          Date.now() + 15 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        blocked_by_sole_admin: blocked,
        sole_admin_of_companies: adminCompanies,
        message: blocked
          ? "Pedido registrado. Como você é único admin de uma ou mais empresas, entraremos em contato para resolver a titularidade antes da exclusão."
          : "Pedido registrado com sucesso. Você receberá um e-mail de confirmação e um retorno em até 15 dias úteis.",
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    console.error("[request-data-deletion] error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
