import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Build email HTML
    const formatCurrency = (v: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

    const companyName = company?.name || "Empresa";
    const cnpj = (company as any)?.cnpj || "—";
    const accountantName = (company as any)?.accountant_name || "Contador(a)";

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #1a1a2e; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: #4ade80; margin: 0; font-size: 20px;">📊 Relatório Fiscal Mensal</h1>
          <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">${companyName} — ${period}</p>
        </div>
        
        <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0;">
          <p style="margin: 0 0 16px;">Prezado(a) <strong>${accountantName}</strong>,</p>
          <p style="margin: 0 0 16px;">Segue o resumo fiscal do período <strong>${period}</strong> da empresa <strong>${companyName}</strong> (CNPJ: ${cnpj}):</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="background: #e2e8f0;">
              <th style="padding: 10px 12px; text-align: left; font-size: 13px;">Indicador</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 13px;">Valor</th>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 12px; font-size: 13px;">NF-e emitidas (Modelo 55)</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: bold; font-size: 13px;">${nfeCount}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 12px; font-size: 13px;">NFC-e emitidas (Modelo 65)</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: bold; font-size: 13px;">${nfceCount}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 12px; font-size: 13px;">Total documentos fiscais</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: bold; font-size: 13px;">${formatCurrency(totalValue)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 12px; font-size: 13px;">Vendas no período</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: bold; font-size: 13px;">${salesCount} vendas</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; font-size: 13px;">Faturamento total</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: bold; font-size: 15px; color: #16a34a;">${formatCurrency(salesTotal)}</td>
            </tr>
          </table>
          
          <p style="font-size: 12px; color: #64748b; margin: 16px 0 0;">
            Este relatório foi gerado automaticamente pelo sistema AnthoSystem. 
            Para mais detalhes ou download dos XMLs, acesse o painel fiscal do sistema.
          </p>
        </div>
        
        <div style="background: #1a1a2e; padding: 16px; text-align: center; border-radius: 0 0 8px 8px;">
          <p style="color: #64748b; margin: 0; font-size: 11px;">AnthoSystem — Sistema de Gestão Comercial</p>
        </div>
      </div>
    `;

    // Send via Resend
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
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
