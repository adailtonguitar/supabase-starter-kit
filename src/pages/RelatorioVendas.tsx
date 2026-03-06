import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Calendar, Download, TrendingUp, TrendingDown, DollarSign, Package, Printer } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type DatePreset = "hoje" | "mes" | "custom";

interface SaleItemJson {
  product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  unit: string;
}

interface ProductProfit {
  product_id: string;
  name: string;
  sku: string;
  total_quantity: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  margin_percent: number;
  unit_price: number;
  unit_cost: number;
}


export default function RelatorioVendas() {
  const { companyId } = useCompany();
  const [preset, setPreset] = useState<DatePreset>("mes");
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const dateRange = useMemo(() => {
    const now = new Date();
    if (preset === "hoje") {
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    }
    if (preset === "mes") {
      return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() };
    }
    return {
      from: startOfDay(parseISO(startDate)).toISOString(),
      to: endOfDay(parseISO(endDate)).toISOString(),
    };
  }, [preset, startDate, endDate]);

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ["report-sales", companyId, dateRange.from, dateRange.to],
    queryFn: async () => {
      if (!companyId) {
        console.warn("[RelatorioVendas] companyId is null/undefined, skipping query");
        return [];
      }
      
      console.log("[RelatorioVendas] Fetching sales for company:", companyId, "from:", dateRange.from, "to:", dateRange.to);
      
      // Fetch sales from the sales table (source of truth)
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("id, created_at, total, status, items")
        .eq("company_id", companyId)
        .gte("created_at", dateRange.from)
        .lte("created_at", dateRange.to)
        .or("status.is.null,status.neq.cancelled")
        .order("created_at", { ascending: false });
      if (salesError) {
        console.error("[RelatorioVendas] Sales query error:", salesError);
        throw salesError;
      }
      console.log("[RelatorioVendas] Sales found:", salesData?.length || 0);
      if (!salesData || salesData.length === 0) return [];

      // Fetch sale_items in batches + product cost from products table
      const saleIds = salesData.map((s: any) => s.id);
      const BATCH_SIZE = 15;
      let allItems: any[] = [];
      for (let i = 0; i < saleIds.length; i += BATCH_SIZE) {
        const batch = saleIds.slice(i, i + BATCH_SIZE);
        const { data: batchItems, error: batchError } = await supabase
          .from("sale_items")
          .select("sale_id, product_id, product_name, quantity, unit_price, subtotal")
          .in("sale_id", batch);
        if (batchError) {
          console.error("[RelatorioVendas] Batch error:", batchError);
          throw batchError;
        }
        if (batchItems) allItems = allItems.concat(batchItems);
      }

      // Fetch cost_price from products table
      const productIds = [...new Set(allItems.map(i => i.product_id).filter(Boolean))];
      const costMap: Record<string, number> = {};
      if (productIds.length > 0) {
        for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
          const batch = productIds.slice(i, i + BATCH_SIZE);
          const { data: prods } = await supabase
            .from("products")
            .select("id, cost_price")
            .in("id", batch);
          (prods || []).forEach((p: any) => { costMap[p.id] = p.cost_price || 0; });
        }
      }

      // Attach items to each sale
      const itemsBySale: Record<string, any[]> = {};
      allItems.forEach((item: any) => {
        if (!itemsBySale[item.sale_id]) itemsBySale[item.sale_id] = [];
        itemsBySale[item.sale_id].push({
          product_id: item.product_id,
          name: item.product_name || "Produto",
          sku: "",
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          cost_price: costMap[item.product_id] || 0,
        });
      });

      return salesData.map((s: any) => {
        // Use sale_items if available, otherwise fall back to JSONB items column
        let items = itemsBySale[s.id] || [];
        if (items.length === 0 && s.items) {
          try {
            const jsonItems = Array.isArray(s.items) ? s.items : JSON.parse(s.items);
            items = jsonItems.map((ji: any) => ({
              product_id: ji.product_id || ji.id || "unknown",
              name: ji.product_name || ji.name || "Produto",
              sku: ji.sku || "",
              quantity: Number(ji.quantity || 0),
              unit_price: Number(ji.unit_price || ji.price || 0),
              cost_price: Number(ji.cost_price || 0),
            }));
          } catch {}
        }
        return {
          id: s.id,
          created_at: s.created_at,
          total_value: s.total,
          items_json: items,
        };
      });
    },
    enabled: !!companyId,
  });

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["report-products", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, cost_price")
        .eq("company_id", companyId);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const costMap = useMemo(() => {
    const map: Record<string, number> = {};
    products.forEach((p) => { map[p.id] = p.cost_price || 0; });
    return map;
  }, [products]);

  const { productProfits, totals } = useMemo(() => {
    const byProduct: Record<string, ProductProfit> = {};
    let fallbackRevenue = 0; // Revenue from sales without item details

    for (const sale of sales) {
      const items = (sale.items_json as unknown as SaleItemJson[] | null) || [];
      if (items.length === 0) {
        // No item details — use sale total as revenue fallback
        fallbackRevenue += Number(sale.total_value || 0);
        continue;
      }
      for (const item of items) {
        if (!byProduct[item.product_id]) {
          byProduct[item.product_id] = {
            product_id: item.product_id,
            name: item.name,
            sku: item.sku,
            total_quantity: 0,
            total_revenue: 0,
            total_cost: 0,
            total_profit: 0,
            margin_percent: 0,
            unit_price: item.unit_price || 0,
            unit_cost: 0,
          };
        }
        const p = byProduct[item.product_id];
        const revenue = item.quantity * item.unit_price;
        const itemCost = (item as any).cost_price || costMap[item.product_id] || 0;
        const cost = item.quantity * itemCost;
        p.total_quantity += item.quantity;
        p.total_revenue += revenue;
        p.total_cost += cost;
        p.total_profit += revenue - cost;
        p.unit_price = item.unit_price || p.unit_price;
        p.unit_cost = itemCost || p.unit_cost;
      }
    }

    const list = Object.values(byProduct).map((p) => ({
      ...p,
      margin_percent: p.total_revenue > 0 ? (p.total_profit / p.total_revenue) * 100 : 0,
    }));
    list.sort((a, b) => b.total_profit - a.total_profit);

    const itemsRevenue = list.reduce((s, p) => s + p.total_revenue, 0);
    const totals = {
      revenue: itemsRevenue + fallbackRevenue,
      cost: list.reduce((s, p) => s + p.total_cost, 0),
      profit: list.reduce((s, p) => s + p.total_profit, 0) + fallbackRevenue, // fallback has no cost info
      quantity: list.reduce((s, p) => s + p.total_quantity, 0),
      salesCount: sales.length,
    };

    return { productProfits: list, totals };
  }, [sales, costMap]);

  const isLoading = loadingSales || loadingProducts;

  const handleExportCSV = () => {
    const header = "Produto;SKU;Qtd Vendida;Receita;Custo;Lucro;Margem %\n";
    const rows = productProfits.map((p) =>
      `${p.name};${p.sku};${p.total_quantity};${p.total_revenue.toFixed(2)};${p.total_cost.toFixed(2)};${p.total_profit.toFixed(2)};${p.margin_percent.toFixed(1)}`
    ).join("\n");
    const footer = `\nTOTAL;;${totals.quantity};${totals.revenue.toFixed(2)};${totals.cost.toFixed(2)};${totals.profit.toFixed(2)};${totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(1) : "0.0"}`;
    const blob = new Blob([header + rows + footer], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio_vendas_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handlePrintReport = (thermal = false) => {
    const periodLabel = preset === "hoje" ? "Hoje" : preset === "mes" ? "Este Mês" : `${format(parseISO(startDate), "dd/MM/yyyy")} a ${format(parseISO(endDate), "dd/MM/yyyy")}`;
    const marginGeral = totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(1) : "0.0";
    const now = format(new Date(), "dd/MM/yyyy HH:mm");

    if (thermal) {
      // 80mm thermal printer format
      const sep = "─".repeat(32);
      const productLines = productProfits.map(p =>
        `<div style="border-bottom:1px dashed #ccc;padding:3px 0">
          <div style="font-weight:bold;font-size:11px">${p.name}</div>
          <div style="display:flex;justify-content:space-between;font-size:10px">
            <span>Qtd: ${p.total_quantity}</span>
            <span>Rec: ${formatCurrency(p.total_revenue)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px">
            <span>Custo: ${formatCurrency(p.total_cost)}</span>
            <span>Lucro: ${formatCurrency(p.total_profit)}</span>
          </div>
          <div style="text-align:right;font-size:10px">Margem: ${p.margin_percent.toFixed(1)}%</div>
        </div>`
      ).join("");

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório</title>
        <style>
          @page{size:80mm auto;margin:0}
          *{margin:0;padding:0;box-sizing:border-box}
          body{width:80mm;font-family:'Courier New',monospace;color:#000;background:#fff;padding:4mm;font-size:11px}
          .center{text-align:center}
          .sep{text-align:center;color:#999;margin:4px 0;font-size:10px;overflow:hidden}
          .row{display:flex;justify-content:space-between;padding:2px 0}
          .bold{font-weight:bold}
          .cut{border-top:1px dashed #000;margin-top:10px;padding-top:6px;text-align:center;font-size:9px;color:#999}
        </style></head><body>
        <div class="center bold" style="font-size:14px">RELATÓRIO DE VENDAS</div>
        <div class="center" style="font-size:10px;margin-top:2px">Período: ${periodLabel}</div>
        <div class="center" style="font-size:9px;color:#666">${now}</div>
        <div class="sep">${sep}</div>
        <div class="row bold"><span>Vendas</span><span>${totals.salesCount}</span></div>
        <div class="row bold"><span>Receita</span><span>${formatCurrency(totals.revenue)}</span></div>
        <div class="row"><span>Custo</span><span>${formatCurrency(totals.cost)}</span></div>
        <div class="row bold"><span>Lucro</span><span style="color:${totals.profit >= 0 ? '#000' : '#000'}">${formatCurrency(totals.profit)}</span></div>
        <div class="row"><span>Margem</span><span>${marginGeral}%</span></div>
        <div class="sep">${sep}</div>
        <div class="center bold" style="font-size:11px;margin-bottom:4px">PRODUTOS</div>
        ${productLines}
        <div class="sep">${sep}</div>
        <div class="row bold"><span>TOTAL LUCRO</span><span>${formatCurrency(totals.profit)}</span></div>
        <div class="row bold"><span>MARGEM GERAL</span><span>${marginGeral}%</span></div>
        <div class="cut">--- corte aqui ---</div>
      </body></html>`;

      const w = window.open("", "_blank", "width=320,height=600");
      if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
      return;
    }

    // A4 format
    const rows = productProfits.map(p =>
      `<tr>
        <td style="padding:4px 8px;border-bottom:1px solid #ddd">${p.name}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #ddd">${p.total_quantity}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #ddd">${formatCurrency(p.total_revenue)}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #ddd">${formatCurrency(p.total_cost)}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #ddd">${formatCurrency(p.total_profit)}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #ddd">${p.margin_percent.toFixed(1)}%</td>
      </tr>`
    ).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Vendas</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px;color:#222}
        h1{font-size:18px;margin-bottom:4px}
        .meta{color:#666;font-size:13px;margin-bottom:16px}
        .summary{display:flex;gap:24px;margin-bottom:20px;flex-wrap:wrap}
        .summary-item{background:#f5f5f5;border-radius:8px;padding:12px 16px;min-width:140px}
        .summary-item .label{font-size:11px;color:#888;text-transform:uppercase}
        .summary-item .value{font-size:18px;font-weight:bold;margin-top:2px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{text-align:left;padding:6px 8px;border-bottom:2px solid #333;font-size:11px;text-transform:uppercase;color:#666}
        .total-row{font-weight:bold;background:#f0f0f0}
        @media print{body{padding:0}.summary-item{border:1px solid #ddd}}
      </style></head><body>
      <h1>Relatório de Vendas</h1>
      <p class="meta">Período: ${periodLabel} • Gerado em ${now}</p>
      <div class="summary">
        <div class="summary-item"><div class="label">Vendas</div><div class="value">${totals.salesCount}</div></div>
        <div class="summary-item"><div class="label">Receita</div><div class="value">${formatCurrency(totals.revenue)}</div></div>
        <div class="summary-item"><div class="label">Custo</div><div class="value">${formatCurrency(totals.cost)}</div></div>
        <div class="summary-item"><div class="label">Lucro</div><div class="value" style="color:${totals.profit >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(totals.profit)}</div></div>
        <div class="summary-item"><div class="label">Margem</div><div class="value">${marginGeral}%</div></div>
      </div>
      <table>
        <thead><tr>
          <th>Produto</th><th style="text-align:right">Qtd</th><th style="text-align:right">Receita</th>
          <th style="text-align:right">Custo</th><th style="text-align:right">Lucro</th><th style="text-align:right">Margem</th>
        </tr></thead>
        <tbody>${rows}
          <tr class="total-row">
            <td style="padding:6px 8px">TOTAL</td>
            <td style="padding:6px 8px;text-align:right">${totals.quantity}</td>
            <td style="padding:6px 8px;text-align:right">${formatCurrency(totals.revenue)}</td>
            <td style="padding:6px 8px;text-align:right">${formatCurrency(totals.cost)}</td>
            <td style="padding:6px 8px;text-align:right">${formatCurrency(totals.profit)}</td>
            <td style="padding:6px 8px;text-align:right">${marginGeral}%</td>
          </tr>
        </tbody>
      </table></body></html>`;

    const w = window.open("", "_blank", "width=800,height=600");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
  };

  const inputClass = "px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all";

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Relatório de Vendas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Lucro por produto e totais do período</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handlePrintReport(true)} disabled={sales.length === 0} title="Impressora térmica 80mm">
            <Printer className="w-4 h-4 mr-2" />
            Cupom
          </Button>
          <Button variant="outline" size="sm" onClick={() => handlePrintReport(false)} disabled={sales.length === 0} title="Impressão A4">
            <Printer className="w-4 h-4 mr-2" />
            Imprimir A4
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={sales.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl card-shadow border border-border p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <div className="flex gap-1">
            {(["hoje", "mes", "custom"] as DatePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  preset === p
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:opacity-80"
                }`}
              >
                {p === "hoje" ? "Hoje" : p === "mes" ? "Este Mês" : "Período"}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
              <span className="text-sm text-muted-foreground">até</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
            </div>
          )}
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Vendas", value: totals.salesCount.toString(), icon: BarChart3, color: "text-primary" },
          { label: "Receita Total", value: formatCurrency(totals.revenue), icon: DollarSign, color: "text-primary" },
          { label: "Custo Total", value: formatCurrency(totals.cost), icon: TrendingDown, color: "text-destructive" },
          { label: "Lucro Total", value: formatCurrency(totals.profit), icon: TrendingUp, color: totals.profit >= 0 ? "text-success" : "text-destructive" },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card rounded-xl card-shadow border border-border p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
            </div>
            <p className={`text-lg font-bold font-mono ${card.color}`}>{isLoading ? "..." : card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Margin Overview */}
      {!isLoading && totals.revenue > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl card-shadow border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Margem de Lucro Geral</span>
            <span className={`text-lg font-bold font-mono ${totals.profit >= 0 ? "text-success" : "text-destructive"}`}>
              {((totals.profit / totals.revenue) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="mt-2 w-full bg-muted rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${totals.profit >= 0 ? "bg-success" : "bg-destructive"}`}
              style={{ width: `${Math.min(Math.max((totals.profit / totals.revenue) * 100, 0), 100)}%` }}
            />
          </div>
        </motion.div>
      )}

      {/* Product Profit - Mobile Cards */}
      <div className="sm:hidden space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Package className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Lucro por Produto</h2>
          <span className="text-xs text-muted-foreground ml-auto">{productProfits.length} produtos</span>
        </div>
        {isLoading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : productProfits.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma venda no período.</div>
        ) : (
          productProfits.map((p) => (
            <div key={p.product_id} className="bg-card rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                  p.margin_percent >= 30 ? "bg-success/10 text-success"
                    : p.margin_percent >= 10 ? "bg-warning/10 text-warning"
                    : "bg-destructive/10 text-destructive"
                }`}>
                  {p.margin_percent.toFixed(1)}%
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-2 border-t border-border">
                <span>Preço: <strong className="text-foreground font-mono">{formatCurrency(p.unit_price)}</strong></span>
                <span>Custo: <strong className="text-foreground font-mono">{formatCurrency(p.unit_cost)}</strong></span>
                <span>Qtd: <strong className="text-foreground font-mono">{p.total_quantity}</strong></span>
                <span>Receita: <strong className="text-foreground font-mono">{formatCurrency(p.total_revenue)}</strong></span>
                <span>Lucro: <strong className={`font-mono ${p.total_profit >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(p.total_profit)}</strong></span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Product Profit - Desktop Table */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden sm:block bg-card rounded-xl card-shadow border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Lucro por Produto</h2>
          <span className="text-xs text-muted-foreground ml-auto">{productProfits.length} produtos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Produto</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Preço Venda</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Preço Custo</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Qtd</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Receita</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Custo</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Lucro</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Margem</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-5 py-3" colSpan={8}><Skeleton className="h-8 w-full" /></td>
                  </tr>
                ))
              ) : productProfits.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                    Nenhuma venda encontrada no período selecionado.
                  </td>
                </tr>
              ) : (
                <>
                  {productProfits.map((p) => (
                    <tr key={p.product_id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="px-5 py-3">
                        <div>
                          <span className="font-medium text-foreground">{p.name}</span>
                          <span className="text-xs text-muted-foreground ml-2 font-mono">{p.sku}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-foreground">{formatCurrency(p.unit_price)}</td>
                      <td className="px-5 py-3 text-right font-mono text-muted-foreground">{formatCurrency(p.unit_cost)}</td>
                      <td className="px-5 py-3 text-right font-mono text-foreground">{p.total_quantity}</td>
                      <td className="px-5 py-3 text-right font-mono text-foreground">{formatCurrency(p.total_revenue)}</td>
                      <td className="px-5 py-3 text-right font-mono text-muted-foreground">{formatCurrency(p.total_cost)}</td>
                      <td className={`px-5 py-3 text-right font-mono font-medium ${p.total_profit >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(p.total_profit)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.margin_percent >= 30 ? "bg-emerald-500/10 text-emerald-500"
                            : p.margin_percent >= 10 ? "bg-amber-500/10 text-amber-500"
                            : "bg-destructive/10 text-destructive"
                        }`}>
                          {p.margin_percent.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/30 font-semibold">
                    <td className="px-5 py-3 text-foreground">TOTAL</td>
                    <td className="px-5 py-3"></td>
                    <td className="px-5 py-3"></td>
                    <td className="px-5 py-3 text-right font-mono text-foreground">{totals.quantity}</td>
                    <td className="px-5 py-3 text-right font-mono text-foreground">{formatCurrency(totals.revenue)}</td>
                    <td className="px-5 py-3 text-right font-mono text-muted-foreground">{formatCurrency(totals.cost)}</td>
                    <td className={`px-5 py-3 text-right font-mono ${totals.profit >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {formatCurrency(totals.profit)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        totals.revenue > 0 && (totals.profit / totals.revenue) * 100 >= 30
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-amber-500/10 text-amber-500"
                      }`}>
                        {totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(1) : "0.0"}%
                      </span>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
