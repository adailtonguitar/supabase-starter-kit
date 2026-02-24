import {
  TrendingUp, TrendingDown, ShoppingBag, DollarSign, AlertTriangle,
  Shield, Heart, Target, Package, Users, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { motion } from "framer-motion";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Link } from "react-router-dom";
import { QuickAccessCards } from "@/components/dashboard/QuickAccessCards";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { TopProductsList } from "@/components/dashboard/TopProductsList";
import { AiInsightWidget } from "@/components/dashboard/AiInsightWidget";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.01, delay },
});

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();

  const healthColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 50) return "text-warning";
    return "text-destructive";
  };

  const healthBg = (score: number) => {
    if (score >= 80) return "bg-success";
    if (score >= 50) return "bg-warning";
    return "bg-destructive";
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-5 max-w-7xl mx-auto min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Resumo inteligente da sua empresa</p>
        </div>
        {stats && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card">
              <Package className="w-3.5 h-3.5" />
              <span className="font-mono font-semibold text-foreground">{stats.totalProducts}</span>
              <span>produtos</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card">
              <Users className="w-3.5 h-3.5" />
              <span className="font-mono font-semibold text-foreground">{stats.totalClients}</span>
              <span>clientes</span>
            </div>
          </div>
        )}
      </div>

      {/* Quick Access */}
      <QuickAccessCards />

      {/* AI Insight */}
      <AiInsightWidget />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stats ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { title: "Vendas Hoje", value: formatCurrency(stats.salesToday), sub: `${stats.salesCountToday} vendas`, icon: DollarSign, accent: "text-primary" },
              { title: "Ticket Médio", value: formatCurrency(stats.ticketMedio), sub: "por venda", icon: ShoppingBag, accent: "text-blue-500" },
              { title: "Receita do Mês", value: formatCurrency(stats.monthRevenue), sub: `Lucro: ${formatCurrency(stats.monthProfit)}`, icon: TrendingUp, accent: "text-success" },
              {
                title: "Crescimento",
                value: `${stats.salesGrowth >= 0 ? "+" : ""}${stats.salesGrowth.toFixed(1)}%`,
                sub: "vs semana anterior",
                icon: stats.salesGrowth >= 0 ? ArrowUpRight : ArrowDownRight,
                accent: stats.salesGrowth >= 0 ? "text-success" : "text-destructive",
              },
            ].map((kpi, i) => (
              <motion.div key={kpi.title} {...fade(i * 0.03)} className="bg-card rounded-xl p-4 sm:p-5 border border-border card-shadow">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{kpi.title}</span>
                  <kpi.icon className={`w-4 h-4 ${kpi.accent}`} />
                </div>
                <p className="text-lg sm:text-2xl font-bold font-mono text-foreground">{kpi.value}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{kpi.sub}</p>
              </motion.div>
            ))}
          </div>

          {/* Status Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Fiscal */}
            <motion.div {...fade(0.12)} className={`rounded-xl p-4 border ${stats.fiscalProtected ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30"}`}>
              <div className="flex items-center gap-3">
                <Shield className={`w-5 h-5 ${stats.fiscalProtected ? "text-success" : "text-destructive"}`} />
                <div>
                  <p className={`text-sm font-bold ${stats.fiscalProtected ? "text-success" : "text-destructive"}`}>
                    {stats.fiscalProtected ? "Proteção Ativa" : "Sem Proteção"}
                  </p>
                  <p className="text-xs text-muted-foreground">{stats.fiscalProtected ? "Escudo Fiscal ativo" : "Ative o Modo Seguro"}</p>
                </div>
              </div>
            </motion.div>

            {/* Health */}
            <motion.div {...fade(0.14)} className="bg-card rounded-xl p-4 border border-border card-shadow">
              <div className="flex items-center gap-3 mb-2">
                <Heart className={`w-5 h-5 ${healthColor(stats.healthScore)}`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">Saúde Financeira</p>
                    <p className={`text-lg font-bold font-mono ${healthColor(stats.healthScore)}`}>{stats.healthScore}</p>
                  </div>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${healthBg(stats.healthScore)}`} style={{ width: `${stats.healthScore}%` }} />
              </div>
            </motion.div>

            {/* Alerts */}
            <motion.div {...fade(0.16)} className="bg-card rounded-xl p-4 border border-border card-shadow">
              <div className="flex items-center gap-3">
                <Target className="w-5 h-5 text-primary" />
                <p className="text-sm font-medium text-foreground">Resumo</p>
              </div>
              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Produtos em risco</span>
                  <span className={`font-bold ${stats.productsAtRisk > 0 ? "text-destructive" : "text-success"}`}>{stats.productsAtRisk}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Alertas ativos</span>
                  <Link to="/alertas" className={`font-bold hover:underline ${stats.activeAlerts > 0 ? "text-warning" : "text-success"}`}>{stats.activeAlerts}</Link>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lucro do mês</span>
                  <span className={`font-bold font-mono ${stats.monthProfit >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(stats.monthProfit)}</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Chart + Top Products */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <motion.div {...fade(0.18)} className="lg:col-span-3">
              <SalesChart data={stats.last7Days} />
            </motion.div>
            <motion.div {...fade(0.2)} className="lg:col-span-2">
              <TopProductsList products={stats.topProducts} />
            </motion.div>
          </div>

          {/* Recent Sales */}
          <motion.div {...fade(0.22)} className="bg-card rounded-xl card-shadow border border-border overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Últimas Vendas</h2>
              <Link to="/vendas" className="text-xs text-primary hover:underline font-medium">Ver todas →</Link>
            </div>
            <div className="sm:hidden divide-y divide-border">
              {stats.recentSales.length === 0 ? (
                <p className="px-3 py-8 text-center text-muted-foreground text-sm">Nenhuma venda registrada</p>
              ) : (
                stats.recentSales.map((sale) => (
                  <div key={sale.id} className="px-3 py-2.5 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-mono text-foreground">#{sale.number ? String(sale.number).padStart(6, "0") : sale.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground capitalize">{sale.payment_method || "—"}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-mono font-semibold text-primary">{formatCurrency(sale.total_value)}</p>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${sale.status === "autorizado" ? "bg-success/10 text-success" : sale.status === "rejeitado" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                        {sale.status === "autorizado" ? "Autorizado" : sale.status === "rejeitado" ? "Rejeitado" : "Pendente"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Nº</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Pagamento</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentSales.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">Nenhuma venda registrada</td></tr>
                  ) : (
                    stats.recentSales.map((sale) => (
                      <tr key={sale.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3 font-mono text-foreground">{sale.number ? String(sale.number).padStart(6, "0") : sale.id.slice(0, 8)}</td>
                        <td className="px-5 py-3 text-foreground capitalize">{sale.payment_method || "—"}</td>
                        <td className="px-5 py-3 text-right font-mono font-semibold text-primary">{formatCurrency(sale.total_value)}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sale.status === "autorizado" ? "bg-success/10 text-success" : sale.status === "rejeitado" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                            {sale.status === "autorizado" ? "Autorizado" : sale.status === "rejeitado" ? "Rejeitado" : "Pendente"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      ) : null}
    </div>
  );
}
