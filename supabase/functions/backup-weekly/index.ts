import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TABLES_TO_EXPORT = [
  "products", "sales", "clients", "suppliers",
  "financial_entries", "stock_movements", "employees", "cash_sessions",
];

const ADMIN_EMAIL = "adailtonguitar@gmail.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (!resendKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Get all active companies (not demo, not blocked)
    const { data: companies, error: compErr } = await adminClient
      .from("companies")
      .select("id, name")
      .neq("is_blocked", true)
      .neq("is_demo", true)
      .order("name");

    if (compErr || !companies || companies.length === 0) {
      return new Response(JSON.stringify({ message: "No companies to backup", error: compErr?.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { company: string; tables: { table: string; rows: number }[]; error?: string }[] = [];
    const allBackups: { company_id: string; company_name: string; data: Record<string, any[]> }[] = [];

    for (const company of companies) {
      const backup: Record<string, any[]> = {};
      const tableSummary: { table: string; rows: number }[] = [];

      for (const table of TABLES_TO_EXPORT) {
        try {
          const { data } = await adminClient
            .from(table)
            .select("*")
            .eq("company_id", company.id)
            .limit(10000);
          backup[table] = data || [];
          tableSummary.push({ table, rows: (data || []).length });
        } catch {
          backup[table] = [];
          tableSummary.push({ table, rows: 0 });
        }
      }

      // sale_items via sales IDs
      try {
        const saleIds = (backup.sales || []).map((s: any) => s.id);
        if (saleIds.length > 0) {
          const allItems: any[] = [];
          for (let i = 0; i < saleIds.length; i += 100) {
            const batch = saleIds.slice(i, i + 100);
            const { data } = await adminClient.from("sale_items").select("*").in("sale_id", batch);
            if (data) allItems.push(...data);
          }
          backup.sale_items = allItems;
          tableSummary.push({ table: "sale_items", rows: allItems.length });
        }
      } catch {
        backup.sale_items = [];
      }

      allBackups.push({ company_id: company.id, company_name: company.name, data: backup });
      results.push({ company: company.name, tables: tableSummary });
    }

    // Build summary for email body
    const date = new Date().toLocaleDateString("pt-BR");
    const totalRows = results.reduce((sum, r) => sum + r.tables.reduce((s, t) => s + t.rows, 0), 0);

    const summaryHtml = `
      <h2>📦 Backup Semanal - ${date}</h2>
      <p>Backup automático de <strong>${companies.length}</strong> empresa(s) com <strong>${totalRows}</strong> registros no total.</p>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; font-size:14px;">
        <tr style="background:#f0f0f0;"><th>Empresa</th><th>Registros</th></tr>
        ${results.map(r => `<tr><td>${r.company}</td><td>${r.tables.reduce((s, t) => s + t.rows, 0)}</td></tr>`).join("")}
      </table>
      <p style="margin-top:16px; color:#666; font-size:12px;">
        O arquivo JSON completo está anexado a este email. Guarde-o em local seguro (Google Drive, etc).
      </p>
    `;

    // Create JSON attachment as base64
    const backupJson = JSON.stringify({
      metadata: {
        exported_at: new Date().toISOString(),
        type: "weekly_automatic",
        companies: results,
      },
      backups: allBackups,
    });
    const encoder = new TextEncoder();
    const uint8 = encoder.encode(backupJson);
    // Convert to base64
    let binary = "";
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64Content = btoa(binary);

    const fileName = `backup-semanal-${new Date().toISOString().split("T")[0]}.json`;

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "Antho System <noreply@send.anthosystem.com.br>",
        to: [ADMIN_EMAIL],
        subject: `📦 Backup Semanal - ${date} (${companies.length} empresas, ${totalRows} registros)`,
        html: summaryHtml,
        attachments: [
          {
            filename: fileName,
            content: base64Content,
          },
        ],
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend error:", resendData);
      return new Response(JSON.stringify({ error: "Failed to send email", details: resendData }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      companies_backed_up: companies.length,
      total_rows: totalRows,
      email_sent_to: ADMIN_EMAIL,
      resend_id: resendData.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("backup-weekly error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
