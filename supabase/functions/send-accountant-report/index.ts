import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "npm:jspdf@2.5.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function buildPdf(
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
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(26, 26, 46);
  doc.rect(0, 0, pw, 35, "F");
  doc.setTextColor(74, 222, 128);
  doc.setFontSize(18);
  doc.text("Relatório Fiscal Mensal", pw / 2, 16, { align: "center" });
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(11);
  doc.text(`${companyName} — ${period}`, pw / 2, 26, { align: "center" });

  // Body
  let y = 48;
  doc.setTextColor(51, 51, 51);
  doc.setFontSize(11);
  doc.text(`Prezado(a) ${accountantName},`, 20, y);
  y += 10;
  doc.text(`Segue o resumo fiscal do período ${period} da empresa ${companyName} (CNPJ: ${cnpj}):`, 20, y, {
    maxWidth: pw - 40,
  });
  y += 16;

  // Table header
  doc.setFillColor(226, 232, 240);
  doc.rect(20, y - 5, pw - 40, 10, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Indicador", 25, y + 1);
  doc.text("Valor", pw - 25, y + 1, { align: "right" });
  y += 12;

  // Table rows
  const rows = [
    ["NF-e emitidas (Modelo 55)", String(nfeCount)],
    ["NFC-e emitidas (Modelo 65)", String(nfceCount)],
    ["Total documentos fiscais", formatCurrency(totalValue)],
    ["Vendas no período", `${salesCount} vendas`],
    ["Faturamento total", formatCurrency(salesTotal)],
  ];

  doc.setFont("helvetica", "normal");
  for (const [label, value] of rows) {
    doc.setDrawColor(226, 232, 240);
    doc.line(20, y + 3, pw - 20, y + 3);
    doc.text(label, 25, y);
    doc.setFont("helvetica", "bold");
    doc.text(value, pw - 25, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 10;
  }

  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Este relatório foi gerado automaticamente pelo sistema AnthoSystem.",
    20,
    y,
    { maxWidth: pw - 40 },
  );

  // Footer
  const ph = doc.internal.pageSize.getHeight();
  doc.setFillColor(26, 26, 46);
  doc.rect(0, ph - 15, pw, 15, "F");
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text("AnthoSystem — Sistema de Gestão Comercial", pw / 2, ph - 6, { align: "center" });

  // Return base64
  return doc.output("datauristring").split(",")[1];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: "E-mail do contador é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyId = cu.company_id;

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

    // Generate PDF
    const pdfBase64 = buildPdf(companyName, cnpj, accountantName, period, nfeCount, nfceCount, totalValue, salesCount, salesTotal);

    // Build email HTML (brief version with note about attachment)
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
            📎 <strong>Arquivo PDF anexado:</strong> Relatório_Fiscal_${period.replace("/", "-")}.pdf
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

    // Send via Resend with PDF attachment
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
            filename: `Relatorio_Fiscal_${period.replace("/", "-")}_${companyName.replace(/\s+/g, "_")}.pdf`,
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("[send-accountant-report] Resend error:", errText);
      return new Response(JSON.stringify({ error: "Falha ao enviar e-mail. Verifique o endereço." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent_to: email,
        period,
        nfe_count: nfeCount,
        nfce_count: nfceCount,
        has_pdf: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    console.error("[send-accountant-report] Error:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
