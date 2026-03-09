import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function buildHtmlEmail(
  companyName: string,
  date: string,
  salesCount: number,
  salesTotal: number,
  profit: number,
  avgTicket: number,
  topProducts: { name: string; qty: number; total: number }[],
  lowStockProducts: { name: string; stock: number; min: number }[],
  overduePayables: number,
  overdueReceivables: number,
): string {
  const topRows = topProducts
    .map(
      (p, i) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${i + 1}. ${p.name}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${p.qty}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${formatCurrency(p.total)}</td></tr>`
    )
    .join("");

  const lowStockRows = lowStockProducts
    .map(
      (p) =>
        `<tr><td style="padding:6px;border-bottom:1px solid #e2e8f0;">${p.name}</td><td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:center;color:#dc2626;font-weight:bold;">${p.stock}</td><td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:center;">${p.min}</td></tr>`
    )
    .join("");

  const alertsHtml: string[] = [];
  if (overduePayables > 0)
    alertsHtml.push(`<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px;margin-bottom:8px;font-size:13px;">⚠️ <strong>${overduePayables}</strong> conta(s) a pagar vencida(s)</div>`);
  if (overdueReceivables > 0)
    alertsHtml.push(`<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px;margin-bottom:8px;font-size:13px;">💰 <strong>${overdueReceivables}</strong> conta(s) a receber pendente(s)</div>`);

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
      <div style="background:#1a1a2e;padding:24px;text-align:center;border-radius:8px 8px 0 0;">
        <h1 style="color:#4ade80;margin:0;font-size:20px;">📊 Resumo do Dia</h1>
        <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">${companyName} — ${date}</p>
      </div>
      <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;">
        
        <!-- KPIs -->
        <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
          <tr>
            <td style="text-align:center;padding:12px;background:#ecfdf5;border-radius:8px;width:25%;">
              <div style="font-size:22px;font-weight:bold;color:#059669;">${salesCount}</div>
              <div style="font-size:11px;color:#64748b;">Vendas</div>
            </td>
            <td width="8"></td>
            <td style="text-align:center;padding:12px;background:#ecfdf5;border-radius:8px;width:25%;">
              <div style="font-size:18px;font-weight:bold;color:#059669;">${formatCurrency(salesTotal)}</div>
              <div style="font-size:11px;color:#64748b;">Faturamento</div>
            </td>
            <td width="8"></td>
            <td style="text-align:center;padding:12px;background:${profit >= 0 ? '#ecfdf5' : '#fef2f2'};border-radius:8px;width:25%;">
              <div style="font-size:18px;font-weight:bold;color:${profit >= 0 ? '#059669' : '#dc2626'};">${formatCurrency(profit)}</div>
              <div style="font-size:11px;color:#64748b;">Lucro Est.</div>
            </td>
            <td width="8"></td>
            <td style="text-align:center;padding:12px;background:#f0f9ff;border-radius:8px;width:25%;">
              <div style="font-size:18px;font-weight:bold;color:#0369a1;">${formatCurrency(avgTicket)}</div>
              <div style="font-size:11px;color:#64748b;">Ticket Médio</div>
            </td>
          </tr>
        </table>

        ${alertsHtml.length > 0 ? alertsHtml.join("") : ""}

        ${topProducts.length > 0 ? `
        <h3 style="font-size:14px;margin:16px 0 8px;color:#1e293b;">🏆 Top 5 Produtos</h3>
        <table width="100%" cellspacing="0" style="font-size:13px;">
          <tr style="background:#e2e8f0;">
            <th style="padding:8px;text-align:left;">Produto</th>
            <th style="padding:8px;text-align:center;">Qtd</th>
            <th style="padding:8px;text-align:right;">Total</th>
          </tr>
          ${topRows}
        </table>` : ""}

        ${lowStockProducts.length > 0 ? `
        <h3 style="font-size:14px;margin:16px 0 8px;color:#dc2626;">📦 Estoque Baixo</h3>
        <table width="100%" cellspacing="0" style="font-size:13px;">
          <tr style="background:#fef2f2;">
            <th style="padding:6px;text-align:left;">Produto</th>
            <th style="padding:6px;text-align:center;">Atual</th>
            <th style="padding:6px;text-align:center;">Mínimo</th>
          </tr>
          ${lowStockRows}
        </table>` : ""}

        <p style="font-size:11px;color:#94a3b8;margin-top:20px;text-align:center;">
          Relatório gerado automaticamente pelo AnthoSystem
        </p>
      </div>
      <div style="background:#1a1a2e;padding:16px;text-align:center;border-radius:0 0 8px 8px;">
        <p style="color:#64748b;margin:0;font-size:11px;">AnthoSystem — Sistema de Gestão Comercial</p>
      </div>
    </div>
  `;
}

function buildWhatsAppText(
  companyName: string,
  date: string,
  salesCount: number,
  salesTotal: number,
  profit: number,
  lowStockCount: number,
): string {
  return `📊 *Resumo ${date}*\n${companyName}\n\n🛒 Vendas: ${salesCount}\n💰 Faturamento: ${formatCurrency(salesTotal)}\n📈 Lucro: ${formatCurrency(profit)}${lowStockCount > 0 ? `\n⚠️ ${lowStockCount} produto(s) com estoque baixo` : ""}\n\n_Enviado pelo AnthoSystem_`;
}

async function processCompany(adminClient: any, companyId: string, resendKey: string) {
  // Get company info
  const { data: company } = await adminClient
    .from("companies")
    .select("name, is_demo")
    .eq("id", companyId)
    .single();

  if (!company) return null;

  // Get owner email (first active user, preferring owner/admin)
  let { data: companyUsers } = await adminClient
    .from("company_users")
    .select("user_id, role")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .limit(1);

  // Fallback: any active user
  if (!companyUsers?.length) {
    const { data: fallbackUsers } = await adminClient
      .from("company_users")
      .select("user_id, role")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .limit(1);
    companyUsers = fallbackUsers;
  }

  if (!companyUsers?.length) {
    console.log(`[daily-report] No active users for company ${companyId}`);
    return null;
  }

  const ownerId = companyUsers[0].user_id;
  const { data: { user: ownerUser } } = await adminClient.auth.admin.getUserById(ownerId);
  if (!ownerUser?.email) return null;

  // Today's date range
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const todayISO = todayStart.toISOString();
  const todayEndISO = todayEnd.toISOString();
  const dateStr = now.toLocaleDateString("pt-BR");

  // Sales today
  const { data: sales } = await adminClient
    .from("sales")
    .select("id, total, items")
    .eq("company_id", companyId)
    .gte("created_at", todayISO)
    .lte("created_at", todayEndISO);

  const salesList = sales || [];
  const salesCount = salesList.length;
  const salesTotal = salesList.reduce((s: number, sale: any) => s + (sale.total || 0), 0);
  const avgTicket = salesCount > 0 ? salesTotal / salesCount : 0;

  // Estimate profit from sale_items
  const saleIds = salesList.map((s: any) => s.id);
  let profit = 0;

  if (saleIds.length > 0) {
    // Batch IDs
    const batchSize = 15;
    for (let i = 0; i < saleIds.length; i += batchSize) {
      const batch = saleIds.slice(i, i + batchSize);
      const { data: items } = await adminClient
        .from("sale_items")
        .select("quantity, unit_price, cost_price")
        .in("sale_id", batch);

      if (items) {
        for (const item of items) {
          const revenue = (item.quantity || 0) * (item.unit_price || 0);
          const cost = (item.quantity || 0) * (item.cost_price || 0);
          profit += revenue - cost;
        }
      }
    }
  }

  // If no sale_items, try JSONB fallback
  if (profit === 0 && salesCount > 0) {
    for (const sale of salesList) {
      if (Array.isArray(sale.items)) {
        for (const item of sale.items as any[]) {
          const revenue = (item.quantity || 0) * (item.price || item.unit_price || 0);
          const cost = (item.quantity || 0) * (item.cost_price || 0);
          profit += revenue - cost;
        }
      }
    }
  }

  // Top 5 products
  const productMap = new Map<string, { name: string; qty: number; total: number }>();
  for (const sale of salesList) {
    if (Array.isArray(sale.items)) {
      for (const item of sale.items as any[]) {
        const name = item.name || item.product_name || "Sem nome";
        const existing = productMap.get(name) || { name, qty: 0, total: 0 };
        existing.qty += item.quantity || 1;
        existing.total += (item.quantity || 1) * (item.price || item.unit_price || 0);
        productMap.set(name, existing);
      }
    }
  }
  const topProducts = [...productMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Low stock products
  const { data: lowStock } = await adminClient
    .from("products")
    .select("name, stock_quantity, min_stock")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .not("min_stock", "is", null)
    .gt("min_stock", 0)
    .limit(10);

  const lowStockProducts = (lowStock || [])
    .filter((p: any) => (p.stock_quantity || 0) <= (p.min_stock || 0))
    .map((p: any) => ({ name: p.name, stock: p.stock_quantity || 0, min: p.min_stock }))
    .slice(0, 5);

  // Overdue payables (status pending, due_date < today)
  const { count: overduePayables } = await adminClient
    .from("financial_entries")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("type", "pagar")
    .in("status", ["pendente", "vencido"])
    .lt("due_date", todayISO);

  // Overdue receivables
  const { count: overdueReceivables } = await adminClient
    .from("financial_entries")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("type", "receber")
    .in("status", ["pendente", "vencido"])
    .lt("due_date", todayISO);

  // Build email
  const html = buildHtmlEmail(
    company.name,
    dateStr,
    salesCount,
    salesTotal,
    profit,
    avgTicket,
    topProducts,
    lowStockProducts,
    overduePayables || 0,
    overdueReceivables || 0,
  );

  // Build WhatsApp summary for notification
  const whatsappText = buildWhatsAppText(
    company.name,
    dateStr,
    salesCount,
    salesTotal,
    profit,
    lowStockProducts.length,
  );

  // Send email
  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: "AnthoSystem <noreply@anthosystem.com.br>",
      to: [ownerUser.email],
      subject: `📊 Resumo do dia ${dateStr} — ${company.name}`,
      html,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error(`[daily-report] Resend error for ${companyId}:`, errText);
  }

  // Save as in-app notification
  await adminClient.from("admin_notifications").insert({
    company_id: companyId,
    title: `📊 Resumo do dia ${dateStr}`,
    message: `Vendas: ${salesCount} | Faturamento: ${formatCurrency(salesTotal)} | Lucro: ${formatCurrency(profit)}${lowStockProducts.length > 0 ? ` | ⚠️ ${lowStockProducts.length} produto(s) estoque baixo` : ""}`,
    type: "info",
    metadata: { whatsapp_text: whatsappText },
  });

  return { company: company.name, email: ownerUser.email, salesCount, salesTotal };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (!resendKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional: process single company (manual trigger from admin)
    let targetCompanyId: string | null = null;
    try {
      const body = await req.json();
      targetCompanyId = body?.company_id || null;
      
      // Auth validation skipped for service_role and cron triggers
    } catch {
      // No body = cron trigger, process all
    }

    const results: any[] = [];

    if (targetCompanyId) {
      const result = await processCompany(adminClient, targetCompanyId, resendKey);
      if (result) results.push(result);
    } else {
      // Get all active companies
      const { data: companies } = await adminClient
        .from("companies")
        .select("id")
        .eq("is_demo", false);

      for (const c of companies || []) {
        try {
          const result = await processCompany(adminClient, c.id, resendKey);
          if (result) results.push(result);
        } catch (err) {
          console.error(`[daily-report] Error processing ${c.id}:`, err);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    console.error("[daily-report] Error:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
