import {
  TrendingUp, TrendingDown, ShoppingBag, DollarSign, AlertTriangle,
  Shield, Heart, Target, Package, Users, ArrowUpRight, ArrowDownRight,
  Activity, Zap, RefreshCw,
} from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { motion } from "framer-motion";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Link } from "react-router-dom";
import { QuickAccessCards } from "@/components/dashboard/QuickAccessCards";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { TopProductsList } from "@/components/dashboard/TopProductsList";
import { AiInsightWidget } from "@/components/dashboard/AiInsightWidget";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function getFirstName(email?: string | null): string {
  if (!email) return "";
  const name = email.split("@")[0].replace(/[._-]/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1).split(" ")[0];
}

const container = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const item = {
  initial: { opacity: 0, y: 20, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: "easeOut" as const } },
};

export default function Dashboard() {
  const { data: stats, isLoading, dataUpdatedAt, refetch } = useDashboardStats();
  const { user } = useAuth();
  const firstName = getFirstName(user?.email);

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

  const kpis = stats ? [
    { title: "Vendas Hoje", value: formatCurrency(stats.salesToday), sub: `${stats.salesCountToday} vendas`, icon: DollarSign, accent: "text-primary", bgAccent: "bg-primary/10", ringAccent: "ring-primary/20" },
    { title: "Ticket Médio", value: formatCurrency(stats.ticketMedio), sub: "por venda", icon: ShoppingBag, accent: "text-blue-500", bgAccent: "bg-blue-500/10", ringAccent: "ring-blue-500/20" },
    { title: "Receita do Mês", value: formatCurrency(stats.monthRevenue), sub: `Lucro: ${formatCurrency(stats.monthProfit)}`, icon: TrendingUp, accent: "text-success", bgAccent: "bg-success/10", ringAccent: "ring-success/20" },
    {
      title: "Crescimento",
      value: `${stats.salesGrowth >= 0 ? "+" : ""}${stats.salesGrowth.toFixed(1)}%`,
      sub: "vs semana anterior",
      icon: stats.salesGrowth >= 0 ? ArrowUpRight : ArrowDownRight,
      accent: stats.salesGrowth >= 0 ? "text-success" : "text-destructive",
      bgAccent: stats.salesGrowth >= 0 ? "bg-success/10" : "bg-destructive/10",
      ringAccent: stats.salesGrowth >= 0 ? "ring-success/20" : "ring-destructive/20",
    },
  ] : [];

  return (
    <motion.div
      variants={container}
      initial="initial"
      animate="animate"
      className="p-3 sm:p-6 space-y-5 sm:space-y-6 max-w-7xl mx-auto min-w-0 overflow-x-hidden"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            {getGreeting()}{firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Resumo inteligente da sua empresa
            {dataUpdatedAt > 0 && (
              <span className="ml-2 text-[10px] text-muted-foreground/60">
                atualizado às {new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()} title="Atualizar dados">
            <RefreshCw className="w-4 h-4" />
          </Button>
          {stats && (
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <Package className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono font-bold text-sm text-primary">{stats.totalProducts}</span>
                <span className="text-xs text-muted-foreground">produtos</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                <Users className="w-3.5 h-3.5 text-blue-500" />
                <span className="font-mono font-bold text-sm text-blue-500">{stats.totalClients}</span>
                <span className="text-xs text-muted-foreground">clientes</span>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Quick Access */}
      <motion.div variants={item} data-tour="quick-access">
        <QuickAccessCards />
      </motion.div>

      {/* AI Insight */}
      <motion.div variants={item}>
        <AiInsightWidget />
      </motion.div>

      {isLoading ? (
        <div className="space-y-5 sm:space-y-6">
          {/* KPI Skeletons */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-4 sm:p-5 border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-8 w-8 rounded-xl" />
                </div>
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
          {/* Status Row Skeletons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-4 sm:p-5 border border-border space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Chart + Products Skeletons */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Skeleton className="lg:col-span-3 h-64 rounded-2xl" />
            <Skeleton className="lg:col-span-2 h-64 rounded-2xl" />
          </div>
          {/* Recent Sales Skeleton */}
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : stats ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {kpis.map((kpi) => (
              <motion.div
                key={kpi.title}
                variants={item}
                className="group bg-card rounded-2xl p-4 sm:p-5 border border-border hover:border-primary/30 transition-all duration-300 hover:shadow-lg relative overflow-hidden"
              >
                {/* Decorative accent */}
                <div className={`absolute top-0 right-0 w-20 h-20 ${kpi.bgAccent} rounded-full blur-2xl -translate-y-8 translate-x-8 opacity-60 group-hover:opacity-100 transition-opacity`} />
                
                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{kpi.title}</span>
                    <div className={`w-8 h-8 rounded-xl ${kpi.bgAccent} flex items-center justify-center ring-1 ${kpi.ringAccent}`}>
                      <kpi.icon className={`w-4 h-4 ${kpi.accent}`} />
                    </div>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold font-mono text-foreground tracking-tight">{kpi.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-1.5">{kpi.sub}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Status Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {/* Fiscal */}
            <motion.div
              variants={item}
              className={`rounded-2xl p-4 sm:p-5 border backdrop-blur-sm ${stats.fiscalProtected ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.fiscalProtected ? "bg-success/15" : "bg-destructive/15"}`}>
                  <Shield className={`w-5 h-5 ${stats.fiscalProtected ? "text-success" : "text-destructive"}`} />
                </div>
                <div>
                  <p className={`text-sm font-bold ${stats.fiscalProtected ? "text-success" : "text-destructive"}`}>
                    {stats.fiscalProtected ? "Proteção Ativa" : "Sem Proteção"}
                  </p>
                  <p className="text-xs text-muted-foreground">{stats.fiscalProtected ? "Escudo Fiscal ativo" : "Ative o Modo Seguro"}</p>
                </div>
              </div>
            </motion.div>

            {/* Health */}
            <motion.div variants={item} className="bg-card rounded-2xl p-4 sm:p-5 border border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.healthScore >= 80 ? "bg-success/15" : stats.healthScore >= 50 ? "bg-warning/15" : "bg-destructive/15"}`}>
                  <Heart className={`w-5 h-5 ${healthColor(stats.healthScore)}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Saúde Financeira</p>
                    <p className={`text-xl font-bold font-mono ${healthColor(stats.healthScore)}`}>{stats.healthScore}</p>
                  </div>
                </div>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.healthScore}%` }}
                  transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                  className={`h-full rounded-full ${healthBg(stats.healthScore)}`}
                />
              </div>
            </motion.div>

            {/* Alerts */}
            <motion.div variants={item} className="bg-card rounded-2xl p-4 sm:p-5 border border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">Resumo</p>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: "Produtos em risco", value: stats.productsAtRisk, color: stats.productsAtRisk > 0 ? "text-destructive" : "text-success" },
                  { label: "Alertas ativos", value: stats.activeAlerts, color: stats.activeAlerts > 0 ? "text-warning" : "text-success", link: "/alertas" },
                  { label: "Lucro do mês", value: formatCurrency(stats.monthProfit), color: stats.monthProfit >= 0 ? "text-success" : "text-destructive", mono: true },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    {row.link ? (
                      <Link to={row.link} className={`text-sm font-bold hover:underline ${row.color}`}>{row.value}</Link>
                    ) : (
                      <span className={`text-sm font-bold ${row.mono ? "font-mono" : ""} ${row.color}`}>{row.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Chart + Top Products */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <motion.div variants={item} className="lg:col-span-3" data-tour="sales-chart">
              <SalesChart data={stats.last7Days} />
            </motion.div>
            <motion.div variants={item} className="lg:col-span-2" data-tour="top-products">
              <TopProductsList products={stats.topProducts} />
            </motion.div>
          </div>

          {/* Recent Sales */}
          <motion.div variants={item} className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-bold text-foreground">Últimas Vendas</h2>
              </div>
              <Link to="/vendas" className="text-xs text-primary hover:text-primary/80 font-semibold transition-colors flex items-center gap-1">
                Ver todas
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            
            {/* Mobile */}
            <div className="sm:hidden divide-y divide-border">
              {stats.recentSales.length === 0 ? (
                <p className="px-4 py-10 text-center text-muted-foreground text-sm">Nenhuma venda registrada</p>
              ) : (
                stats.recentSales.map((sale) => (
                  <div key={sale.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-medium text-foreground">#{sale.number ? String(sale.number).padStart(6, "0") : sale.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground capitalize mt-0.5">{sale.payment_method || "—"}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-mono font-bold text-primary">{formatCurrency(sale.total_value)}</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mt-0.5 ${sale.status === "autorizado" ? "bg-success/10 text-success" : sale.status === "rejeitado" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                        {sale.status === "autorizado" ? "Autorizado" : sale.status === "rejeitado" ? "Rejeitado" : sale.status === "completed" ? "Concluída" : "Pendente"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Nº</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pagamento</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                    <th className="text-center px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentSales.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">Nenhuma venda registrada</td></tr>
                  ) : (
                    stats.recentSales.map((sale) => (
                      <tr key={sale.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5 font-mono font-medium text-foreground">{sale.number ? String(sale.number).padStart(6, "0") : sale.id.slice(0, 8)}</td>
                        <td className="px-5 py-3.5 text-foreground capitalize">{sale.payment_method || "—"}</td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-primary">{formatCurrency(sale.total_value)}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${sale.status === "autorizado" ? "bg-success/10 text-success" : sale.status === "rejeitado" ? "bg-destructive/10 text-destructive" : sale.status === "completed" ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"}`}>
                            {sale.status === "autorizado" ? "Autorizado" : sale.status === "rejeitado" ? "Rejeitado" : sale.status === "completed" ? "Concluída" : "Pendente"}
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
    </motion.div>
  );
}
