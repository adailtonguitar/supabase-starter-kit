import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
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

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * Build a PDF-like HTML report and return it as base64.
 * jsPDF is incompatible with Deno runtime, so we generate
 * an HTML document that Resend will attach as a styled HTML file,
 * or we encode a minimal text-based PDF manually.
 */
function buildReportHtml(
  companyName: string,
  cnpj: string,
  accountantName: string,
  period: string,
  nfeCount: number,
  nfceCount: number,
  totalValue: number,
  salesCount: number,
  salesTotal: number,
): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório Fiscal ${period} — ${companyName}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; color: #333; padding: 24px; }
    .header { background: #1a1a2e; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { color: #4ade80; margin: 0; font-size: 22px; }
    .header p { color: #94a3b8; margin: 8px 0 0; font-size: 14px; }
    .body-section { background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background: #e2e8f0; text-align: left; padding: 8px 12px; font-size: 13px; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    td.value { text-align: right; font-weight: bold; }
    .footer { background: #1a1a2e; padding: 16px; text-align: center; border-radius: 0 0 8px 8px; }
    .footer p { color: #64748b; margin: 0; font-size: 11px; }
    .note { font-size: 11px; color: #64748b; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Relatório Fiscal Mensal</h1>
    <p>${companyName} — ${period}</p>
  </div>
  <div class="body-section">
    <p>Prezado(a) <strong>${accountantName}</strong>,</p>
    <p>Segue o resumo fiscal do período <strong>${period}</strong> da empresa <strong>${companyName}</strong> (CNPJ: ${cnpj}):</p>
    <table>
      <thead><tr><th>Indicador</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>
        <tr><td>NF-e emitidas (Modelo 55)</td><td class="value">${nfeCount}</td></tr>
        <tr><td>NFC-e emitidas (Modelo 65)</td><td class="value">${nfceCount}</td></tr>
        <tr><td>Total documentos fiscais</td><td class="value">${formatCurrency(totalValue)}</td></tr>
        <tr><td>Vendas no período</td><td class="value">${salesCount} vendas</td></tr>
        <tr><td>Faturamento total</td><td class="value">${formatCurrency(salesTotal)}</td></tr>
      </tbody>
    </table>
    <p class="note">Este relatório foi gerado automaticamente pelo sistema AnthoSystem.</p>
  </div>
  <div class="footer">
    <p>AnthoSystem — Sistema de Gestão Comercial</p>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: "E-mail do contador é obrigatório" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get user's company
    const { data: cu } = await adminClient
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!cu?.company_id) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const companyId = cu.company_id;

    // Block demo accounts from sending emails
    const { data: companyDemo } = await adminClient
      .from("companies")
      .select("is_demo")
      .eq("id", companyId)
      .maybeSingle();
    if (companyDemo?.is_demo === true) {
      return new Response(
        JSON.stringify({ error: "Envio de e-mails não disponível em contas de demonstração." }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Get company info
    const { data: company } = await adminClient
      .from("companies")
      .select("name, cnpj, accountant_name")
      .eq("id", companyId)
      .single();

    // Determine period (previous month)
    const now = new Date();
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const period = `${String(prevMonth).padStart(2, "0")}/${prevYear}`;

    const startDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
    const endMonth = prevMonth === 12 ? 1 : prevMonth + 1;
    const endYear = prevMonth === 12 ? prevYear + 1 : prevYear;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    // Get fiscal documents summary
    const { data: docs } = await adminClient
      .from("fiscal_documents")
      .select("doc_type, status, total_value")
      .eq("company_id", companyId)
      .gte("created_at", startDate)
      .lt("created_at", endDate);

    const fiscalDocs = docs || [];
    const nfeCount = fiscalDocs.filter((d: any) => d.doc_type === "nfe" && d.status === "autorizado").length;
    const nfceCount = fiscalDocs.filter((d: any) => d.doc_type === "nfce" && d.status === "autorizado").length;
    const totalValue = fiscalDocs
      .filter((d: any) => d.status === "autorizado")
      .reduce((sum: number, d: any) => sum + (d.total_value || 0), 0);

    // Get sales summary
    const { data: sales } = await adminClient
      .from("sales")
      .select("total")
      .eq("company_id", companyId)
      .gte("created_at", startDate)
      .lt("created_at", endDate);

    const salesTotal = (sales || []).reduce((sum: number, s: any) => sum + (s.total || 0), 0);
    const salesCount = (sales || []).length;

    const companyName = company?.name || "Empresa";
    const cnpj = (company as any)?.cnpj || "—";
    const accountantName = (company as any)?.accountant_name || "Contador(a)";

    // Generate HTML report (Deno-compatible, no jsPDF dependency)
    const reportHtml = buildReportHtml(companyName, cnpj, accountantName, period, nfeCount, nfceCount, totalValue, salesCount, salesTotal);
    const reportBase64 = btoa(unescape(encodeURIComponent(reportHtml)));

    // Build email HTML
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #1a1a2e; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: #4ade80; margin: 0; font-size: 20px;">📊 Relatório Fiscal Mensal</h1>
          <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">${companyName} — ${period}</p>
        </div>
        <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0;">
          <p>Prezado(a) <strong>${accountantName}</strong>,</p>
          <p>Segue em anexo o relatório fiscal do período <strong>${period}</strong> da empresa <strong>${companyName}</strong> (CNPJ: ${cnpj}).</p>
          <p style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 12px; font-size: 13px;">
            📎 <strong>Arquivo anexado:</strong> Relatório_Fiscal_${period.replace("/", "-")}.html
          </p>
          <p style="font-size: 12px; color: #64748b; margin: 16px 0 0;">
            Este relatório foi gerado automaticamente pelo sistema AnthoSystem.
          </p>
        </div>
        <div style="background: #1a1a2e; padding: 16px; text-align: center; border-radius: 0 0 8px 8px;">
          <p style="color: #64748b; margin: 0; font-size: 11px;">AnthoSystem — Sistema de Gestão Comercial</p>
        </div>
      </div>
    `;

    // Send via Resend with HTML attachment
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurada" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "AnthoSystem <noreply@anthosystem.com.br>",
        to: [email],
        subject: `Relatório Fiscal ${period} — ${companyName}`,
        html: htmlBody,
        attachments: [
          {
            filename: `Relatorio_Fiscal_${period.replace("/", "-")}_${companyName.replace(/\s+/g, "_")}.html`,
            content: reportBase64,
          },
        ],
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("[send-accountant-report] Resend error:", errText);
      return new Response(JSON.stringify({ error: "Falha ao enviar e-mail. Verifique o endereço." }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent_to: email,
        period,
        nfe_count: nfeCount,
        nfce_count: nfceCount,
        has_attachment: true,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    console.error("[send-accountant-report] Error:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
