import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
  "https://anthosystem.com.br",
  "https://www.anthosystem.com.br",
  "https://id-preview--d4ab3861-f98c-4c08-a556-30aa884845a3.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

function formatBRL(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function buildDataSummary(
  sales: any[],
  products: any[],
  clients: any[],
  financial: any[],
  startDate: string,
  endDate: string
) {
  const totalRevenue = sales.reduce((s, r) => s + Number(r.total || 0), 0);
  const ticketMedio = sales.length > 0 ? totalRevenue / sales.length : 0;

  // Payment methods
  const paymentMethods: Record<string, number> = {};
  sales.forEach((s) => {
    try {
      const payments = Array.isArray(s.payments)
        ? s.payments
        : typeof s.payments === "string"
        ? JSON.parse(s.payments)
        : [];
      payments.forEach((p: any) => {
        const method = p.method || "outros";
        paymentMethods[method] =
          (paymentMethods[method] || 0) + Number(p.amount || s.total || 0);
      });
    } catch {}
  });

  // Top products from sales items
  const productSalesMap: Record<string, { name: string; qty: number; revenue: number; category: string }> = {};
  for (const sale of sales) {
    const items = Array.isArray(sale.items) ? sale.items : [];
    for (const item of items) {
      const key = item.product_id || item.name || "unknown";
      const name = item.name || "Produto";
      const qty = Number(item.quantity || 1);
      const rev = Number(item.unit_price || item.price || 0) * qty;
      const cat = item.category || "Sem categoria";
      if (!productSalesMap[key])
        productSalesMap[key] = { name, qty: 0, revenue: 0, category: cat };
      productSalesMap[key].qty += qty;
      productSalesMap[key].revenue += rev;
    }
  }
  const topProducts = Object.values(productSalesMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Categories
  const categoryMap: Record<string, { qty: number; revenue: number }> = {};
  for (const p of Object.values(productSalesMap)) {
    if (!categoryMap[p.category]) categoryMap[p.category] = { qty: 0, revenue: 0 };
    categoryMap[p.category].qty += p.qty;
    categoryMap[p.category].revenue += p.revenue;
  }
  // Enrich with product catalog categories
  const prodCatMap: Record<string, string> = {};
  products.forEach((p: any) => {
    if (p.name && p.category) prodCatMap[p.name] = p.category;
  });

  // Stock analysis
  const lowStock = products.filter(
    (p) => p.min_stock > 0 && (p.stock_quantity ?? 0) <= p.min_stock
  );
  const zeroStock = products.filter((p) => (p.stock_quantity ?? 0) === 0);
  const productsWithMargin = products.filter(
    (p) => p.price > 0 && p.cost_price > 0
  );
  const avgMargin =
    productsWithMargin.length > 0
      ? productsWithMargin.reduce(
          (s, p) =>
            s + ((p.price - p.cost_price) / p.price) * 100,
          0
        ) / productsWithMargin.length
      : 0;

  // Financial
  const receitas = financial
    .filter((f) => f.type === "receber" && f.status === "pago")
    .reduce((s, f) => s + Number(f.amount || 0), 0);
  const despesas = financial
    .filter((f) => f.type === "pagar" && f.status === "pago")
    .reduce((s, f) => s + Number(f.amount || 0), 0);
  const lucro = receitas - despesas;
  const margem = receitas > 0 ? ((lucro / receitas) * 100).toFixed(1) : "0.0";
  const today = new Date().toISOString().split("T")[0];
  const overdue = financial.filter(
    (f) => f.status === "pendente" && f.due_date <= today
  );
  const totalOverdue = overdue.reduce(
    (s: number, f: any) => s + Number(f.amount || 0),
    0
  );

  // Daily distribution
  const dailySales: Record<string, number> = {};
  sales.forEach((s) => {
    const day = (s.created_at || "").split("T")[0];
    if (day) dailySales[day] = (dailySales[day] || 0) + Number(s.total || 0);
  });
  const sortedDays = Object.entries(dailySales).sort((a, b) => b[1] - a[1]);
  const bestDay = sortedDays[0];
  const worstDay = sortedDays[sortedDays.length - 1];

  const lines: string[] = [];
  lines.push(`Período analisado: ${startDate} a ${endDate}`);
  lines.push(`Total de clientes cadastrados: ${clients.length}`);
  lines.push(`\n--- VENDAS ---`);
  lines.push(`Total de vendas: ${sales.length} transações`);
  lines.push(`Faturamento total: ${formatBRL(totalRevenue)}`);
  lines.push(`Ticket médio: ${formatBRL(ticketMedio)}`);
  if (bestDay) lines.push(`Melhor dia: ${bestDay[0]} (${formatBRL(bestDay[1])})`);
  if (worstDay && sortedDays.length > 1)
    lines.push(`Pior dia: ${worstDay[0]} (${formatBRL(worstDay[1])})`);

  if (Object.keys(paymentMethods).length > 0) {
    lines.push(`Formas de pagamento:`);
    Object.entries(paymentMethods)
      .sort((a, b) => b[1] - a[1])
      .forEach(([m, v]) => {
        const pct =
          totalRevenue > 0 ? ((v / totalRevenue) * 100).toFixed(0) : "0";
        lines.push(`  - ${m}: ${formatBRL(v)} (${pct}%)`);
      });
  }

  if (topProducts.length > 0) {
    lines.push(`\n--- TOP 10 PRODUTOS ---`);
    topProducts.forEach((p, i) => {
      lines.push(
        `${i + 1}. ${p.name} — ${p.qty} un. — ${formatBRL(p.revenue)}`
      );
    });
  }

  const topCats = Object.entries(categoryMap)
    .filter(([c]) => c !== "Sem categoria")
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);
  if (topCats.length > 0) {
    lines.push(`\n--- CATEGORIAS ---`);
    topCats.forEach(([cat, data]) => {
      lines.push(`- ${cat}: ${data.qty} un., ${formatBRL(data.revenue)}`);
    });
  }

  lines.push(`\n--- ESTOQUE ---`);
  lines.push(`Produtos cadastrados: ${products.length}`);
  lines.push(`Com estoque zerado: ${zeroStock.length}`);
  lines.push(`Com estoque baixo: ${lowStock.length}`);
  lines.push(`Margem média: ${avgMargin.toFixed(1)}%`);
  if (lowStock.length > 0) {
    lines.push(
      `Urgentes: ${lowStock
        .slice(0, 10)
        .map((p) => `${p.name} (${p.stock_quantity ?? 0}/${p.min_stock})`)
        .join(", ")}`
    );
  }

  lines.push(`\n--- FINANCEIRO ---`);
  lines.push(`Receitas pagas: ${formatBRL(receitas)}`);
  lines.push(`Despesas pagas: ${formatBRL(despesas)}`);
  lines.push(`Resultado: ${formatBRL(lucro)} (margem ${margem}%)`);
  lines.push(`Contas vencidas: ${overdue.length} (${formatBRL(totalOverdue)})`);

  return lines.join("\n");
}

const SYSTEM_PROMPT = `Você é um consultor de negócios sênior especializado em pequenas e médias empresas brasileiras.
Com base nos dados reais fornecidos, gere um **Relatório Executivo** profissional e detalhado.

Estruture em markdown com as seguintes seções:
1. **Resumo Executivo** — panorama geral do período
2. **Faturamento e Vendas** — análise de receita, ticket médio, volume, tendências diárias
3. **Top 5 Produtos** — ranking com análise de concentração
4. **Melhores Categorias** — desempenho por categoria
5. **Análise de Estoque** — rupturas, margens, alertas
6. **Saúde Financeira** — resultado operacional, inadimplência
7. **Tendências e Insights** — padrões identificados, sazonalidade
8. **Recomendações Acionáveis** — mínimo 5 ações concretas priorizadas

Use valores em R$. Seja analítico, use emojis nos títulos, e forneça insights acionáveis.
Não invente dados — use exclusivamente o que foi fornecido.`;

async function callGemini(
  apiKey: string,
  dataSummary: string
): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `${SYSTEM_PROMPT}\n\n---\n\nDADOS DA EMPRESA:\n${dataSummary}`,
                  },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 4096,
              temperature: 0.7,
            },
          }),
        }
      );

      if (resp.status === 429) {
        console.warn("[generate-ai-report] Gemini rate limited, retrying...");
        await resp.text();
        continue;
      }

      if (resp.ok) {
        const data = await resp.json();
        const content =
          data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) return content;
        console.error(
          "[generate-ai-report] No content in Gemini response:",
          JSON.stringify(data).substring(0, 300)
        );
        return null;
      }

      const errText = await resp.text();
      console.error(
        "[generate-ai-report] Gemini error:",
        resp.status,
        errText.substring(0, 300)
      );
      return null;
    } catch (err: any) {
      console.error("[generate-ai-report] Fetch error:", err?.message);
      if (attempt === 2) return null;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { company_id, start_date, end_date } = await req.json();

    if (!company_id || !start_date || !end_date) {
      return new Response(
        JSON.stringify({
          error: "company_id, start_date e end_date são obrigatórios",
        }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ── Validação de pertencimento à empresa (anti-IDOR) ──
    const { data: membership } = await supabase
      .from("company_users")
      .select("id")
      .eq("user_id", user.id)
      .eq("company_id", company_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!membership) {
      return new Response(
        JSON.stringify({ error: "Acesso negado a esta empresa" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Rate limiting: max 3 reports per minute per company
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_company_id: company_id,
      p_fn_name: "generate-ai-report",
      p_max_calls: 3,
      p_window_sec: 60,
    });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "Limite de relatórios excedido. Aguarde 1 minuto." }), {
        status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch real data in parallel
    const [salesRes, productsRes, clientsRes, financialRes] =
      await Promise.all([
        supabase
          .from("sales")
          .select("total, created_at, payments, status, items")
          .eq("company_id", company_id)
          .gte("created_at", start_date + "T00:00:00")
          .lte("created_at", end_date + "T23:59:59")
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("products")
          .select(
            "name, stock_quantity, min_stock, price, cost_price, category, is_active"
          )
          .eq("company_id", company_id)
          .limit(1000),
        supabase
          .from("clients")
          .select("id, name, cpf_cnpj")
          .eq("company_id", company_id)
          .limit(1000),
        supabase
          .from("financial_entries")
          .select("type, amount, status, due_date, description")
          .eq("company_id", company_id)
          .gte("due_date", start_date)
          .lte("due_date", end_date)
          .limit(500),
      ]);

    const sales = salesRes.data || [];
    const products = productsRes.data || [];
    const clients = clientsRes.data || [];
    const financial = financialRes.data || [];

    console.log(
      `[generate-ai-report] Fetched: ${sales.length} sales, ${products.length} products, ${clients.length} clients, ${financial.length} financial entries`
    );

    const dataSummary = buildDataSummary(
      sales,
      products,
      clients,
      financial,
      start_date,
      end_date
    );

    // Try Gemini API
    const GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_KEY");
    console.log("[generate-ai-report] GOOGLE_GEMINI_KEY present:", !!GEMINI_KEY);

    if (GEMINI_KEY) {
      const aiReport = await callGemini(GEMINI_KEY, dataSummary);
      if (aiReport) {
        return new Response(
          JSON.stringify({
            report: aiReport,
            source: "gemini",
            data_summary: {
              sales_count: sales.length,
              products_count: products.length,
              clients_count: clients.length,
              period: `${start_date} a ${end_date}`,
            },
          }),
          {
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          }
        );
      }
      console.warn("[generate-ai-report] Gemini failed, no fallback for full reports");
    }

    // No API key or API failed — return error (no mock!)
    return new Response(
      JSON.stringify({
        error:
          "GOOGLE_GEMINI_KEY não configurada ou API indisponível. Configure a secret no Supabase Dashboard > Edge Functions > Secrets.",
        data_summary: {
          sales_count: sales.length,
          products_count: products.length,
          clients_count: clients.length,
          period: `${start_date} a ${end_date}`,
        },
      }),
      {
        status: 503,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[generate-ai-report] error:", err?.message || err);
    return new Response(
      JSON.stringify({ error: "Erro interno na edge function." }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});
