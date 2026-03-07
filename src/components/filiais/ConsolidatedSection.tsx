import { useState } from "react";
import { BarChart3, TrendingUp, Package, Users, DollarSign } from "lucide-react";
import { useConsolidatedReport } from "@/hooks/useConsolidatedReport";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { motion } from "framer-motion";

export default function ConsolidatedSection() {
  const [dateFrom, setDateFrom] = useState(() => startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState(() => endOfMonth(new Date()));
  const { data: report, isLoading } = useConsolidatedReport(dateFrom, dateTo);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!report || report.branches.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
          <BarChart3 className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Nenhum dado disponível para o período</p>
      </div>
    );
  }

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const cards = [
    { label: "Vendas Total", value: formatCurrency(report.totalSales), icon: DollarSign, gradient: "from-green-500/10 to-green-500/5", iconColor: "text-green-600", borderColor: "border-green-500/20" },
    { label: "Nº Vendas", value: String(report.totalSalesCount), icon: TrendingUp, gradient: "from-blue-500/10 to-blue-500/5", iconColor: "text-blue-600", borderColor: "border-blue-500/20" },
    { label: "Produtos", value: String(report.totalProducts), icon: Package, gradient: "from-amber-500/10 to-amber-500/5", iconColor: "text-amber-600", borderColor: "border-amber-500/20" },
    { label: "Clientes", value: String(report.totalClients), icon: Users, gradient: "from-purple-500/10 to-purple-500/5", iconColor: "text-purple-600", borderColor: "border-purple-500/20" },
  ];

  return (
    <div className="space-y-5">
      {/* Header + Date Filter */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" /> Relatório Consolidado
        </h3>
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-1.5">
          <input
            type="date"
            value={format(dateFrom, "yyyy-MM-dd")}
            onChange={e => setDateFrom(new Date(e.target.value + "T00:00:00"))}
            className="bg-transparent text-foreground text-xs outline-none"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={format(dateTo, "yyyy-MM-dd")}
            onChange={e => setDateTo(new Date(e.target.value + "T23:59:59"))}
            className="bg-transparent text-foreground text-xs outline-none"
          />
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`bg-gradient-to-br ${card.gradient} border ${card.borderColor} rounded-2xl p-4 hover:shadow-md transition-shadow`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-background/80 flex items-center justify-center">
                <card.icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
            </div>
            <p className="text-lg font-bold text-foreground">{card.value}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">{card.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Per Branch Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <h4 className="text-xs font-semibold text-foreground">Detalhamento por Unidade</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-5 py-3 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Unidade</th>
                <th className="px-5 py-3 font-semibold text-muted-foreground uppercase tracking-wider text-[10px] text-right">Vendas (R$)</th>
                <th className="px-5 py-3 font-semibold text-muted-foreground uppercase tracking-wider text-[10px] text-right">Nº Vendas</th>
                <th className="px-5 py-3 font-semibold text-muted-foreground uppercase tracking-wider text-[10px] text-right">Produtos</th>
                <th className="px-5 py-3 font-semibold text-muted-foreground uppercase tracking-wider text-[10px] text-right">Clientes</th>
              </tr>
            </thead>
            <tbody>
              {report.branches.map((b, i) => (
                <motion.tr
                  key={b.companyId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                >
                  <td className="px-5 py-3 font-medium text-foreground">{b.companyName}</td>
                  <td className="px-5 py-3 text-right text-foreground font-mono">{formatCurrency(b.totalSales)}</td>
                  <td className="px-5 py-3 text-right text-foreground">{b.salesCount}</td>
                  <td className="px-5 py-3 text-right text-foreground">{b.totalProducts}</td>
                  <td className="px-5 py-3 text-right text-foreground">{b.totalClients}</td>
                </motion.tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-primary/5 font-bold">
                <td className="px-5 py-3 text-foreground">Total</td>
                <td className="px-5 py-3 text-right text-foreground font-mono">{formatCurrency(report.totalSales)}</td>
                <td className="px-5 py-3 text-right text-foreground">{report.totalSalesCount}</td>
                <td className="px-5 py-3 text-right text-foreground">{report.totalProducts}</td>
                <td className="px-5 py-3 text-right text-foreground">{report.totalClients}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
