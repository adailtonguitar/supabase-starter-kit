import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BarChart3, Brain, LineChart, TrendingUp, PieChart, FileSpreadsheet,
  GitGraph, Percent, Scale, Bell, Stethoscope, Wallet, ClipboardList,
  Scan, BarChart, AlertTriangle, ShoppingCart, Package, Printer, CalendarIcon,
} from "lucide-react";

type ReportCard = { icon: any; label: string; desc: string; path: string };

const categories: { title: string; color: string; cards: ReportCard[] }[] = [
  {
    title: "Vendas",
    color: "text-primary",
    cards: [
      { icon: BarChart3, label: "Relatório de Vendas", desc: "Vendas por período, produto e forma de pagamento", path: "/relatorio-vendas" },
      { icon: LineChart, label: "Lucro Diário", desc: "Lucro bruto e líquido dia a dia", path: "/lucro-diario" },
      { icon: TrendingUp, label: "Painel de Lucro", desc: "Visão completa de margens e rentabilidade", path: "/painel-lucro" },
      { icon: Percent, label: "Comissões", desc: "Comissões de vendedores e funcionários", path: "/comissoes" },
      { icon: PieChart, label: "Painel do Dono", desc: "Resumo executivo do negócio", path: "/painel-dono" },
    ],
  },
  {
    title: "Financeiro",
    color: "text-emerald-500",
    cards: [
      { icon: FileSpreadsheet, label: "DRE", desc: "Demonstrativo de resultado do exercício", path: "/dre" },
      { icon: GitGraph, label: "Fluxo de Caixa Projetado", desc: "Previsão de entradas e saídas futuras", path: "/fluxo-caixa" },
      { icon: Scale, label: "Conciliação Bancária", desc: "Compare extratos com lançamentos internos", path: "/conciliacao" },
      { icon: Bell, label: "Alertas Financeiros", desc: "Contas a pagar/receber com atraso", path: "/alertas" },
      { icon: Stethoscope, label: "Diagnóstico Financeiro IA", desc: "Análise inteligente da saúde financeira", path: "/diagnostico-financeiro" },
    ],
  },
  {
    title: "Estoque",
    color: "text-blue-500",
    cards: [
      { icon: BarChart, label: "Curva ABC", desc: "Classificação de produtos por importância", path: "/estoque/curva-abc" },
      { icon: AlertTriangle, label: "Ruptura", desc: "Produtos em falta ou abaixo do mínimo", path: "/estoque/ruptura" },
      { icon: ShoppingCart, label: "Sugestão de Compra IA", desc: "IA sugere reposição inteligente", path: "/sugestao-compra" },
      { icon: ClipboardList, label: "Inventário", desc: "Contagem e conferência de estoque", path: "/estoque/inventario" },
      { icon: Package, label: "Perdas", desc: "Registro e análise de perdas e avarias", path: "/estoque/perdas" },
    ],
  },
  {
    title: "Auditoria",
    color: "text-orange-500",
    cards: [
      { icon: Wallet, label: "Sessões de Caixa", desc: "Histórico de abertura/fechamento de caixa", path: "/caixa" },
      { icon: Scan, label: "Auditoria Fiscal", desc: "Logs de operações fiscais", path: "/fiscal/auditoria" },
      { icon: Brain, label: "Relatórios IA", desc: "Análises geradas por inteligência artificial", path: "/relatorios-ia" },
    ],
  },
];

function extractPaymentMethod(payments: any): string {
  try {
    const arr = Array.isArray(payments) ? payments : typeof payments === "string" ? JSON.parse(payments) : [];
    if (arr.length > 0) return arr[0].method || "Outros";
  } catch {}
  return "Outros";
}

export default function Relatorios() {
  const { companyId } = useCompany();
  const now = new Date();
  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(now));
  const [dateTo, setDateTo] = useState<Date>(now);

  // ── Sales data for the period ──
  const { data: salesData } = useQuery({
    queryKey: ["report-sales-general", companyId, dateFrom, dateTo],
    enabled: !!companyId,
    queryFn: async () => {
      const from = startOfDay(dateFrom).toISOString();
      const to = endOfDay(dateTo).toISOString();

      const { data: rawSales } = await supabase
        .from("sales")
        .select("id, total, payments, status, created_at")
        .eq("company_id", companyId!)
        .gte("created_at", from)
        .lte("created_at", to)
        .or("status.is.null,status.neq.cancelled");

      const sales = (rawSales || []).map((s: any) => ({
        id: s.id,
        total: s.total ?? 0,
        payment_method: extractPaymentMethod(s.payments),
        status: s.status,
        created_at: s.created_at,
      }));

      if (sales.length === 0) return { sales: [], items: [] };

      // Fetch sale_items in batches (no cost_price column in sale_items)
      const saleIds = sales.map(s => s.id);
      const BATCH_SIZE = 15;
      let allItems: any[] = [];
      for (let i = 0; i < saleIds.length; i += BATCH_SIZE) {
        const batch = saleIds.slice(i, i + BATCH_SIZE);
        const { data: batchItems } = await supabase
          .from("sale_items")
          .select("product_id, product_name, quantity, unit_price, sale_id")
          .in("sale_id", batch);
        if (batchItems) allItems = allItems.concat(batchItems);
      }

      // Get cost_price from products
      const productIds = [...new Set(allItems.map(i => i.product_id).filter(Boolean))];
      const costMap: Record<string, number> = {};
      if (productIds.length > 0) {
        for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
          const batch = productIds.slice(i, i + BATCH_SIZE);
          const { data: prods } = await supabase.from("products").select("id, cost_price").in("id", batch);
          (prods || []).forEach((p: any) => { costMap[p.id] = p.cost_price || 0; });
        }
      }

      const items = allItems.map(i => ({ ...i, cost_price: costMap[i.product_id] || 0 }));
      return { sales, items };
    },
  });

  // ── Stock data (current snapshot) ──
  const { data: stockData } = useQuery({
    queryKey: ["report-stock-general", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: products } = await supabase
        .from("products")
        .select("id, name, stock_quantity, min_stock, cost_price, price, category")
        .eq("company_id", companyId!)
        .eq("is_active", true);

      return products || [];
    },
  });

  // ── Computed sales summary ──
  const salesSummary = useMemo(() => {
    if (!salesData) return null;
    const { sales, items } = salesData;
    const totalSales = sales.length;
    const totalRevenue = sales.reduce((s, v) => s + (v.total || 0), 0);
    const totalCost = items.reduce((s, i) => s + (i.cost_price || 0) * (i.quantity || 0), 0);
    const totalProfit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

    // By payment method
    const byMethod: Record<string, { count: number; total: number }> = {};
    sales.forEach(s => {
      const m = s.payment_method || "Outros";
      if (!byMethod[m]) byMethod[m] = { count: 0, total: 0 };
      byMethod[m].count++;
      byMethod[m].total += s.total || 0;
    });

    // By product
    const byProduct: Record<string, { name: string; qty: number; revenue: number; cost: number; profit: number; margin: number }> = {};
    items.forEach(i => {
      const key = i.product_id || "unknown";
      if (!byProduct[key]) byProduct[key] = { name: i.product_name || "Produto", qty: 0, revenue: 0, cost: 0, profit: 0, margin: 0 };
      const rev = (i.unit_price || 0) * (i.quantity || 0);
      const cost = (i.cost_price || 0) * (i.quantity || 0);
      byProduct[key].qty += i.quantity || 0;
      byProduct[key].revenue += rev;
      byProduct[key].cost += cost;
      byProduct[key].profit += rev - cost;
    });
    const productList = Object.values(byProduct)
      .map(p => ({ ...p, margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit);

    return { totalSales, totalRevenue, totalCost, totalProfit, margin, avgTicket, byMethod, productList };
  }, [salesData]);

  // ── Computed stock summary ──
  const stockSummary = useMemo(() => {
    if (!stockData) return null;
    const totalProducts = stockData.length;
    const totalItems = stockData.reduce((s, p) => s + (p.stock_quantity || 0), 0);
    const totalStockValue = stockData.reduce((s, p) => s + (p.cost_price || 0) * (p.stock_quantity || 0), 0);
    const totalSaleValue = stockData.reduce((s, p) => s + (p.price || 0) * (p.stock_quantity || 0), 0);
    const lowStock = stockData.filter(p => p.min_stock && p.stock_quantity <= p.min_stock);
    const zeroStock = stockData.filter(p => (p.stock_quantity || 0) <= 0);

    // By category
    const byCategory: Record<string, { count: number; qty: number; value: number }> = {};
    stockData.forEach(p => {
      const cat = p.category || "Sem categoria";
      if (!byCategory[cat]) byCategory[cat] = { count: 0, qty: 0, value: 0 };
      byCategory[cat].count++;
      byCategory[cat].qty += p.stock_quantity || 0;
      byCategory[cat].value += (p.cost_price || 0) * (p.stock_quantity || 0);
    });

    return { totalProducts, totalItems, totalStockValue, totalSaleValue, lowStock, zeroStock, byCategory };
  }, [stockData]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // ── Print Sales Report ──
  const handlePrintSales = () => {
    if (!salesSummary) return;
    const period = `${format(dateFrom, "dd/MM/yyyy")} a ${format(dateTo, "dd/MM/yyyy")}`;
    const methodRows = Object.entries(salesSummary.byMethod)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([m, d]) => `<tr><td>${m}</td><td style="text-align:center">${d.count}</td><td style="text-align:right">${fmt(d.total)}</td></tr>`)
      .join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório Geral de Vendas</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; padding: 24px; font-size: 13px; color: #222; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .period { color: #666; margin-bottom: 16px; font-size: 12px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px; }
        .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
        .card-label { font-size: 11px; color: #888; text-transform: uppercase; }
        .card-value { font-size: 20px; font-weight: bold; margin-top: 2px; }
        .card-sub { font-size: 11px; color: #888; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; font-size: 12px; }
        th { background: #f5f5f5; font-weight: 600; }
        .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #aaa; }
        @media print { body { padding: 12px; } }
      </style></head><body>
      <h1>📊 Relatório Geral de Vendas</h1>
      <p class="period">Período: ${period}</p>
      <div class="grid">
        <div class="card">
          <div class="card-label">Total de Vendas</div>
          <div class="card-value">${salesSummary.totalSales}</div>
          <div class="card-sub">Ticket médio: ${fmt(salesSummary.avgTicket)}</div>
        </div>
        <div class="card">
          <div class="card-label">Faturamento</div>
          <div class="card-value">${fmt(salesSummary.totalRevenue)}</div>
          <div class="card-sub">Custo: ${fmt(salesSummary.totalCost)}</div>
        </div>
        <div class="card">
          <div class="card-label">Lucro Bruto</div>
          <div class="card-value" style="color: ${salesSummary.totalProfit >= 0 ? '#16a34a' : '#dc2626'}">${fmt(salesSummary.totalProfit)}</div>
          <div class="card-sub">Margem: ${salesSummary.margin.toFixed(1)}%</div>
        </div>
      </div>
      <h3 style="margin-bottom:4px">Vendas por Forma de Pagamento</h3>
      <table>
        <thead><tr><th>Forma</th><th style="text-align:center">Qtd</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${methodRows}</tbody>
      </table>
      <h3 style="margin:16px 0 4px">Lucro por Produto</h3>
      <table>
        <thead><tr><th>Produto</th><th style="text-align:center">Qtd</th><th style="text-align:right">Receita</th><th style="text-align:right">Custo</th><th style="text-align:right">Lucro</th><th style="text-align:right">Margem</th></tr></thead>
        <tbody>${salesSummary.productList.map(p => `<tr><td>${p.name}</td><td style="text-align:center">${p.qty}</td><td style="text-align:right">${fmt(p.revenue)}</td><td style="text-align:right">${fmt(p.cost)}</td><td style="text-align:right">${fmt(p.profit)}</td><td style="text-align:right">${p.margin.toFixed(1)}%</td></tr>`).join("")}</tbody>
      </table>
      <div class="footer">Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")} — AnthoSystem</div>
    </body></html>`;

    const w = window.open("", "_blank", "width=800,height=600");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  // ── Print Stock Report ──
  const handlePrintStock = () => {
    if (!stockSummary || !stockData) return;

    const catRows = Object.entries(stockSummary.byCategory)
      .sort((a, b) => b[1].value - a[1].value)
      .map(([cat, d]) => `<tr><td>${cat}</td><td style="text-align:center">${d.count}</td><td style="text-align:center">${d.qty}</td><td style="text-align:right">${fmt(d.value)}</td></tr>`)
      .join("");

    const lowRows = stockSummary.lowStock.slice(0, 30)
      .map(p => `<tr><td>${p.name}</td><td style="text-align:center">${p.stock_quantity}</td><td style="text-align:center">${p.min_stock}</td><td style="text-align:right">${fmt(p.cost_price || 0)}</td></tr>`)
      .join("");

    const zeroRows = stockSummary.zeroStock.slice(0, 20)
      .map(p => `<tr><td>${p.name}</td><td style="text-align:right">${fmt(p.price || 0)}</td></tr>`)
      .join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório Geral de Estoque</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; padding: 24px; font-size: 13px; color: #222; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .date { color: #666; margin-bottom: 16px; font-size: 12px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px; }
        .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
        .card-label { font-size: 11px; color: #888; text-transform: uppercase; }
        .card-value { font-size: 20px; font-weight: bold; margin-top: 2px; }
        .card-sub { font-size: 11px; color: #888; margin-top: 2px; }
        h3 { margin: 16px 0 4px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; margin-bottom: 16px; }
        th, td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; font-size: 12px; }
        th { background: #f5f5f5; font-weight: 600; }
        .alert { color: #dc2626; font-weight: 600; }
        .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #aaa; }
        @media print { body { padding: 12px; } }
      </style></head><body>
      <h1>📦 Relatório Geral de Estoque</h1>
      <p class="date">Posição em ${format(new Date(), "dd/MM/yyyy HH:mm")}</p>
      <div class="grid">
        <div class="card">
          <div class="card-label">Produtos Ativos</div>
          <div class="card-value">${stockSummary.totalProducts}</div>
        </div>
        <div class="card">
          <div class="card-label">Itens em Estoque</div>
          <div class="card-value">${stockSummary.totalItems.toLocaleString("pt-BR")}</div>
        </div>
        <div class="card">
          <div class="card-label">Valor em Estoque (Custo)</div>
          <div class="card-value">${fmt(stockSummary.totalStockValue)}</div>
        </div>
        <div class="card">
          <div class="card-label">Valor em Estoque (Venda)</div>
          <div class="card-value">${fmt(stockSummary.totalSaleValue)}</div>
          <div class="card-sub">Margem potencial: ${fmt(stockSummary.totalSaleValue - stockSummary.totalStockValue)}</div>
        </div>
      </div>
      <h3>Estoque por Categoria</h3>
      <table>
        <thead><tr><th>Categoria</th><th style="text-align:center">Produtos</th><th style="text-align:center">Itens</th><th style="text-align:right">Valor (Custo)</th></tr></thead>
        <tbody>${catRows}</tbody>
      </table>
      ${lowRows ? `<h3 class="alert">⚠ Produtos Abaixo do Estoque Mínimo (${stockSummary.lowStock.length})</h3>
      <table>
        <thead><tr><th>Produto</th><th style="text-align:center">Atual</th><th style="text-align:center">Mínimo</th><th style="text-align:right">Custo Unit.</th></tr></thead>
        <tbody>${lowRows}</tbody>
      </table>` : ""}
      ${zeroRows ? `<h3 class="alert">🚫 Produtos com Estoque Zero (${stockSummary.zeroStock.length})</h3>
      <table>
        <thead><tr><th>Produto</th><th style="text-align:right">Preço Venda</th></tr></thead>
        <tbody>${zeroRows}</tbody>
      </table>` : ""}
      <div class="footer">Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")} — AnthoSystem</div>
    </body></html>`;

    const w = window.open("", "_blank", "width=800,height=600");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-muted-foreground mt-1">Todos os relatórios do sistema organizados por categoria.</p>
        </div>

        {/* Period filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="w-4 h-4 mr-2" />
                {format(dateFrom, "dd/MM/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground text-sm">até</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="w-4 h-4 mr-2" />
                {format(dateTo, "dd/MM/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Print buttons */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handlePrintSales} disabled={!salesSummary} variant="outline" className="gap-2">
          <Printer className="w-4 h-4" />
          Imprimir Relatório de Vendas
        </Button>
        <Button onClick={handlePrintStock} disabled={!stockSummary} variant="outline" className="gap-2">
          <Printer className="w-4 h-4" />
          Imprimir Relatório de Estoque
        </Button>
      </div>

      {/* Quick summary cards */}
      {salesSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase">Vendas no Período</p>
            <p className="text-xl font-bold mt-1">{salesSummary.totalSales}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase">Faturamento</p>
            <p className="text-xl font-bold mt-1">{fmt(salesSummary.totalRevenue)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase">Lucro Bruto</p>
            <p className={cn("text-xl font-bold mt-1", salesSummary.totalProfit >= 0 ? "text-emerald-600" : "text-destructive")}>
              {fmt(salesSummary.totalProfit)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase">Produtos em Estoque</p>
            <p className="text-xl font-bold mt-1">{stockSummary?.totalProducts || "—"}</p>
            {stockSummary && stockSummary.lowStock.length > 0 && (
              <p className="text-xs text-destructive mt-1">{stockSummary.lowStock.length} abaixo do mínimo</p>
            )}
          </div>
        </div>
      )}

      {categories.map((cat, ci) => (
        <motion.div
          key={cat.title}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: ci * 0.08 }}
        >
          <h2 className={`text-lg font-bold mb-3 ${cat.color}`}>{cat.title}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cat.cards.map((card) => (
              <Link
                key={card.path}
                to={card.path}
                className="group flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                  <card.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{card.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{card.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
