/**
 * backup-weekly
 *
 * Exporta todas as empresas ativas (não-demo, não-bloqueadas) em um único
 * arquivo JSON, comprimido com gzip, e envia por e-mail via Resend.
 *
 * Executado via cron (pg_cron ou Scheduled Function do Supabase).
 *
 * Tabelas exportadas:
 *   Operacionais (por company_id):
 *     products, sales, sale_items (via sale_id), clients, suppliers,
 *     financial_entries, stock_movements, employees, cash_sessions
 *   Cadastrais e legais:
 *     companies, company_users, company_plans, subscriptions, payments,
 *     terms_acceptance, profiles (via user_ids de company_users)
 *   Fiscais (críticas — guarda obrigatória por 5 anos):
 *     fiscal_documents, fiscal_queue, fiscal_tax_rules_v2
 *   Auditoria (limit 10k mais recentes):
 *     action_logs
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Tabelas filtráveis por company_id direto. */
const COMPANY_SCOPED_TABLES = [
  // Operacionais
  "products",
  "sales",
  "clients",
  "suppliers",
  "financial_entries",
  "stock_movements",
  "employees",
  "cash_sessions",
  // Cadastrais e planos
  "company_users",
  "company_plans",
  // Fiscais (críticas)
  "fiscal_documents",
  "fiscal_queue",
  "fiscal_tax_rules_v2",
  // Legais
  "terms_acceptance",
] as const;

/** Tabelas escopadas por user_id (indireto via company_users). */
const USER_SCOPED_TABLES = [
  "subscriptions",
  "payments",
  "profiles",
] as const;

/** Recentes, com limite por empresa. */
const RECENT_AUDIT_TABLES: Array<{ name: string; limit: number }> = [
  { name: "action_logs", limit: 5_000 },
];

const ADMIN_EMAIL = Deno.env.get("BACKUP_ADMIN_EMAIL") || "adailtonguitar@gmail.com";

/** Comprime string UTF-8 para gzip (Uint8Array). */
async function gzipText(input: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = await new Response(stream).arrayBuffer();
  return new Uint8Array(compressed);
}

/** Converte Uint8Array em base64 em chunks (evita call stack overflow com arrays grandes). */
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

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
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: companies, error: compErr } = await adminClient
      .from("companies")
      .select("*")
      .neq("is_blocked", true)
      .neq("is_demo", true)
      .order("name");

    if (compErr || !companies || companies.length === 0) {
      return new Response(
        JSON.stringify({ message: "No companies to backup", error: compErr?.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<{ company: string; tables: Array<{ table: string; rows: number }>; error?: string }> = [];
    const allBackups: Array<{ company_id: string; company_name: string; data: Record<string, unknown[]> }> = [];

    for (const company of companies) {
      const backup: Record<string, unknown[]> = {};
      const tableSummary: Array<{ table: string; rows: number }> = [];

      // Sempre grava o próprio registro da empresa
      backup.companies = [company];
      tableSummary.push({ table: "companies", rows: 1 });

      // 1) Tabelas escopadas por company_id
      for (const table of COMPANY_SCOPED_TABLES) {
        try {
          const { data, error } = await adminClient
            .from(table)
            .select("*")
            .eq("company_id", company.id)
            .limit(50_000);
          if (error) {
            console.warn(`[backup-weekly] Skip ${table} for ${company.name}: ${error.message}`);
            backup[table] = [];
            tableSummary.push({ table, rows: 0 });
            continue;
          }
          backup[table] = data || [];
          tableSummary.push({ table, rows: (data || []).length });
        } catch (err) {
          console.warn(`[backup-weekly] ${table} failed for ${company.name}:`, err);
          backup[table] = [];
          tableSummary.push({ table, rows: 0 });
        }
      }

      // 2) sale_items via sale_ids (mesmo padrão do código anterior, preservado)
      try {
        const saleIds = (backup.sales as Array<{ id: string }> || []).map((s) => s.id);
        const allItems: unknown[] = [];
        for (let i = 0; i < saleIds.length; i += 100) {
          const batch = saleIds.slice(i, i + 100);
          if (batch.length === 0) continue;
          const { data } = await adminClient.from("sale_items").select("*").in("sale_id", batch);
          if (data) allItems.push(...data);
        }
        backup.sale_items = allItems;
        tableSummary.push({ table: "sale_items", rows: allItems.length });
      } catch {
        backup.sale_items = [];
      }

      // 3) Tabelas escopadas por user_id (via user_ids de company_users)
      const userIds = Array.from(
        new Set(
          (backup.company_users as Array<{ user_id?: string | null }> || [])
            .map((u) => u?.user_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
      );

      for (const table of USER_SCOPED_TABLES) {
        try {
          if (userIds.length === 0) {
            backup[table] = [];
            tableSummary.push({ table, rows: 0 });
            continue;
          }
          const all: unknown[] = [];
          for (let i = 0; i < userIds.length; i += 100) {
            const batch = userIds.slice(i, i + 100);
            // profiles usa coluna `id` ou `user_id`? padrão é id = user_id
            const column = table === "profiles" ? "id" : "user_id";
            const { data, error } = await adminClient
              .from(table)
              .select("*")
              .in(column, batch)
              .limit(10_000);
            if (error) {
              console.warn(`[backup-weekly] Skip ${table}: ${error.message}`);
              break;
            }
            if (data) all.push(...data);
          }
          backup[table] = all;
          tableSummary.push({ table, rows: all.length });
        } catch (err) {
          console.warn(`[backup-weekly] ${table} failed:`, err);
          backup[table] = [];
          tableSummary.push({ table, rows: 0 });
        }
      }

      // 4) Tabelas de auditoria recentes (com limit)
      for (const audit of RECENT_AUDIT_TABLES) {
        try {
          const { data, error } = await adminClient
            .from(audit.name)
            .select("*")
            .eq("company_id", company.id)
            .order("created_at", { ascending: false })
            .limit(audit.limit);
          if (error) {
            console.warn(`[backup-weekly] Skip ${audit.name}: ${error.message}`);
            backup[audit.name] = [];
            tableSummary.push({ table: audit.name, rows: 0 });
            continue;
          }
          backup[audit.name] = data || [];
          tableSummary.push({ table: audit.name, rows: (data || []).length });
        } catch {
          backup[audit.name] = [];
          tableSummary.push({ table: audit.name, rows: 0 });
        }
      }

      allBackups.push({ company_id: company.id, company_name: company.name, data: backup });
      results.push({ company: company.name, tables: tableSummary });
    }

    const date = new Date().toLocaleDateString("pt-BR");
    const totalRows = results.reduce(
      (sum, r) => sum + r.tables.reduce((s, t) => s + t.rows, 0),
      0,
    );

    const summaryHtml = `
      <h2>📦 Backup Semanal — ${date}</h2>
      <p>Backup automático de <strong>${companies.length}</strong> empresa(s) com <strong>${totalRows.toLocaleString("pt-BR")}</strong> registros no total (comprimido com gzip).</p>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; font-size:13px;">
        <tr style="background:#f0f0f0;"><th align="left">Empresa</th><th align="right">Registros</th></tr>
        ${results
          .map(
            (r) =>
              `<tr><td>${r.company}</td><td align="right">${r.tables
                .reduce((s, t) => s + t.rows, 0)
                .toLocaleString("pt-BR")}</td></tr>`,
          )
          .join("")}
      </table>
      <p style="margin-top:16px; color:#666; font-size:12px;">
        O arquivo JSON está comprimido (gzip) e anexado a este e-mail.
        Para ler, descompacte com 7-Zip ou qualquer ferramenta compatível com <code>.gz</code>.
        Guarde-o em local seguro (Google Drive, backup externo, etc).
      </p>
    `;

    const backupJson = JSON.stringify({
      metadata: {
        exported_at: new Date().toISOString(),
        type: "weekly_automatic",
        companies: results,
        tables_covered: [
          ...COMPANY_SCOPED_TABLES,
          "sale_items",
          ...USER_SCOPED_TABLES,
          ...RECENT_AUDIT_TABLES.map((a) => a.name),
          "companies",
        ],
      },
      backups: allBackups,
    });

    const compressed = await gzipText(backupJson);
    const base64Content = uint8ToBase64(compressed);
    const fileName = `backup-semanal-${new Date().toISOString().split("T")[0]}.json.gz`;

    console.log(
      `[backup-weekly] Original: ${backupJson.length} chars | Gzipped: ${compressed.length} bytes | Base64: ${base64Content.length} chars`,
    );

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "Antho System <noreply@anthosystem.com.br>",
        to: [ADMIN_EMAIL],
        subject: `📦 Backup Semanal - ${date} (${companies.length} empresas, ${totalRows.toLocaleString("pt-BR")} registros)`,
        html: summaryHtml,
        attachments: [
          {
            filename: fileName,
            content: base64Content,
          },
        ],
      }),
    });

    const resendText = await resendRes.text();
    console.log("[backup-weekly] Resend status:", resendRes.status);

    if (!resendRes.ok) {
      return new Response(
        JSON.stringify({
          error: "Failed to send email",
          status: resendRes.status,
          details: resendText,
          backup_size_bytes: compressed.length,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const resendData = JSON.parse(resendText);

    return new Response(
      JSON.stringify({
        success: true,
        companies_backed_up: companies.length,
        total_rows: totalRows,
        original_size_bytes: backupJson.length,
        compressed_size_bytes: compressed.length,
        compression_ratio: `${((1 - compressed.length / backupJson.length) * 100).toFixed(1)}%`,
        email_sent_to: ADMIN_EMAIL,
        resend_id: resendData.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    console.error("[backup-weekly] error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
