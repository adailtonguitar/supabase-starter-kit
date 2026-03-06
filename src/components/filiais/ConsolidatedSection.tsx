import { useState } from "react";
import { BarChart3, TrendingUp, Package, Users, DollarSign } from "lucide-react";
import { useConsolidatedReport } from "@/hooks/useConsolidatedReport";
import { startOfMonth, endOfMonth, format } from "date-fns";

export default function ConsolidatedSection() {
  const [dateFrom, setDateFrom] = useState(() => startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState(() => endOfMonth(new Date()));
  const { data: report, isLoading } = useConsolidatedReport(dateFrom, dateTo);

  if (isLoading) return <p className="text-sm text-muted-foreground text-center py-8">Carregando relatório...</p>;

  if (!report || report.branches.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Nenhum dado disponível para o período.</p>
      </div>
    );
  }

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-4">
      {/* Header + Date Filter */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" /> Relatório Consolidado
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={format(dateFrom, "yyyy-MM-dd")}
            onChange={e => setDateFrom(new Date(e.target.value + "T00:00:00"))}
            className="px-2 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="date"
            value={format(dateTo, "yyyy-MM-dd")}
            onChange={e => setDateTo(new Date(e.target.value + "T23:59:59"))}
            className="px-2 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs"
          />
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Vendas Total", value: formatCurrency(report.totalSales), icon: DollarSign, color: "text-success" },
          { label: "Nº Vendas", value: String(report.totalSalesCount), icon: TrendingUp, color: "text-info" },
          { label: "Produtos", value: String(report.totalProducts), icon: Package, color: "text-warning" },
          { label: "Clientes", value: String(report.totalClients), icon: Users, color: "text-chart-4" },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{card.label}</span>
            </div>
            <p className="text-lg font-bold text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Per Branch */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h4 className="text-xs font-semibold text-foreground">Detalhamento por Unidade</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Unidade</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Vendas (R$)</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Nº Vendas</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Produtos</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Clientes</th>
              </tr>
            </thead>
            <tbody>
              {report.branches.map(b => (
                <tr key={b.companyId} className="border-b border-border last:border-0 hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-foreground">{b.companyName}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">{formatCurrency(b.totalSales)}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">{b.salesCount}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">{b.totalProducts}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">{b.totalClients}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-semibold">
                <td className="px-4 py-2.5 text-foreground">Total</td>
                <td className="px-4 py-2.5 text-right text-foreground">{formatCurrency(report.totalSales)}</td>
                <td className="px-4 py-2.5 text-right text-foreground">{report.totalSalesCount}</td>
                <td className="px-4 py-2.5 text-right text-foreground">{report.totalProducts}</td>
                <td className="px-4 py-2.5 text-right text-foreground">{report.totalClients}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
