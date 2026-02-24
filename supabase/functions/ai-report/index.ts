import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { report_type, company_id } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: corsHeaders });
    }

    const today = new Date().toISOString().split("T")[0];
    const monthStart = today.slice(0, 7) + "-01";

    // Fetch data in parallel
    const [salesRes, productsRes, financialRes] = await Promise.all([
      supabase.from("sales").select("total, created_at, payments, status").eq("company_id", company_id).gte("created_at", monthStart + "T00:00:00").order("created_at", { ascending: false }).limit(200),
      supabase.from("products").select("name, stock_quantity, min_stock, sale_price, cost_price").eq("company_id", company_id).limit(200),
      supabase.from("financial_entries").select("type, amount, status, due_date, description").eq("company_id", company_id).gte("due_date", monthStart).limit(200),
    ]);

    const sales = salesRes.data || [];
    const products = productsRes.data || [];
    const financial = financialRes.data || [];

    const totalSales = sales.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    const lowStock = products.filter((p: any) => p.min_stock > 0 && (p.stock_quantity ?? 0) <= p.min_stock);
    const overdue = financial.filter((f: any) => f.status === "pendente" && f.due_date <= today);
    const receitas = financial.filter((f: any) => f.type === "receita" && f.status === "pago").reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
    const despesas = financial.filter((f: any) => f.type === "despesa" && f.status === "pago").reduce((s: number, f: any) => s + Number(f.amount || 0), 0);

    const dataSummary = `
DADOS DO NEGÓCIO (mês atual):
- Total de vendas no mês: R$ ${totalSales.toFixed(2)} (${sales.length} vendas)
- Ticket médio: R$ ${sales.length > 0 ? (totalSales / sales.length).toFixed(2) : "0.00"}
- Produtos cadastrados: ${products.length}
- Produtos com estoque baixo/zerado: ${lowStock.length}${lowStock.length > 0 ? ` (${lowStock.slice(0, 5).map((p: any) => p.name).join(", ")})` : ""}
- Receitas pagas no mês: R$ ${receitas.toFixed(2)}
- Despesas pagas no mês: R$ ${despesas.toFixed(2)}
- Lucro operacional: R$ ${(receitas - despesas).toFixed(2)}
- Contas vencidas/pendentes: ${overdue.length}
    `.trim();

    const typePrompts: Record<string, string> = {
      general: "Faça uma análise geral completa do negócio cobrindo vendas, estoque e finanças. Dê 3-5 recomendações práticas.",
      sales: "Foque na performance de vendas: ticket médio, volume, tendências. Sugira como aumentar vendas.",
      stock: "Analise o estoque: produtos em risco de ruptura, oportunidades de compra, giro. Seja específico nos nomes dos produtos.",
      financial: "Analise a saúde financeira: fluxo de caixa, inadimplência, margem. Dê alertas e projeções.",
      quick: "Dê um insight rápido e objetivo em 2-3 frases curtas sobre o ponto mais importante do negócio agora. Seja direto e actionable.",
    };

    const systemPrompt = `Você é um consultor de negócios especialista em supermercados e varejo no Brasil. Analise os dados e forneça insights acionáveis em português. Use formatação Markdown. Seja direto e prático.`;

    const userPrompt = `${typePrompts[report_type] || typePrompts.general}\n\n${dataSummary}`;

    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!aiKey) {
      return new Response(JSON.stringify({ error: "AI key not configured" }), { status: 500, headers: corsHeaders });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: report_type === "quick" ? 200 : 1500,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", errText);
      return new Response(JSON.stringify({ error: "Falha ao gerar relatório" }), { status: 500, headers: corsHeaders });
    }

    const aiResult = await aiResponse.json();
    const report = aiResult.choices?.[0]?.message?.content || "Sem resposta da IA.";

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
