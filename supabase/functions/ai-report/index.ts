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
    purchase: "sugestão de pedido de compra baseada em estoque atual vs vendas recentes",
  };
  if (reportType === "purchase") {
    return `Você é um comprador profissional de supermercados brasileiros.
Com base nos dados de estoque e vendas dos últimos 30 dias, gere uma **Sugestão de Pedido de Compra** em markdown.

Estruture assim:
### 🔴 Reposição Urgente (estoque zerado com vendas)
### 🟡 Reposição Preventiva (estoque abaixo do mínimo)
### 📦 Quantidades Sugeridas (tabela com nome, estoque atual, vendas/30d, sugestão de compra)
### 💡 Dicas de Negociação

Use valores em unidades. Sugira quantidades para cobrir pelo menos 15 dias de venda. Seja objetivo.`;
  }
  return `Você é um consultor de negócios sênior especializado em pequenas e médias empresas brasileiras.
Gere um **Relatório Executivo** profissional focando em: ${focusMap[reportType] || focusMap.general}.

Estruture em markdown com: Resumo Executivo, Indicadores Chave, Análise Detalhada, Pontos de Atenção, Recomendações e Conclusão.
Use linguagem profissional mas acessível. Valores em R$.`;
}

function generateFallbackReport(reportType: string, sales: any[], products: any[], financial: any[], prevSales: any[] = []) {
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

  // --- QUICK INSIGHT (rotativo e mais inteligente) ---
  if (reportType === "quick") {
    // Calcular métricas avançadas
    const diasNoMes = new Date().getDate();
    const mediaDiaria = diasNoMes > 0 ? totalSales / diasNoMes : 0;
    const projecaoMensal = mediaDiaria * 30;
    const topPayment = Object.entries(paymentMethods).sort((a, b) => b[1] - a[1])[0];
    const topPaymentPct = topPayment && totalSales > 0 ? ((topPayment[1] / totalSales) * 100).toFixed(0) : "0";
    const highMarginProducts = productsWithMargin.filter(p => ((p.sale_price - p.cost_price) / p.sale_price) * 100 > 40);
    const stockValue = products.reduce((s, p) => s + (p.stock_quantity || 0) * (p.cost_price || 0), 0);
    const potentialRevenue = products.reduce((s, p) => s + (p.stock_quantity || 0) * (p.sale_price || 0), 0);

    // Montar pool de insights priorizados por urgência
    const critical: string[] = [];
    const warnings: string[] = [];
    const opportunities: string[] = [];
    const positives: string[] = [];

    // CRÍTICOS
    if (lucro < 0) critical.push(`🚨 **Alerta: Prejuízo de ${formatBRL(Math.abs(lucro))}!** Despesas (${formatBRL(despesas)}) superaram receitas (${formatBRL(receitas)}). Ação: revise os 3 maiores custos fixos e negocie prazos com fornecedores.`);
    if (overdue.length > 3) critical.push(`🔴 **${overdue.length} contas vencidas** totalizando ${formatBRL(totalOverdue)}. Isso pode gerar juros de até ${formatBRL(totalOverdue * 0.1)}/mês. Priorize a quitação imediata.`);
    if (zeroStock.length > products.length * 0.3 && products.length > 0) critical.push(`🚫 **${zeroStock.length} de ${products.length} produtos sem estoque** (${((zeroStock.length / products.length) * 100).toFixed(0)}%). Você está perdendo vendas por falta de reposição.`);

    // AVISOS
    if (overdue.length > 0 && overdue.length <= 3) warnings.push(`⚠️ **${overdue.length} conta(s) vencida(s)** (${formatBRL(totalOverdue)}). Regularize antes que acumulem juros.`);
    if (lowStock.length > 5) warnings.push(`📦 **${lowStock.length} produtos com estoque crítico.** Os mais urgentes: ${lowStock.slice(0, 3).map(p => `${p.name} (${p.stock_quantity ?? 0}/${p.min_stock})`).join(", ")}. Faça pedido de compra hoje.`);
    else if (lowStock.length > 0) warnings.push(`📦 Estoque baixo em ${lowStock.length} produto(s): ${lowStock.slice(0, 3).map(p => p.name).join(", ")}. Programe reposição.`);
    if (lowMarginProducts.length > 3) warnings.push(`💸 **${lowMarginProducts.length} produtos com margem < 15%.** Exemplos: ${lowMarginProducts.slice(0, 3).map(p => `${p.name} (${(((p.sale_price - p.cost_price) / p.sale_price) * 100).toFixed(0)}%)`).join(", ")}. Renegocie custos ou ajuste preços.`);

    // OPORTUNIDADES
    if (ticketMedio > 0 && ticketMedio < 30) opportunities.push(`🎯 Ticket médio de ${formatBRL(ticketMedio)}. Crie combos de produtos complementares para elevar o valor por venda.`);
    if (ticketMedio > 0 && ticketMedio < 30) opportunities.push(`🛒 Com ticket de ${formatBRL(ticketMedio)}, experimente "leve 3 pague 2" nos itens de maior giro para subir o ticket.`);
    if (ticketMedio > 0 && ticketMedio < 30) opportunities.push(`💡 Dica: posicione produtos de impulso (doces, bebidas) próximo ao caixa. Isso pode aumentar o ticket médio de ${formatBRL(ticketMedio)} em até 20%.`);
    if (highMarginProducts.length > 0) opportunities.push(`💎 **${highMarginProducts.length} produto(s) com margem acima de 40%!** Destaque-os: ${highMarginProducts.slice(0, 3).map(p => p.name).join(", ")}. Coloque em promoção visível.`);
    if (topPayment && Number(topPaymentPct) > 70) opportunities.push(`💳 **${topPaymentPct}% das vendas são via ${topPayment[0]}.** Diversifique: ofereça desconto para Pix ou parcele no cartão.`);
    if (projecaoMensal > 0 && sales.length > 5) opportunities.push(`📈 **Projeção mensal: ${formatBRL(projecaoMensal)}** com base nos ${diasNoMes} dias já decorridos.`);
    if (stockValue > 0) opportunities.push(`🏪 Seu estoque vale ${formatBRL(stockValue)} (custo) e pode gerar até ${formatBRL(potentialRevenue)} em vendas.`);

    // POSITIVOS
    if (lucro > 0 && Number(margem) > 20) positives.push(`✅ **Margem de ${margem}% é excelente!** Lucro de ${formatBRL(lucro)} no período.`);
    else if (lucro > 0) positives.push(`✅ Resultado positivo de ${formatBRL(lucro)} (margem ${margem}%).`);
    if (sales.length > 20) positives.push(`🔥 **${sales.length} vendas no mês!** Faturamento de ${formatBRL(totalSales)}.`);
    if (sales.length > 0) positives.push(`📊 Você já fez **${sales.length} venda(s)** este mês, totalizando **${formatBRL(totalSales)}**.`);

    // DICAS GERAIS (sempre disponíveis para garantir rotação)
    const tips: string[] = [
      `🧠 **Dica:** Clientes recorrentes gastam até 67% mais. Use o módulo Fidelidade para premiar quem volta.`,
      `📱 **Dica:** Divulgue promoções no WhatsApp. Mensagens diretas têm taxa de abertura de 98%.`,
      `🏷️ **Dica:** Etiquetas de preço bem visíveis aumentam vendas em até 30%. Use o módulo Etiquetas para padronizar.`,
      `⏰ **Dica:** Identifique seus horários de pico e reforce o atendimento nesses momentos.`,
      `📋 **Dica:** Faça inventário mensal para evitar rupturas e perdas por vencimento.`,
      `💰 **Dica:** Negocie prazos maiores com fornecedores para melhorar seu fluxo de caixa.`,
      `🎯 **Dica:** Produtos perto do vencimento? Faça promoção relâmpago e evite perdas.`,
      `📦 **Dica:** Revise seu mix de produtos. Itens sem giro ocupam espaço e capital parado.`,
      `🤝 **Dica:** Ofereça desconto para pagamento em Pix — você recebe na hora e sem taxas.`,
      `📈 **Dica:** Analise o relatório de Curva ABC para focar nos 20% dos produtos que geram 80% do faturamento.`,
      `🔔 **Dica:** Configure alertas financeiros para nunca perder o vencimento de uma conta.`,
      `🛍️ **Dica:** Cross-selling funciona: quem compra pão, leva manteiga. Posicione produtos relacionados juntos.`,
    ];

    const allInsights = [...critical, ...warnings, ...opportunities, ...positives];

    if (allInsights.length === 0 && sales.length === 0) {
      return `📊 **Nenhuma venda registrada ainda este mês.** Cadastre suas vendas no PDV para receber análises personalizadas do seu negócio.`;
    }

    // Sempre misturar pelo menos 1 dica geral para garantir variedade
    const pool = allInsights.length > 0 ? [...allInsights] : [];
    // Add 3 random tips to the pool
    const shuffledTips = tips.sort(() => Math.random() - 0.5);
    pool.push(...shuffledTips.slice(0, 3));

    // Pick 2 random non-duplicate insights
    const finalPool = pool.sort(() => Math.random() - 0.5);
    const picked: string[] = [];
    for (const item of finalPool) {
      if (picked.length >= 2) break;
      if (!picked.includes(item)) picked.push(item);
    }
    return picked.join("\n\n");
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

  // --- MoM Comparison ---
  const prevTotalSales = prevSales.reduce((sum: number, r: any) => sum + Number(r.total || 0), 0);
  const prevTicket = prevSales.length > 0 ? prevTotalSales / prevSales.length : 0;
  const revenueChange = prevTotalSales > 0 ? ((totalSales - prevTotalSales) / prevTotalSales * 100).toFixed(1) : null;
  const countChange = prevSales.length > 0 ? ((sales.length - prevSales.length) / prevSales.length * 100).toFixed(1) : null;

  s.push(`### 📅 Comparativo Mês a Mês\n`);
  s.push(`| Indicador | Mês Anterior | Mês Atual | Variação |`);
  s.push(`|-----------|-------------|-----------|----------|`);
  s.push(`| Faturamento | ${formatBRL(prevTotalSales)} | ${formatBRL(totalSales)} | ${revenueChange ? `${Number(revenueChange) >= 0 ? "+" : ""}${revenueChange}%` : "—"} |`);
  s.push(`| Nº Vendas | ${prevSales.length} | ${sales.length} | ${countChange ? `${Number(countChange) >= 0 ? "+" : ""}${countChange}%` : "—"} |`);
  s.push(`| Ticket Médio | ${formatBRL(prevTicket)} | ${formatBRL(ticketMedio)} | ${prevTicket > 0 ? `${((ticketMedio - prevTicket) / prevTicket * 100).toFixed(1)}%` : "—"} |`);

  // --- Top 5 Products ---
  const productSalesMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const sale of sales) {
    const items = Array.isArray(sale.items) ? sale.items : [];
    for (const item of items) {
      const key = item.product_id || item.name || "unknown";
      const name = item.name || "Produto";
      const qty = Number(item.quantity || 1);
      const rev = Number(item.unit_price || item.price || 0) * qty;
      if (!productSalesMap[key]) productSalesMap[key] = { name, qty: 0, revenue: 0 };
      productSalesMap[key].qty += qty;
      productSalesMap[key].revenue += rev;
    }
  }
  const topProducts = Object.values(productSalesMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  if (topProducts.length > 0) {
    s.push(`\n### 🏆 Top 5 Produtos Mais Vendidos\n`);
    s.push(`| # | Produto | Qtd | Receita |`);
    s.push(`|---|---------|-----|---------|`);
    topProducts.forEach((p, i) => {
      s.push(`| ${i + 1} | ${p.name} | ${p.qty} un. | ${formatBRL(p.revenue)} |`);
    });
  }

  // --- Best Categories ---
  const categorySalesMap: Record<string, { qty: number; revenue: number }> = {};
  for (const sale of sales) {
    const items = Array.isArray(sale.items) ? sale.items : [];
    for (const item of items) {
      const cat = item.category || "Sem categoria";
      const qty = Number(item.quantity || 1);
      const rev = Number(item.unit_price || item.price || 0) * qty;
      if (!categorySalesMap[cat]) categorySalesMap[cat] = { qty: 0, revenue: 0 };
      categorySalesMap[cat].qty += qty;
      categorySalesMap[cat].revenue += rev;
    }
  }
  // Also try product catalog categories
  if (Object.keys(categorySalesMap).length <= 1) {
    const prodCatMap: Record<string, string> = {};
    products.forEach((p: any) => { if (p.name && p.category) prodCatMap[p.name] = p.category; });
    for (const sale of sales) {
      const items = Array.isArray(sale.items) ? sale.items : [];
      for (const item of items) {
        const cat = prodCatMap[item.name] || item.category || "Sem categoria";
        const qty = Number(item.quantity || 1);
        const rev = Number(item.unit_price || item.price || 0) * qty;
        if (!categorySalesMap[cat]) categorySalesMap[cat] = { qty: 0, revenue: 0 };
        categorySalesMap[cat].qty += qty;
        categorySalesMap[cat].revenue += rev;
      }
    }
  }
  const topCategories = Object.entries(categorySalesMap)
    .filter(([cat]) => cat !== "Sem categoria")
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);

  if (topCategories.length > 0) {
    s.push(`\n### 📂 Melhores Categorias\n`);
    s.push(`| Categoria | Itens | Receita |`);
    s.push(`|-----------|-------|---------|`);
    topCategories.forEach(([cat, data]) => {
      s.push(`| ${cat} | ${data.qty} un. | ${formatBRL(data.revenue)} |`);
    });
  }

  // Vendas summary
  s.push(`\n### 📊 Vendas\n`);
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

  // --- Trend Insights ---
  s.push(`\n### 📈 Tendências\n`);
  const diasNoMes = new Date().getDate();
  const mediaDiaria = diasNoMes > 0 ? totalSales / diasNoMes : 0;
  const projecaoMensal = mediaDiaria * 30;
  s.push(`- Média diária: **${formatBRL(mediaDiaria)}** (${(sales.length / Math.max(diasNoMes, 1)).toFixed(1)} vendas/dia)`);
  s.push(`- Projeção mensal: **${formatBRL(projecaoMensal)}**`);
  if (revenueChange) {
    const rc = Number(revenueChange);
    if (rc > 10) s.push(`- 🟢 **Crescimento de ${revenueChange}%** em relação ao mês anterior — bom desempenho!`);
    else if (rc > 0) s.push(`- 🟡 Crescimento modesto de ${revenueChange}%. Busque ações para acelerar.`);
    else if (rc > -10) s.push(`- 🟠 Queda leve de ${revenueChange}%. Monitore e ajuste estratégias.`);
    else s.push(`- 🔴 **Queda de ${revenueChange}%!** Ação urgente necessária.`);
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
  if (topProducts.length > 0) recs.push(`${recs.length + 1}. Garanta estoque do seu top produto (**${topProducts[0].name}**) — ele é o carro-chefe.`);
  if (recs.length === 0) recs.push(`1. Continue monitorando os indicadores. O negócio está em boa saúde!`);
  s.push(recs.join("\n"));

  return s.join("\n");
}

async function callGemini(apiKey: string, systemPrompt: string, dataSummary: string, isQuick: boolean, maxRetries = 2): Promise<string | null> {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[ai-report] Retry ${attempt}, waiting ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const resp = await fetch(geminiUrl, {
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
      });

      console.log(`[ai-report] Gemini attempt ${attempt} status: ${resp.status}`);

      if (resp.status === 429) {
        console.warn("[ai-report] Rate limited, will retry...");
        await resp.text();
        continue;
      }

      if (resp.ok) {
        const data = await resp.json();
        const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) return content;
        console.error("[ai-report] No content:", JSON.stringify(data).substring(0, 300));
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

    // Calculate previous month range for MoM comparison
    const thisMonthDate = new Date(today);
    const prevMonthDate = new Date(thisMonthDate.getFullYear(), thisMonthDate.getMonth() - 1, 1);
    const prevMonthStart = prevMonthDate.toISOString().split("T")[0];
    const prevMonthEnd = new Date(thisMonthDate.getFullYear(), thisMonthDate.getMonth(), 0).toISOString().split("T")[0];

    const [salesRes, productsRes, financialRes, prevSalesRes] = await Promise.all([
      supabase.from("sales").select("total, created_at, payments, status, items").eq("company_id", company_id).gte("created_at", monthStart + "T00:00:00").order("created_at", { ascending: false }).limit(500),
      supabase.from("products").select("name, stock_quantity, min_stock, sale_price, cost_price, category").eq("company_id", company_id).limit(500),
      supabase.from("financial_entries").select("type, amount, status, due_date, description").eq("company_id", company_id).gte("due_date", monthStart).limit(200),
      supabase.from("sales").select("total, created_at, payments, items").eq("company_id", company_id).gte("created_at", prevMonthStart + "T00:00:00").lte("created_at", prevMonthEnd + "T23:59:59").limit(500),
    ]);

    const sales = salesRes.data || [];
    const products = productsRes.data || [];
    const financial = financialRes.data || [];
    const prevSales = prevSalesRes.data || [];
    const isQuick = report_type === "quick";

    const GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_KEY");
    console.log("[ai-report] GOOGLE_GEMINI_KEY present:", !!GEMINI_KEY);

    if (GEMINI_KEY) {
      const dataSummary = buildDataSummary(report_type || "general", sales, products, financial);
      const systemPrompt = getSystemPrompt(report_type || "general", isQuick);

      const aiContent = await callGemini(GEMINI_KEY, systemPrompt, dataSummary, isQuick);
      
      if (aiContent) {
        return new Response(JSON.stringify({ report: aiContent }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.warn("[ai-report] All Gemini attempts failed, using fallback");
    } else {
      console.warn("[ai-report] GOOGLE_GEMINI_KEY not found — add it in Supabase Dashboard > Edge Functions > Secrets");
    }

    // Fallback
    const report = generateFallbackReport(report_type || "general", sales, products, financial, prevSales);
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
