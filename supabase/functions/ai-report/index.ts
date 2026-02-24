import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatBRL(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function buildDataSummary(
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

  const paymentMethods: Record<string, number> = {};
  sales.forEach((s) => {
    try {
      const payments = Array.isArray(s.payments) ? s.payments : typeof s.payments === "string" ? JSON.parse(s.payments) : [];
      payments.forEach((p: any) => {
        const method = p.method || "outros";
        paymentMethods[method] = (paymentMethods[method] || 0) + Number(p.amount || s.total || 0);
      });
    } catch {}
  });

  const productsWithMargin = products.filter((p) => p.sale_price > 0 && p.cost_price > 0);
  const avgMargin = productsWithMargin.length > 0
    ? productsWithMargin.reduce((s, p) => s + ((p.sale_price - p.cost_price) / p.sale_price) * 100, 0) / productsWithMargin.length
    : 0;

  const lines: string[] = [];
  lines.push(`Dados do último mês da empresa:`);
  lines.push(`- Total de vendas: ${sales.length} transações, totalizando ${formatBRL(totalSales)}`);
  lines.push(`- Ticket médio: ${formatBRL(ticketMedio)}`);
  if (Object.keys(paymentMethods).length > 0) {
    lines.push(`- Formas de pagamento: ${Object.entries(paymentMethods).map(([m, v]) => `${m}: ${formatBRL(v)}`).join(", ")}`);
  }
  lines.push(`- Produtos cadastrados: ${products.length}`);
  lines.push(`- Produtos com estoque zerado: ${zeroStock.length}`);
  lines.push(`- Produtos com estoque baixo: ${lowStock.length}`);
  if (lowStock.length > 0) {
    lines.push(`- Reposição urgente: ${lowStock.slice(0, 10).map((p) => `${p.name} (${p.stock_quantity ?? 0}/${p.min_stock})`).join(", ")}`);
  }
  lines.push(`- Margem média dos produtos: ${avgMargin.toFixed(0)}%`);
  lines.push(`- Receitas pagas: ${formatBRL(receitas)}`);
  lines.push(`- Despesas pagas: ${formatBRL(despesas)}`);
  lines.push(`- Resultado operacional: ${formatBRL(lucro)} (margem ${margem}%)`);
  lines.push(`- Contas vencidas: ${overdue.length}`);
  if (overdue.length > 0) {
    const totalOverdue = overdue.reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
    lines.push(`- Valor total vencido: ${formatBRL(totalOverdue)}`);
  }
  return lines.join("\n");
}

function getSystemPrompt(reportType: string, isQuick: boolean) {
  if (isQuick) {
    return `Você é um analista de negócios especialista em pequenas e médias empresas brasileiras. 
Gere um insight CURTO (máximo 2 frases) sobre o ponto mais importante dos dados. 
Use emojis. Seja direto e acionável. Responda apenas com o insight, sem título.`;
  }
  const focusMap: Record<string, string> = {
    general: "vendas, estoque e financeiro de forma integrada",
    sales: "performance de vendas, tendências, ticket médio e formas de pagamento",
    stock: "gestão de estoque, rupturas, giro de produtos e oportunidades de reposição",
    financial: "fluxo de caixa, inadimplência, margem operacional e projeções",
  };
  return `Você é um consultor de negócios sênior especializado em pequenas e médias empresas brasileiras.
Gere um **Relatório Executivo** profissional focando em: ${focusMap[reportType] || focusMap.general}.

Estruture em markdown com: Resumo Executivo, Indicadores Chave, Análise Detalhada, Pontos de Atenção, Recomendações e Conclusão.
Use linguagem profissional mas acessível. Valores em R$.`;
}

function generateFallbackReport(reportType: string, sales: any[], products: any[], financial: any[]) {
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
  const totalOverdue = overdue.reduce((s: number, f: any) => s + Number(f.amount || 0), 0);

  const paymentMethods: Record<string, number> = {};
  sales.forEach((s) => {
    try {
      const payments = Array.isArray(s.payments) ? s.payments : typeof s.payments === "string" ? JSON.parse(s.payments) : [];
      payments.forEach((p: any) => {
        const method = p.method || "outros";
        paymentMethods[method] = (paymentMethods[method] || 0) + Number(p.amount || s.total || 0);
      });
    } catch {}
  });

  const productsWithMargin = products.filter((p) => p.sale_price > 0 && p.cost_price > 0);
  const avgMargin = productsWithMargin.length > 0
    ? productsWithMargin.reduce((s, p) => s + ((p.sale_price - p.cost_price) / p.sale_price) * 100, 0) / productsWithMargin.length
    : 0;
  const lowMarginProducts = productsWithMargin.filter(p => ((p.sale_price - p.cost_price) / p.sale_price) * 100 < 15);

  // --- QUICK INSIGHT ---
  if (reportType === "quick") {
    const alerts: string[] = [];
    if (overdue.length > 3) alerts.push(`🔴 **${overdue.length} contas vencidas** somando ${formatBRL(totalOverdue)} — regularize para evitar juros e manter o fluxo de caixa saudável.`);
    else if (overdue.length > 0) alerts.push(`⚠️ **${overdue.length} conta(s) vencida(s)** (${formatBRL(totalOverdue)}). Quite antes que virem bola de neve.`);
    if (lucro < 0) alerts.push(`📉 **Resultado negativo de ${formatBRL(Math.abs(lucro))}** — despesas superaram receitas. Revise custos fixos e negocie com fornecedores.`);
    if (lowStock.length > 5) alerts.push(`📦 **${lowStock.length} produtos com estoque crítico** — risco de perder vendas por ruptura. Priorize reposição dos mais vendidos.`);
    else if (lowStock.length > 0) alerts.push(`📦 ${lowStock.length} produto(s) com estoque baixo: ${lowStock.slice(0, 3).map(p => p.name).join(", ")}.`);
    if (lowMarginProducts.length > 3) alerts.push(`💡 **${lowMarginProducts.length} produtos com margem abaixo de 15%** — considere reajustar preços ou renegociar custos.`);
    if (ticketMedio > 0 && ticketMedio < 20) alerts.push(`🎯 Ticket médio de ${formatBRL(ticketMedio)} está baixo. Estratégias de upsell e combos podem aumentar o faturamento.`);

    if (alerts.length === 0) {
      if (sales.length === 0) return `📊 Nenhuma venda registrada no período. Cadastre vendas para receber insights personalizados.`;
      return `✅ **Negócio saudável!** ${sales.length} vendas totalizando ${formatBRL(totalSales)}, ticket médio de ${formatBRL(ticketMedio)}, margem de ${margem}%. Continue monitorando!`;
    }
    return alerts.slice(0, 2).join("\n\n");
  }

  // --- FULL REPORT ---
  const s: string[] = [];
  s.push(`## 📋 Relatório Executivo — Mês Atual\n`);

  // Resumo
  s.push(`### 🎯 Resumo Executivo\n`);
  if (lucro > 0) s.push(`O negócio apresenta resultado **positivo** de **${formatBRL(lucro)}** com margem de **${margem}%**. `);
  else if (lucro < 0) s.push(`⚠️ O negócio está com resultado **negativo** de **${formatBRL(Math.abs(lucro))}**. Ação imediata necessária para reverter. `);
  else s.push(`O resultado do período é **neutro** — receitas e despesas estão equilibradas. `);
  s.push(`Foram realizadas **${sales.length} vendas** totalizando **${formatBRL(totalSales)}** com ticket médio de **${formatBRL(ticketMedio)}**.\n`);

  // Vendas
  s.push(`### 📊 Vendas\n`);
  s.push(`| Indicador | Valor |`);
  s.push(`|-----------|-------|`);
  s.push(`| Total de vendas | ${sales.length} transações |`);
  s.push(`| Faturamento | ${formatBRL(totalSales)} |`);
  s.push(`| Ticket médio | ${formatBRL(ticketMedio)} |`);
  if (Object.keys(paymentMethods).length > 0) {
    s.push(`\n**Formas de pagamento:**`);
    Object.entries(paymentMethods).sort((a, b) => b[1] - a[1]).forEach(([m, v]) => {
      const pct = totalSales > 0 ? ((v / totalSales) * 100).toFixed(0) : "0";
      s.push(`- ${m}: ${formatBRL(v)} (${pct}%)`);
    });
  }

  // Estoque
  s.push(`\n### 📦 Estoque\n`);
  s.push(`- **${products.length}** produtos cadastrados`);
  s.push(`- **${zeroStock.length}** com estoque zerado`);
  s.push(`- **${lowStock.length}** com estoque abaixo do mínimo`);
  s.push(`- Margem média dos produtos: **${avgMargin.toFixed(1)}%**`);
  if (lowStock.length > 0) {
    s.push(`\n**🔴 Reposição urgente:**`);
    lowStock.slice(0, 8).forEach(p => s.push(`- ${p.name}: ${p.stock_quantity ?? 0}/${p.min_stock} un.`));
  }
  if (lowMarginProducts.length > 0) {
    s.push(`\n**⚠️ Produtos com margem < 15%:** ${lowMarginProducts.slice(0, 5).map(p => p.name).join(", ")}`);
  }

  // Financeiro
  s.push(`\n### 💰 Financeiro\n`);
  s.push(`| Indicador | Valor |`);
  s.push(`|-----------|-------|`);
  s.push(`| Receitas pagas | ${formatBRL(receitas)} |`);
  s.push(`| Despesas pagas | ${formatBRL(despesas)} |`);
  s.push(`| Resultado | ${formatBRL(lucro)} |`);
  s.push(`| Margem operacional | ${margem}% |`);
  s.push(`| Contas vencidas | ${overdue.length} (${formatBRL(totalOverdue)}) |`);

  // Recomendações
  s.push(`\n### 💡 Recomendações\n`);
  const recs: string[] = [];
  if (lucro < 0) recs.push(`1. **Urgente:** Reduza despesas ou aumente preços — o resultado está negativo.`);
  if (overdue.length > 0) recs.push(`${recs.length + 1}. Regularize as **${overdue.length} contas vencidas** (${formatBRL(totalOverdue)}) para evitar juros.`);
  if (lowStock.length > 0) recs.push(`${recs.length + 1}. Reponha os **${lowStock.length} produtos** com estoque crítico para não perder vendas.`);
  if (lowMarginProducts.length > 0) recs.push(`${recs.length + 1}. Revise preços dos **${lowMarginProducts.length} produtos** com margem abaixo de 15%.`);
  if (ticketMedio < 50 && sales.length > 0) recs.push(`${recs.length + 1}. Implemente combos e promoções para elevar o ticket médio de ${formatBRL(ticketMedio)}.`);
  if (recs.length === 0) recs.push(`1. Continue monitorando os indicadores. O negócio está em boa saúde!`);
  s.push(recs.join("\n"));

  return s.join("\n");
}

async function callAIWithRetry(apiKey: string, systemPrompt: string, dataSummary: string, isQuick: boolean, maxRetries = 2): Promise<string | null> {
  const gatewayUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[ai-report] Retry ${attempt}, waiting ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const resp = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: dataSummary },
          ],
          max_tokens: isQuick ? 200 : 2048,
          temperature: 0.7,
        }),
      });

      console.log(`[ai-report] Gateway attempt ${attempt} status: ${resp.status}`);

      if (resp.status === 429) {
        console.warn("[ai-report] Rate limited, will retry...");
        await resp.text();
        continue;
      }

      if (resp.status === 402) {
        console.warn("[ai-report] Payment required - credits exhausted");
        await resp.text();
        return null;
      }

      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
        console.error("[ai-report] No content:", JSON.stringify(data).substring(0, 300));
        return null;
      }

      const errText = await resp.text();
      console.error("[ai-report] Gateway error:", resp.status, errText.substring(0, 200));
      return null;
    } catch (err: any) {
      console.error("[ai-report] Fetch error:", err?.message);
      if (attempt === maxRetries) return null;
    }
  }
  return null;
}

      const errText = await resp.text();
      console.error("[ai-report] Gemini error:", resp.status, errText.substring(0, 200));
      return null;
    } catch (err: any) {
      console.error("[ai-report] Fetch error:", err?.message);
      if (attempt === maxRetries) return null;
    }
  }
  return null;
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

    const sales = salesRes.data || [];
    const products = productsRes.data || [];
    const financial = financialRes.data || [];
    const isQuick = report_type === "quick";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    console.log("[ai-report] LOVABLE_API_KEY present:", !!LOVABLE_API_KEY);

    if (LOVABLE_API_KEY) {
      const dataSummary = buildDataSummary(report_type || "general", sales, products, financial);
      const systemPrompt = getSystemPrompt(report_type || "general", isQuick);

      const aiContent = await callAIWithRetry(LOVABLE_API_KEY, systemPrompt, dataSummary, isQuick);
      
      if (aiContent) {
        return new Response(JSON.stringify({ report: aiContent }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.warn("[ai-report] All AI attempts failed, using fallback");
    } else {
      console.warn("[ai-report] LOVABLE_API_KEY not found");
    }

    // Fallback
    const report = generateFallbackReport(report_type || "general", sales, products, financial);
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
