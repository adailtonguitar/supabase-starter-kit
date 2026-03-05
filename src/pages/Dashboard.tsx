import {
  TrendingUp, TrendingDown, ShoppingBag, DollarSign, AlertTriangle,
  Shield, Heart, Target, Package, Users, ArrowUpRight, ArrowDownRight,
  Activity, Zap, RefreshCw,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";
import { motion } from "framer-motion";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Link, Navigate } from "react-router-dom";
import { QuickAccessCards } from "@/components/dashboard/QuickAccessCards";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { TopProductsList } from "@/components/dashboard/TopProductsList";
import { AiInsightWidget } from "@/components/dashboard/AiInsightWidget";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useAdminRole } from "@/hooks/useAdminRole";

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
  animate: { transition: { staggerChildren: 0.07 } },
};

const item = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: "easeOut" as const } },
};

const paymentIcons: Record<string, string> = {
  dinheiro: "💵",
  pix: "⚡",
  credito: "💳",
  debito: "💳",
  fiado: "📝",
};

function getPaymentIcon(method?: string) {
  if (!method) return "💰";
  const key = method.toLowerCase().trim();
  return paymentIcons[key] || "💰";
}

function CountUpValue({ value, isCurrency }: { value: number; isCurrency: boolean }) {
  const animated = useCountUp(value, 900, isCurrency ? 2 : 1);
  if (isCurrency) return <>{formatCurrency(animated)}</>;
  const sign = value >= 0 ? "+" : "";
  return <>{sign}{animated.toFixed(1)}%</>;
}

export default function Dashboard() {
  const { data: stats, isLoading, dataUpdatedAt, refetch } = useDashboardStats();
  const { user } = useAuth();
  const plan = usePlanFeatures();
  const { isSuperAdmin } = useAdminRole();
  const firstName = getFirstName(user?.email);

  // Emissor-only plan: redirect to standalone emitter (super_admin bypasses)
  if (!isSuperAdmin && plan.isEmissorOnly()) {
    return <Navigate to="/emissor-nfe" replace />;
  }

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
    { title: "Vendas Hoje", rawValue: stats.salesToday, value: formatCurrency(stats.salesToday), sub: `${stats.salesCountToday} vendas`, icon: DollarSign, accent: "text-primary", bgAccent: "bg-primary/10", ringAccent: "ring-primary/20", isCurrency: true },
    { title: "Ticket Médio", rawValue: stats.ticketMedio, value: formatCurrency(stats.ticketMedio), sub: "por venda", icon: ShoppingBag, accent: "text-primary", bgAccent: "bg-primary/10", ringAccent: "ring-primary/20", isCurrency: true },
    { title: "Receita do Mês", rawValue: stats.monthRevenue, value: formatCurrency(stats.monthRevenue), sub: `Lucro: ${formatCurrency(stats.monthProfit)}`, icon: TrendingUp, accent: "text-success", bgAccent: "bg-success/10", ringAccent: "ring-success/20", isCurrency: true },
    {
      title: "Crescimento",
      rawValue: stats.salesGrowth,
      value: `${stats.salesGrowth >= 0 ? "+" : ""}${stats.salesGrowth.toFixed(1)}%`,
      sub: "vs semana anterior",
      icon: stats.salesGrowth >= 0 ? ArrowUpRight : ArrowDownRight,
      accent: stats.salesGrowth >= 0 ? "text-success" : "text-destructive",
      bgAccent: stats.salesGrowth >= 0 ? "bg-success/10" : "bg-destructive/10",
      ringAccent: stats.salesGrowth >= 0 ? "ring-success/20" : "ring-destructive/20",
      isCurrency: false,
    },
  ] : [];

  return (
    <motion.div
      variants={container}
      initial="initial"
      animate="animate"
      className="p-3 sm:p-6 space-y-5 sm:space-y-6 max-w-7xl mx-auto min-w-0"
    >
      {/* ─── Premium Header ─── */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            {getGreeting()}{firstName ? `, ${firstName}` : ""}
            <motion.span
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
              transition={{ duration: 1.5, delay: 0.5, ease: "easeInOut" }}
              className="inline-block origin-[70%_70%] text-2xl sm:text-3xl"
            >
              👋
            </motion.span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            Resumo inteligente da sua empresa
            {dataUpdatedAt > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 bg-muted/50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                {new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => refetch()} title="Atualizar dados">
            <RefreshCw className="w-4 h-4" />
          </Button>
          {stats && (
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/15 backdrop-blur-sm">
                <Package className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono font-bold text-sm text-primary">{stats.totalProducts}</span>
                <span className="text-[10px] text-muted-foreground">produtos</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border backdrop-blur-sm">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-mono font-bold text-sm text-foreground">{stats.totalClients}</span>
                <span className="text-[10px] text-muted-foreground">clientes</span>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Quick Access */}
      <motion.div variants={item} data-tour="quick-access">
        <QuickAccessCards productsAtRisk={stats?.productsAtRisk} activeAlerts={stats?.activeAlerts} />
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
                  <Skeleton className="h-9 w-9 rounded-xl" />
                </div>
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
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
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Skeleton className="lg:col-span-3 h-64 rounded-2xl" />
            <Skeleton className="lg:col-span-2 h-64 rounded-2xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : stats ? (
        <>
          {/* ─── Premium KPI Cards ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {kpis.map((kpi, i) => (
              <motion.div
                key={kpi.title}
                variants={item}
                whileHover={{ y: -2, transition: { duration: 0.2 } }}
                className="group bg-card rounded-2xl p-4 sm:p-5 border border-border hover:border-primary/25 transition-all duration-300 hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.15)] relative overflow-hidden"
              >
                {/* Decorative gradient */}
                <div className={`absolute top-0 right-0 w-24 h-24 ${kpi.bgAccent} rounded-full blur-3xl -translate-y-10 translate-x-10 opacity-40 group-hover:opacity-80 transition-opacity duration-500`} />
                <div className={`absolute bottom-0 left-0 w-16 h-16 ${kpi.bgAccent} rounded-full blur-2xl translate-y-10 -translate-x-6 opacity-0 group-hover:opacity-30 transition-opacity duration-500`} />
                
                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">{kpi.title}</span>
                    <div className={`w-9 h-9 rounded-xl ${kpi.bgAccent} flex items-center justify-center ring-1 ${kpi.ringAccent} group-hover:scale-110 transition-transform duration-300`}>
                      <kpi.icon className={`w-4 h-4 ${kpi.accent}`} />
                    </div>
                  </div>
                  <motion.p
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 * i + 0.3, duration: 0.4 }}
                    className="text-xl sm:text-2xl font-extrabold font-mono text-foreground tracking-tight"
                  >
                    <CountUpValue value={kpi.rawValue} isCurrency={kpi.isCurrency} />
                  </motion.p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1.5 font-medium">{kpi.sub}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ─── Status Row ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {/* Fiscal */}
            <motion.div
              variants={item}
              className={`rounded-2xl p-4 sm:p-5 border backdrop-blur-sm transition-shadow duration-300 ${stats.fiscalProtected ? "bg-success/5 border-success/20 hover:shadow-[0_4px_20px_-8px_hsl(var(--success)/0.2)]" : "bg-destructive/5 border-destructive/20 hover:shadow-[0_4px_20px_-8px_hsl(var(--destructive)/0.2)]"}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ring-1 ${stats.fiscalProtected ? "bg-success/15 ring-success/20" : "bg-destructive/15 ring-destructive/20"}`}>
                  <Shield className={`w-5 h-5 ${stats.fiscalProtected ? "text-success" : "text-destructive"}`} />
                </div>
                <div>
                  <p className={`text-sm font-bold ${stats.fiscalProtected ? "text-success" : "text-destructive"}`}>
                    {stats.fiscalProtected ? "Proteção Ativa" : "Sem Proteção"}
                  </p>
                  <p className="text-xs text-muted-foreground">{stats.fiscalProtected ? "Escudo Fiscal ativo" : "Ative o Modo Seguro"}</p>
                </div>
                {stats.fiscalProtected && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-success animate-pulse" />
                )}
              </div>
            </motion.div>

            {/* Health */}
            <motion.div variants={item} className="bg-card rounded-2xl p-4 sm:p-5 border border-border hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ring-1 ${stats.healthScore >= 80 ? "bg-success/15 ring-success/20" : stats.healthScore >= 50 ? "bg-warning/15 ring-warning/20" : "bg-destructive/15 ring-destructive/20"}`}>
                  <Heart className={`w-5 h-5 ${healthColor(stats.healthScore)}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Saúde Financeira</p>
                    <motion.p
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.6, type: "spring", stiffness: 200 }}
                      className={`text-xl font-extrabold font-mono ${healthColor(stats.healthScore)}`}
                    >
                      {stats.healthScore}
                    </motion.p>
                  </div>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.healthScore}%` }}
                  transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.4 }}
                  className={`h-full rounded-full ${healthBg(stats.healthScore)} shadow-[0_0_8px_hsl(var(--success)/0.3)]`}
                />
              </div>
            </motion.div>

            {/* Alerts */}
            <motion.div variants={item} className="bg-card rounded-2xl p-4 sm:p-5 border border-border hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
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
                  <div key={row.label} className="flex justify-between items-center py-0.5">
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

          {/* ─── Premium Recent Sales ─── */}
          <motion.div variants={item} className="bg-card rounded-2xl border border-border overflow-clip hover:border-primary/15 transition-colors duration-300">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-primary/3 to-transparent">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-bold text-foreground">Últimas Vendas</h2>
              </div>
              <Link to="/vendas" className="text-xs text-primary hover:text-primary/80 font-semibold transition-colors flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-primary/10">
                Ver todas
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            
            {/* Mobile */}
            <div className="sm:hidden divide-y divide-border">
              {stats.recentSales.length === 0 ? (
                <p className="px-4 py-10 text-center text-muted-foreground text-sm">Nenhuma venda registrada</p>
              ) : (
                stats.recentSales.map((sale, i) => (
                  <div key={sale.id} className={`px-4 py-3 flex items-center justify-between transition-colors ${i % 2 === 0 ? "bg-transparent" : "bg-muted/20"}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg">{getPaymentIcon(sale.payment_method)}</span>
                      <div>
                        <p className="text-sm font-mono font-medium text-foreground">#{sale.number ? String(sale.number).padStart(6, "0") : sale.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground capitalize mt-0.5">{sale.payment_method || "—"}</p>
                      </div>
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
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Nº</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Pagamento</th>
                    <th className="text-right px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total</th>
                    <th className="text-center px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentSales.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">Nenhuma venda registrada</td></tr>
                  ) : (
                    stats.recentSales.map((sale, i) => (
                      <tr key={sale.id} className={`border-b border-border/50 last:border-0 transition-colors duration-150 hover:bg-primary/5 ${i % 2 === 0 ? "bg-transparent" : "bg-muted/15"}`}>
                        <td className="px-5 py-3.5 font-mono font-semibold text-foreground">
                          <span className="text-muted-foreground/50 mr-0.5">#</span>
                          {sale.number ? String(sale.number).padStart(6, "0") : sale.id.slice(0, 8)}
                        </td>
                        <td className="px-5 py-3.5 text-foreground capitalize">
                          <span className="inline-flex items-center gap-2">
                            <span className="text-base">{getPaymentIcon(sale.payment_method)}</span>
                            {sale.payment_method || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-primary">{formatCurrency(sale.total_value)}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${sale.status === "autorizado" ? "bg-success/10 text-success" : sale.status === "rejeitado" ? "bg-destructive/10 text-destructive" : sale.status === "completed" ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sale.status === "autorizado" ? "bg-success" : sale.status === "rejeitado" ? "bg-destructive" : sale.status === "completed" ? "bg-primary" : "bg-warning"}`} />
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
