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

  // Payment methods breakdown
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

  // Average product margin
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
  lines.push(`- Produtos com estoque baixo (abaixo do mínimo): ${lowStock.length}`);
  if (lowStock.length > 0) {
    lines.push(`- Produtos que precisam reposição: ${lowStock.slice(0, 10).map((p) => `${p.name} (${p.stock_quantity ?? 0}/${p.min_stock})`).join(", ")}`);
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
Gere um **Relatório Executivo** profissional e detalhado focando em: ${focusMap[reportType] || focusMap.general}.

Estruture o relatório EXATAMENTE neste formato markdown:

## Relatório Executivo - Desempenho dos Últimos 30 Dias

Um parágrafo introdutório resumindo a situação geral da empresa.

### 1. Resumo Executivo
Análise geral do período em 1-2 parágrafos.

### 2. Indicadores Chave
Liste os indicadores mais relevantes em negrito com valores. Exemplo:
**Total de Vendas:** X
**Receita Total:** R$ X
(inclua todos os indicadores relevantes dos dados fornecidos)

### 3. Análise Detalhada
Análise aprofundada com observações estratégicas sobre os dados.

### 4. Pontos de Atenção
⚠️ Liste problemas identificados que precisam de ação urgente.

### 5. Recomendações Estratégicas
Recomendações numeradas, práticas e acionáveis para melhorar os resultados.

### 6. Conclusão
Parágrafo final com perspectiva geral e próximos passos sugeridos.

Use linguagem profissional mas acessível. Valores monetários em R$ formatados. Seja específico com os dados fornecidos.`;
}

// Fallback programmatic report (no AI key)
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

  if (reportType === "quick") {
    if (lowStock.length > 5) return `⚠️ **Atenção ao estoque!** ${lowStock.length} produtos estão com estoque baixo ou zerado. Reponha para evitar perda de vendas.`;
    if (overdue.length > 0) return `⚠️ **${overdue.length} conta(s) vencida(s)** pendentes. Regularize para manter o fluxo de caixa saudável.`;
    if (lucro < 0) return `📉 **Resultado negativo no mês:** despesas (${formatBRL(despesas)}) superaram receitas (${formatBRL(receitas)}). Revise custos.`;
    return `✅ **Resumo do mês:** ${sales.length} vendas totalizando ${formatBRL(totalSales)}. Ticket médio: ${formatBRL(ticketMedio)}. Margem: ${margem}%.`;
  }

  const sections: string[] = [];
  sections.push(`## Relatório Executivo - Desempenho dos Últimos 30 Dias\n`);
  sections.push(`### 📊 Vendas\n- **Total:** ${formatBRL(totalSales)} (${sales.length} vendas)\n- **Ticket médio:** ${formatBRL(ticketMedio)}\n`);
  sections.push(`### 📦 Estoque\n- **Produtos:** ${products.length}\n- **Estoque zerado:** ${zeroStock.length}\n- **Estoque baixo:** ${lowStock.length}\n`);
  sections.push(`### 💰 Financeiro\n- **Receitas:** ${formatBRL(receitas)}\n- **Despesas:** ${formatBRL(despesas)}\n- **Resultado:** ${formatBRL(lucro)} (margem ${margem}%)\n- **Contas vencidas:** ${overdue.length}\n`);
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

    const sales = salesRes.data || [];
    const products = productsRes.data || [];
    const financial = financialRes.data || [];
    const isQuick = report_type === "quick";

    // Try Google Gemini API
    const GOOGLE_GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_KEY");
    if (GOOGLE_GEMINI_KEY) {
      try {
        const dataSummary = buildDataSummary(report_type || "general", sales, products, financial);
        const systemPrompt = getSystemPrompt(report_type || "general", isQuick);

        const aiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_GEMINI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                { role: "user", parts: [{ text: `${systemPrompt}\n\n${dataSummary}` }] },
              ],
              generationConfig: {
                maxOutputTokens: isQuick ? 200 : 2048,
                temperature: 0.7,
              },
            }),
          }
        );

        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (content) {
            return new Response(JSON.stringify({ report: content }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        console.error("Gemini API error:", aiResponse.status, await aiResponse.text());
      } catch (aiErr) {
        console.error("Gemini API error, falling back:", aiErr);
      }
    }

    // Fallback: programmatic report
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
