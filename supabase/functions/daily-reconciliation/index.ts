import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOLERANCE = 0.50; // R$ 0,50 tolerance

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Determine target date (yesterday by default, or from body)
    let targetDate: string;
    try {
      const body = await req.json();
      targetDate = body?.date || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    } catch {
      targetDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    }

    const startOfDay = `${targetDate}T00:00:00.000Z`;
    const endOfDay = `${targetDate}T23:59:59.999Z`;

    // Get all active companies
    const { data: companies } = await sb
      .from("companies")
      .select("id, name")
      .eq("is_active", true);

    if (!companies?.length) {
      return new Response(JSON.stringify({ success: true, message: "Nenhuma empresa ativa", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const company of companies) {
      const cid = company.id;
      const divergences: string[] = [];

      // 1) Total de vendas do dia (status = completed)
      const { data: salesData } = await sb
        .from("sales")
        .select("id, total")
        .eq("company_id", cid)
        .eq("status", "completed")
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay);

      const salesTotal = (salesData || []).reduce((sum: number, s: any) => sum + Number(s.total || 0), 0);
      const salesCount = salesData?.length || 0;

      // 2) Lançamentos financeiros gerados por vendas no dia
      const { data: finEntries } = await sb
        .from("financial_entries")
        .select("id, amount, reference, status")
        .eq("company_id", cid)
        .eq("type", "receber")
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay);

      const finTotal = (finEntries || []).reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
      const finCount = finEntries?.length || 0;

      // 3) Sessões de caixa fechadas no dia
      const { data: sessions } = await sb
        .from("cash_sessions")
        .select("id, total_vendas, sales_count, difference, status")
        .eq("company_id", cid)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay);

      const cashSalesTotal = (sessions || []).reduce((sum: number, s: any) => sum + Number(s.total_vendas || 0), 0);
      const cashSalesCount = (sessions || []).reduce((sum: number, s: any) => sum + Number(s.sales_count || 0), 0);

      // 4) Check sale_items count vs sales items
      const saleIds = (salesData || []).map((s: any) => s.id);
      let itemsCount = 0;
      if (saleIds.length > 0) {
        const { count } = await sb
          .from("sale_items")
          .select("id", { count: "exact", head: true })
          .in("sale_id", saleIds);
        itemsCount = count || 0;
      }

      // ── Divergence checks ──

      // Vendas vs Financeiro
      if (Math.abs(salesTotal - finTotal) > TOLERANCE) {
        divergences.push(
          `Vendas (R$ ${salesTotal.toFixed(2)}) ≠ Financeiro (R$ ${finTotal.toFixed(2)}) — diferença: R$ ${Math.abs(salesTotal - finTotal).toFixed(2)}`
        );
      }

      // Contagem vendas vs lançamentos
      if (salesCount !== finCount) {
        divergences.push(
          `Qtd vendas (${salesCount}) ≠ Qtd lançamentos financeiros (${finCount})`
        );
      }

      // Vendas vs totais do caixa
      if (sessions?.length && Math.abs(salesTotal - cashSalesTotal) > TOLERANCE) {
        divergences.push(
          `Vendas (R$ ${salesTotal.toFixed(2)}) ≠ Total caixa (R$ ${cashSalesTotal.toFixed(2)}) — diferença: R$ ${Math.abs(salesTotal - cashSalesTotal).toFixed(2)}`
        );
      }

      // Contagem vendas vs caixa
      if (sessions?.length && salesCount !== cashSalesCount) {
        divergences.push(
          `Qtd vendas (${salesCount}) ≠ Qtd no caixa (${cashSalesCount})`
        );
      }

      // Vendas sem itens detalhados
      if (salesCount > 0 && itemsCount === 0) {
        divergences.push(`${salesCount} venda(s) sem itens detalhados na tabela sale_items`);
      }

      // Diferença de caixa (contagem física)
      const closedWithDiff = (sessions || []).filter(
        (s: any) => s.status === "fechado" && s.difference != null && Math.abs(Number(s.difference)) > TOLERANCE
      );
      for (const s of closedWithDiff) {
        divergences.push(
          `Caixa ${s.id.slice(0, 8)} fechou com diferença de R$ ${Number(s.difference).toFixed(2)}`
        );
      }

      // 5) Notify admin if divergences found
      if (divergences.length > 0) {
        // Get admin users for this company
        const { data: admins } = await sb
          .from("company_users")
          .select("user_id")
          .eq("company_id", cid)
          .eq("is_active", true)
          .in("role", ["admin", "gerente"]);

        const message = `⚠️ Reconciliação ${targetDate}: ${divergences.length} divergência(s) encontrada(s):\n• ${divergences.join("\n• ")}`;

        for (const admin of (admins || [])) {
          await sb.from("notifications").insert({
            company_id: cid,
            user_id: admin.user_id,
            title: `Alerta de Reconciliação — ${targetDate}`,
            message,
            type: "warning",
          });
        }
      }

      results.push({
        company_id: cid,
        company_name: company.name,
        date: targetDate,
        sales_total: salesTotal,
        sales_count: salesCount,
        financial_total: finTotal,
        financial_count: finCount,
        cash_total: cashSalesTotal,
        cash_count: cashSalesCount,
        items_count: itemsCount,
        divergences,
        status: divergences.length === 0 ? "OK" : "DIVERGÊNCIA",
      });
    }

    const totalDivergences = results.filter((r) => r.divergences.length > 0).length;

    return new Response(
      JSON.stringify({
        success: true,
        date: targetDate,
        companies_checked: results.length,
        companies_with_divergences: totalDivergences,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
