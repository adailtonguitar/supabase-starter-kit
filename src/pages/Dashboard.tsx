import { useState, useEffect } from "react";
import {
  TrendingUp, TrendingDown, ShoppingBag, DollarSign, AlertTriangle,
  Shield, Heart, Package, Users, ArrowUpRight,
  Zap, RefreshCw, Wallet, BarChart3, LayoutGrid, Sparkles, CheckCircle2,
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
import { DashboardAlerts, buildDashboardAlertsList } from "@/components/dashboard/DashboardAlerts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useAdminRole } from "@/hooks/useAdminRole";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";

const DASHBOARD_SUMMARY_STORAGE_KEY = "as_dashboard_owner_summary";

function readSummaryPreference(): boolean {
  try {
    return localStorage.getItem(DASHBOARD_SUMMARY_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSummaryPreference(on: boolean) {
  try {
    localStorage.setItem(DASHBOARD_SUMMARY_STORAGE_KEY, on ? "1" : "0");
  } catch { /* ignore */ }
}

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

type OwnerSummaryStats = {
  salesToday: number;
  salesCountToday: number;
  monthProfit: number;
  healthScore: number;
  productsAtRisk: number;
  overdueBills: number;
  overdueBillsCount: number;
  fiadoTotal: number;
  fiadoCount: number;
  billsDueToday: number;
  billsDueTodayCount: number;
  pendingReceivables: number;
  pendingReceivablesCount: number;
};

function DashboardOwnerSummaryView({
  stats,
  onShowFull,
}: {
  stats: OwnerSummaryStats;
  onShowFull: () => void;
}) {
  const healthAnimated = useCountUp(stats.healthScore, 900, 0);

  const alertProps = {
    productsAtRisk: stats.productsAtRisk,
    overdueBills: stats.overdueBills,
    overdueBillsCount: stats.overdueBillsCount,
    fiadoTotal: stats.fiadoTotal,
    fiadoCount: stats.fiadoCount,
    billsDueToday: stats.billsDueToday,
    billsDueTodayCount: stats.billsDueTodayCount,
    pendingReceivables: stats.pendingReceivables,
    pendingReceivablesCount: stats.pendingReceivablesCount,
  };
  const alerts = buildDashboardAlertsList(alertProps);
  const primary = alerts[0];

  const healthColor =
    stats.healthScore >= 80 ? "text-success" : stats.healthScore >= 50 ? "text-warning" : "text-destructive";

  const moneyCards = [
    {
      title: "Vendas hoje",
      raw: stats.salesToday,
      sub: `${stats.salesCountToday} venda${stats.salesCountToday !== 1 ? "s" : ""}`,
      icon: DollarSign,
      accent: "text-primary",
      bg: "bg-primary/10",
      ring: "ring-primary/20",
    },
    {
      title: "Lucro est. no mês",
      raw: stats.monthProfit,
      sub: "Estimativa com base nas vendas",
      icon: Wallet,
      accent: "text-success",
      bg: "bg-success/10",
      ring: "ring-success/20",
    },
  ] as const;

  const healthBg =
    stats.healthScore >= 80 ? "bg-success/10" : stats.healthScore >= 50 ? "bg-warning/10" : "bg-destructive/10";
  const healthRing =
    stats.healthScore >= 80 ? "ring-success/20" : stats.healthScore >= 50 ? "ring-warning/20" : "ring-destructive/20";

  return (
    <motion.div variants={container} initial="initial" animate="animate" className="space-y-4 sm:space-y-5">
      <motion.p variants={item} className="text-xs text-muted-foreground flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
        Visão rápida: o essencial para decidir em segundos. Use o botão abaixo para gráficos e detalhes.
      </motion.p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {moneyCards.map((k) => (
          <motion.div
            key={k.title}
            variants={item}
            className="bg-card rounded-2xl p-4 sm:p-5 border border-border relative overflow-hidden"
          >
            <div className={`absolute top-0 right-0 w-16 h-16 ${k.bg} rounded-full blur-2xl -translate-y-6 translate-x-6 opacity-40`} />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{k.title}</span>
                <div className={`w-8 h-8 rounded-xl ${k.bg} flex items-center justify-center ring-1 ${k.ring}`}>
                  <k.icon className={`w-4 h-4 ${k.accent}`} />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight">
                <CountUpValue value={k.raw} isCurrency />
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 font-medium">{k.sub}</p>
            </div>
          </motion.div>
        ))}
        <motion.div variants={item} className="bg-card rounded-2xl p-4 sm:p-5 border border-border relative overflow-hidden">
          <div className={`absolute top-0 right-0 w-16 h-16 ${healthBg} rounded-full blur-2xl -translate-y-6 translate-x-6 opacity-40`} />
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Saúde da loja</span>
              <div className={`w-8 h-8 rounded-xl ${healthBg} flex items-center justify-center ring-1 ${healthRing}`}>
                <Heart className={`w-4 h-4 ${healthColor}`} />
              </div>
            </div>
            <p className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${healthColor}`}>
              {Math.round(healthAnimated)}
              <span className="text-lg font-bold text-muted-foreground">/100</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 font-medium">
              {stats.healthScore >= 80 ? "Excelente" : stats.healthScore >= 50 ? "Regular" : "Precisa atenção"}
            </p>
          </div>
        </motion.div>
      </div>

      <motion.div variants={item}>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Alerta prioritário</p>
        {primary ? (
          <Link
            to={primary.to}
            className={`flex items-center gap-3 px-4 py-4 rounded-xl border ${primary.border} ${primary.bg} hover:opacity-90 transition-opacity`}
          >
            <div className={`w-10 h-10 rounded-lg ${primary.bg} flex items-center justify-center shrink-0`}>
              <primary.icon className={`w-5 h-5 ${primary.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${primary.color}`}>{primary.label}</p>
              <p className="text-xs text-muted-foreground">{primary.detail}</p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground shrink-0">Abrir →</span>
          </Link>
        ) : (
          <div className="flex items-start gap-3 px-4 py-4 rounded-xl border border-success/25 bg-success/5">
            <CheckCircle2 className="w-9 h-9 text-success shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">Nada urgente nos alertas</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sem contas vencidas, vencendo hoje, estoque crítico ou pendências destacadas neste painel.
              </p>
            </div>
          </div>
        )}
      </motion.div>

      <motion.div variants={item}>
        <Button variant="outline" className="w-full gap-2 h-11 border-primary/30 hover:bg-primary/5" onClick={onShowFull}>
          <LayoutGrid className="w-4 h-4" />
          Ver painel completo
        </Button>
      </motion.div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading, dataUpdatedAt, refetch } = useDashboardStats();
  const { user } = useAuth();
  const plan = usePlanFeatures();
  const { isSuperAdmin } = useAdminRole();
  const firstName = getFirstName(user?.email);
  const [ownerSummary, setOwnerSummary] = useState(readSummaryPreference);

  useEffect(() => {
    writeSummaryPreference(ownerSummary);
  }, [ownerSummary]);

  // Emissor-only plan: redirect to standalone emitter (super_admin bypasses)
  if (!isSuperAdmin && plan.isEmissorOnly()) {
    return <Navigate to="/emissor-nfe" replace />;
  }

  const kpis = stats ? [
    {
      title: "Vendas Hoje",
      rawValue: stats.salesToday,
      value: formatCurrency(stats.salesToday),
      sub: `${stats.salesCountToday} venda${stats.salesCountToday !== 1 ? "s" : ""}`,
      icon: DollarSign,
      accent: "text-primary",
      bgAccent: "bg-primary/10",
      ringAccent: "ring-primary/20",
      isCurrency: true,
    },
    {
      title: "Ticket Médio",
      rawValue: stats.ticketMedio,
      value: formatCurrency(stats.ticketMedio),
      sub: "valor médio por venda",
      icon: ShoppingBag,
      accent: "text-primary",
      bgAccent: "bg-primary/10",
      ringAccent: "ring-primary/20",
      isCurrency: true,
    },
    {
      title: "Faturamento Mensal",
      rawValue: stats.monthRevenue,
      value: formatCurrency(stats.monthRevenue),
      sub: `Lucro est.: ${formatCurrency(stats.monthProfit)}`,
      icon: Wallet,
      accent: "text-success",
      bgAccent: "bg-success/10",
      ringAccent: "ring-success/20",
      isCurrency: true,
    },
    {
      title: "Crescimento",
      rawValue: stats.salesGrowth,
      value: `${stats.salesGrowth >= 0 ? "+" : ""}${stats.salesGrowth.toFixed(1)}%`,
      sub: "comparado à semana anterior",
      icon: stats.salesGrowth >= 0 ? TrendingUp : TrendingDown,
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
      className="p-3 sm:p-6 space-y-4 sm:space-y-5 max-w-7xl mx-auto min-w-0"
    >
      {/* ─── Header ─── */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            {getGreeting()}{firstName ? `, ${firstName}` : ""}
            <motion.span
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
              transition={{ duration: 1.5, delay: 0.5, ease: "easeInOut" }}
              className="inline-block origin-[70%_70%] text-xl sm:text-2xl"
            >
              👋
            </motion.span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            Veja como está sua empresa hoje
            {dataUpdatedAt > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 bg-muted/50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                {new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          <div className="flex items-center gap-2 rounded-full border border-border/80 bg-muted/40 px-2.5 sm:px-3 py-1.5">
            <Switch
              id="dashboard-owner-summary"
              checked={ownerSummary}
              onCheckedChange={setOwnerSummary}
              aria-label="Alternar visão resumida do dono"
            />
            <Label htmlFor="dashboard-owner-summary" className="text-[11px] sm:text-xs font-medium cursor-pointer whitespace-nowrap leading-none">
              Resumo do dono
            </Label>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => refetch()} title="Atualizar dados">
            <RefreshCw className="w-4 h-4" />
          </Button>
          {stats && (
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 border border-border whitespace-nowrap">
                <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="font-mono font-bold text-sm text-foreground">{stats.totalProducts}</span>
                <span className="text-[10px] text-muted-foreground">produtos</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 border border-border whitespace-nowrap">
                <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="font-mono font-bold text-sm text-foreground">{stats.totalClients}</span>
                <span className="text-[10px] text-muted-foreground">clientes</span>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ─── Urgent Alerts (painel completo) ─── */}
      {stats && !ownerSummary && (
        <motion.div variants={item}>
          <DashboardAlerts
            productsAtRisk={stats.productsAtRisk}
            overdueBills={stats.overdueBills}
            overdueBillsCount={stats.overdueBillsCount}
            fiadoTotal={stats.fiadoTotal}
            fiadoCount={stats.fiadoCount}
            billsDueToday={stats.billsDueToday}
            billsDueTodayCount={stats.billsDueTodayCount}
            pendingReceivables={stats.pendingReceivables}
            pendingReceivablesCount={stats.pendingReceivablesCount}
          />
        </motion.div>
      )}

      {/* ─── Onboarding Checklist ─── */}
      {!ownerSummary && (
        <motion.div variants={item}>
          <OnboardingChecklist />
        </motion.div>
      )}

      {/* ─── Quick Access (painel completo) ─── */}
      {!ownerSummary && (
        <motion.div variants={item} data-tour="quick-access">
          <QuickAccessCards productsAtRisk={stats?.productsAtRisk} activeAlerts={stats?.activeAlerts} />
        </motion.div>
      )}

      {isLoading ? (
        ownerSummary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card rounded-2xl p-4 border border-border space-y-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-36" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-card rounded-2xl p-4 border border-border space-y-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <Skeleton className="lg:col-span-3 h-64 rounded-2xl" />
              <Skeleton className="lg:col-span-2 h-64 rounded-2xl" />
            </div>
          </div>
        )
      ) : stats && ownerSummary ? (
        <DashboardOwnerSummaryView stats={stats} onShowFull={() => setOwnerSummary(false)} />
      ) : stats ? (
        <>
          {/* ─── KPI Cards ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map((kpi, i) => (
              <motion.div
                key={kpi.title}
                variants={item}
                whileHover={{ y: -2, transition: { duration: 0.2 } }}
                className="group bg-card rounded-2xl p-4 sm:p-5 border border-border hover:border-primary/25 transition-all duration-300 hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.15)] relative overflow-hidden"
              >
                <div className={`absolute top-0 right-0 w-20 h-20 ${kpi.bgAccent} rounded-full blur-3xl -translate-y-8 translate-x-8 opacity-30 group-hover:opacity-60 transition-opacity duration-500`} />
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">{kpi.title}</span>
                    <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl ${kpi.bgAccent} flex items-center justify-center ring-1 ${kpi.ringAccent}`}>
                      <kpi.icon className={`w-4 h-4 ${kpi.accent}`} />
                    </div>
                  </div>
                  <motion.p
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 * i + 0.3, duration: 0.4 }}
                    className="text-lg sm:text-2xl font-extrabold font-mono text-foreground tracking-tight"
                  >
                    <CountUpValue value={kpi.rawValue} isCurrency={kpi.isCurrency} />
                  </motion.p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1 font-medium">{kpi.sub}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ─── Yesterday comparison + mini stats ─── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              {
                label: "Vendas Ontem",
                value: formatCurrency(stats.salesYesterday),
                sub: `${stats.salesCountYesterday} venda${stats.salesCountYesterday !== 1 ? "s" : ""}`,
                icon: BarChart3,
                color: "text-muted-foreground",
              },
              {
                label: "Saúde da Loja",
                value: `${stats.healthScore}/100`,
                sub: stats.healthScore >= 80 ? "Excelente" : stats.healthScore >= 50 ? "Regular" : "Precisa melhorar",
                icon: Heart,
                color: stats.healthScore >= 80 ? "text-success" : stats.healthScore >= 50 ? "text-warning" : "text-destructive",
              },
              {
                label: "Estoque Baixo",
                value: String(stats.productsAtRisk),
                sub: stats.productsAtRisk === 0 ? "Tudo ok ✓" : "produto(s) em risco",
                icon: Package,
                color: stats.productsAtRisk > 0 ? "text-warning" : "text-success",
              },
              {
                label: "Proteção Fiscal",
                value: stats.fiscalProtected ? "Ativa" : "Inativa",
                sub: stats.fiscalProtected ? "Escudo ativo ✓" : "Configure agora",
                icon: Shield,
                color: stats.fiscalProtected ? "text-success" : "text-destructive",
              },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                variants={item}
                className="bg-card rounded-xl p-3 sm:p-4 border border-border"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">{stat.label}</span>
                </div>
                <p className={`text-base sm:text-lg font-bold font-mono ${stat.color}`}>{stat.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{stat.sub}</p>
              </motion.div>
            ))}
          </div>

          {/* ─── Chart + Top Products ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <motion.div variants={item} className="lg:col-span-3" data-tour="sales-chart">
              <SalesChart data={stats.last7Days} />
            </motion.div>
            <motion.div variants={item} className="lg:col-span-2" data-tour="top-products">
              <TopProductsList products={stats.topProducts} />
            </motion.div>
          </div>

          {/* ─── AI Insight ─── */}
          <motion.div variants={item}>
            <AiInsightWidget />
          </motion.div>

          {/* ─── Recent Sales ─── */}
          <motion.div variants={item} className="bg-card rounded-2xl border border-border overflow-clip hover:border-primary/15 transition-colors duration-300">
            <div className="px-4 sm:px-5 py-3.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-bold text-foreground">Últimas Vendas</h2>
              </div>
              <Link to="/vendas" className="text-xs text-primary hover:text-primary/80 font-semibold transition-colors flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-primary/10">
                Ver todas <ArrowUpRight className="w-3 h-3" />
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
