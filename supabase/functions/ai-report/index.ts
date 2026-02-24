import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatBRL(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function generateReport(
  reportType: string,
  sales: any[],
  products: any[],
  financial: any[]
) {
  const totalSales = sales.reduce((s, r) => s + Number(r.total || 0), 0);
  const ticketMedio = sales.length > 0 ? totalSales / sales.length : 0;
  const lowStock = products.filter((p) => p.min_stock > 0 && (p.stock_quantity ?? 0) <= p.min_stock);
  const zeroStock = products.filter((p) => (p.stock_quantity ?? 0) === 0);
  const today = new Date().toISOString().split("T")[0];
  const overdue = financial.filter((f) => f.status === "pendente" && f.due_date <= today);
  const receitas = financial.filter((f) => f.type === "receita" && f.status === "pago").reduce((s, f) => s + Number(f.amount || 0), 0);
  const despesas = financial.filter((f) => f.type === "despesa" && f.status === "pago").reduce((s, f) => s + Number(f.amount || 0), 0);
  const lucro = receitas - despesas;
  const margem = receitas > 0 ? ((lucro / receitas) * 100).toFixed(1) : "0.0";

  if (reportType === "quick") {
    if (lowStock.length > 5) {
      return `⚠️ **Atenção ao estoque!** ${lowStock.length} produtos estão com estoque baixo ou zerado. Reponha para evitar perda de vendas.`;
    }
    if (overdue.length > 0) {
      return `⚠️ **${overdue.length} conta(s) vencida(s)** pendentes. Regularize para manter o fluxo de caixa saudável.`;
    }
    if (lucro < 0) {
      return `📉 **Resultado negativo no mês:** despesas (${formatBRL(despesas)}) superaram receitas (${formatBRL(receitas)}). Revise custos.`;
    }
    return `✅ **Resumo do mês:** ${sales.length} vendas totalizando ${formatBRL(totalSales)}. Ticket médio: ${formatBRL(ticketMedio)}. Margem: ${margem}%.`;
  }

  const sections: string[] = [];

  if (reportType === "general" || reportType === "sales") {
    sections.push(`## 📊 Vendas\n`);
    sections.push(`- **Total no mês:** ${formatBRL(totalSales)} (${sales.length} vendas)`);
    sections.push(`- **Ticket médio:** ${formatBRL(ticketMedio)}`);
    if (sales.length === 0) {
      sections.push(`\n> Nenhuma venda registrada no período.`);
    } else {
      const daysWithSales = new Set(sales.map((s) => s.created_at?.split("T")[0])).size;
      sections.push(`- **Dias com vendas:** ${daysWithSales}`);
      sections.push(`- **Média diária:** ${formatBRL(daysWithSales > 0 ? totalSales / daysWithSales : 0)}`);
    }
    sections.push("");
  }

  if (reportType === "general" || reportType === "stock") {
    sections.push(`## 📦 Estoque\n`);
    sections.push(`- **Produtos cadastrados:** ${products.length}`);
    sections.push(`- **Estoque zerado:** ${zeroStock.length}`);
    sections.push(`- **Estoque baixo (abaixo do mínimo):** ${lowStock.length}`);
    if (lowStock.length > 0) {
      sections.push(`\n**Produtos que precisam de reposição:**`);
      lowStock.slice(0, 10).forEach((p) => {
        sections.push(`- ${p.name}: ${p.stock_quantity ?? 0} un. (mín: ${p.min_stock})`);
      });
      if (lowStock.length > 10) sections.push(`- _...e mais ${lowStock.length - 10} produtos_`);
    }
    sections.push("");
  }

  if (reportType === "general" || reportType === "financial") {
    sections.push(`## 💰 Financeiro\n`);
    sections.push(`- **Receitas pagas:** ${formatBRL(receitas)}`);
    sections.push(`- **Despesas pagas:** ${formatBRL(despesas)}`);
    sections.push(`- **Resultado operacional:** ${formatBRL(lucro)} (${Number(margem) >= 0 ? "✅" : "⚠️"} margem de ${margem}%)`);
    sections.push(`- **Contas vencidas:** ${overdue.length}`);
    if (overdue.length > 0) {
      const totalOverdue = overdue.reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
      sections.push(`- **Valor total vencido:** ${formatBRL(totalOverdue)}`);
    }
    sections.push("");
  }

  // Recomendações
  const recs: string[] = [];
  if (lowStock.length > 3) recs.push(`Repor urgentemente ${lowStock.length} produtos com estoque baixo`);
  if (overdue.length > 0) recs.push(`Cobrar/regularizar ${overdue.length} conta(s) vencida(s)`);
  if (lucro < 0) recs.push("Reduzir despesas ou aumentar volume de vendas para reverter resultado negativo");
  if (ticketMedio > 0 && ticketMedio < 30) recs.push("Ticket médio baixo — considere estratégias de upselling");
  if (recs.length === 0) recs.push("Negócio está saudável neste período. Continue monitorando!");

  sections.push(`## 💡 Recomendações\n`);
  recs.forEach((r, i) => sections.push(`${i + 1}. ${r}`));

  return sections.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { report_type, company_id } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: corsHeaders });
    }

    const today = new Date().toISOString().split("T")[0];
    const monthStart = today.slice(0, 7) + "-01";

    const [salesRes, productsRes, financialRes] = await Promise.all([
      supabase.from("sales").select("total, created_at, payments, status").eq("company_id", company_id).gte("created_at", monthStart + "T00:00:00").order("created_at", { ascending: false }).limit(200),
      supabase.from("products").select("name, stock_quantity, min_stock, sale_price, cost_price").eq("company_id", company_id).limit(200),
      supabase.from("financial_entries").select("type, amount, status, due_date, description").eq("company_id", company_id).gte("due_date", monthStart).limit(200),
    ]);

    const report = generateReport(
      report_type || "general",
      salesRes.data || [],
      productsRes.data || [],
      financialRes.data || []
    );

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-report error:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
