// Edge Function: notify-fiscal-radar
// Envia e-mail ao(s) dono(s) de uma empresa com a lista de produtos
// em risco fiscal detectados pelo Radar Fiscal.
// ANTI-QUEBRA: não toca em XML, emissão, cálculo de imposto ou ST.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface IssueItem {
  product_id: string;
  name: string;
  cfop: string | null;
  score: number;
  problem: string;
  suggestion?: string | null;
  sales_30d?: number;
}

interface Payload {
  company_id: string;
  items: IssueItem[];
  note?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) {
      return json({ error: "RESEND_API_KEY não configurada" }, 500);
    }

    // 1) Validate caller is super_admin
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from("admin_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (roleRow?.role !== "super_admin") {
      return json({ error: "Acesso negado: requer super_admin" }, 403);
    }

    // 2) Parse payload
    let body: Payload;
    try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    if (!body?.company_id || !Array.isArray(body.items) || body.items.length === 0) {
      return json({ error: "company_id e items são obrigatórios" }, 400);
    }

    // 3) Fetch company + owners
    const { data: company } = await admin
      .from("companies")
      .select("id, name, trade_name, email")
      .eq("id", body.company_id)
      .maybeSingle();
    if (!company) return json({ error: "Empresa não encontrada" }, 404);

    const { data: members } = await admin
      .from("company_users")
      .select("user_id, role")
      .eq("company_id", body.company_id)
      .eq("is_active", true)
      .in("role", ["admin", "gerente"]);

    const userIds = (members || []).map((m: any) => m.user_id);
    const recipients = new Set<string>();
    if (company.email) recipients.add(String(company.email).toLowerCase().trim());

    if (userIds.length > 0) {
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of users?.users || []) {
        if (userIds.includes(u.id) && u.email) recipients.add(u.email.toLowerCase().trim());
      }
    }

    if (recipients.size === 0) {
      return json({ error: "Nenhum e-mail de destino encontrado para esta empresa" }, 422);
    }

    // 4) Build email
    const companyName = company.trade_name || company.name || "sua empresa";
    const critical = body.items.filter(i => i.score >= 80);
    const warn = body.items.filter(i => i.score >= 40 && i.score < 80);

    const rows = body.items.slice(0, 50).map(i => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(i.name)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-family:monospace">${escapeHtml(i.cfop || "—")}${i.suggestion ? ` → <b>${escapeHtml(i.suggestion)}</b>` : ""}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(i.problem)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace"><b>${i.score}</b></td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${i.sales_30d ?? 0}</td>
      </tr>`).join("");

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;color:#0f172a">
        <h2 style="margin:0 0 8px">⚠️ Radar Fiscal — ${escapeHtml(companyName)}</h2>
        <p style="color:#475569;margin:0 0 16px">
          Detectamos <b>${critical.length} produto(s) crítico(s)</b> e <b>${warn.length} alerta(s)</b> no cadastro fiscal da sua empresa.
          Isso pode causar rejeição na SEFAZ ou autuação fiscal. Recomendamos correção imediata.
        </p>
        ${body.note ? `<p style="background:#fef9c3;padding:12px;border-radius:8px;margin:0 0 16px"><b>Mensagem do suporte:</b><br>${escapeHtml(body.note)}</p>` : ""}
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
          <thead><tr style="background:#f1f5f9;text-align:left">
            <th style="padding:8px">Produto</th>
            <th style="padding:8px">CFOP</th>
            <th style="padding:8px">Problema</th>
            <th style="padding:8px;text-align:right">Score</th>
            <th style="padding:8px;text-align:right">Vendas 30d</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${body.items.length > 50 ? `<p style="color:#64748b;font-size:12px">+ ${body.items.length - 50} item(ns) não exibido(s).</p>` : ""}
        <p style="margin-top:24px;color:#475569;font-size:13px">
          Acesse <b>Fiscal → Radar Fiscal</b> no sistema para ver o relatório completo e corrigir os cadastros.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:11px">Este e-mail foi enviado pelo Anthosystem (Radar Fiscal). Suporte: contato@anthosystem.com.br</p>
      </div>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Anthosystem <contato@anthosystem.com.br>",
        to: Array.from(recipients),
        subject: `⚠️ Radar Fiscal: ${critical.length} produto(s) crítico(s) em ${companyName}`,
        html,
      }),
    });

    const resendText = await resendRes.text();
    if (!resendRes.ok) {
      console.error("[notify-fiscal-radar] Resend error:", resendRes.status, resendText);
      return json({ error: "Falha ao enviar e-mail", status: resendRes.status, details: resendText }, 502);
    }

    console.log("[notify-fiscal-radar] sent", {
      company_id: body.company_id,
      recipients: Array.from(recipients),
      critical: critical.length,
      warn: warn.length,
    });

    return json({
      ok: true,
      sent_to: Array.from(recipients),
      critical: critical.length,
      warn: warn.length,
    });
  } catch (e) {
    console.error("[notify-fiscal-radar] fatal:", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}
