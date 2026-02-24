import { TrendingUp, ShoppingBag, DollarSign, AlertTriangle, Clock, Shield, Heart, Target } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { motion } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Link } from "react-router-dom";
import { QuickAccessCards } from "@/components/dashboard/QuickAccessCards";
import { AiInsightWidget } from "@/components/dashboard/AiInsightWidget";

export default function Dashboard() {
  const { trialActive, trialDaysLeft, subscribed, loading: subLoading } = useSubscription();
  const { isSuperAdmin, loading: adminLoading } = useAdminRole();
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
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto min-w-0 overflow-x-hidden">
      {!subLoading && !adminLoading && trialActive && !subscribed && !isSuperAdmin && trialDaysLeft !== null && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Você está no período de teste gratuito. <strong>{trialDaysLeft} {trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'}</strong>.
          </p>
          <Link to="/trial-expirado" className="ml-auto text-sm font-semibold text-primary hover:underline whitespace-nowrap">
            Assinar agora
          </Link>
        </div>
      )}

      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Resumo inteligente da sua empresa</p>
      </div>

      <QuickAccessCards />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl p-5 border card-shadow ${stats.fiscalProtected ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30"}`}>
              <div className="flex items-center gap-3">
                <Shield className={`w-6 h-6 ${stats.fiscalProtected ? "text-success" : "text-destructive"}`} />
                <div>
                  <p className={`text-sm font-bold ${stats.fiscalProtected ? "text-success" : "text-destructive"}`}>
                    {stats.fiscalProtected ? "Empresa Protegida" : "Proteção Desativada"}
                  </p>
                  <p className="text-xs text-muted-foreground">{stats.fiscalProtected ? "Escudo Fiscal ativo" : "Ative o Modo Seguro Fiscal"}</p>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-xl p-5 border border-border card-shadow">
              <div className="flex items-center gap-3 mb-3">
                <Heart className={`w-6 h-6 ${healthColor(stats.healthScore)}`} />
                <div>
                  <p className="text-sm font-medium text-foreground">Saúde Financeira</p>
                  <p className={`text-2xl font-bold font-mono ${healthColor(stats.healthScore)}`}>{stats.healthScore}/100</p>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${healthBg(stats.healthScore)}`} style={{ width: `${stats.healthScore}%` }} />
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl p-5 border border-border card-shadow">
              <div className="flex items-center gap-3 mb-3">
                <Target className="w-6 h-6 text-primary" />
                <p className="text-sm font-medium text-foreground">Resumo Rápido</p>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lucro do mês</span>
                  <span className={`font-bold font-mono ${stats.monthProfit >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(stats.monthProfit)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Produtos com risco</span>
                  <span className={`font-bold ${stats.productsAtRisk > 0 ? "text-destructive" : "text-success"}`}>{stats.productsAtRisk}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Alertas ativos</span>
                  <Link to="/alertas" className={`font-bold hover:underline ${stats.activeAlerts > 0 ? "text-warning" : "text-success"}`}>{stats.activeAlerts}</Link>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              { title: "Vendas Hoje", value: formatCurrency(stats.salesToday), icon: DollarSign },
              { title: "Nº de Vendas", value: String(stats.salesCountToday), icon: ShoppingBag },
              { title: "Ticket Médio", value: formatCurrency(stats.ticketMedio), icon: TrendingUp },
              { title: "Receita do Mês", value: formatCurrency(stats.monthRevenue), icon: DollarSign },
            ].map((stat, i) => (
              <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.05 }} className="bg-card rounded-xl p-3 sm:p-5 card-shadow border border-border">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-xs sm:text-sm text-muted-foreground">{stat.title}</span>
                  <stat.icon className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                </div>
                <span className="text-lg sm:text-2xl font-bold font-mono text-foreground">{stat.value}</span>
              </motion.div>
            ))}
          </div>

          <AiInsightWidget />

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-card rounded-xl card-shadow border border-border overflow-hidden">
            <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-border">
              <h2 className="text-sm sm:text-base font-semibold text-foreground">Últimas Vendas</h2>
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
                      <p className="text-sm font-mono font-semibold text-primary">{formatCurrency(Number(sale.total_value))}</p>
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
                        <td className="px-5 py-3 text-right font-mono font-semibold text-primary">{formatCurrency(Number(sale.total_value))}</td>
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
