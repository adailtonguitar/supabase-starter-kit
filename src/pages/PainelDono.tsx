import { motion } from "framer-motion";
import {
  DollarSign, ShoppingCart, TrendingUp, Package, AlertTriangle,
  Users, BarChart3, ArrowUp, ArrowDown, RefreshCw, Crown,
} from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  trend,
  delay,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  color: string;
  trend?: number;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-2xl border border-border bg-card p-5 flex items-start gap-4 active:scale-[0.98] transition-transform"
    >
      <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-black tracking-tight mt-0.5">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {trend !== undefined && trend !== 0 && (
        <div className={`flex items-center gap-0.5 text-xs font-bold ${trend > 0 ? "text-emerald-500" : "text-destructive"}`}>
          {trend > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {Math.abs(trend)}%
        </div>
      )}
    </motion.div>
  );
}

export default function PainelDono() {
  const { data: stats, isLoading, refetch } = useDashboardStats();
  const navigate = useNavigate();

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const margemLucro = stats.monthRevenue > 0
    ? ((stats.monthProfit / stats.monthRevenue) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Crown className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Painel do Dono</h1>
            <p className="text-xs text-muted-foreground">Visão rápida do seu negócio</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </motion.div>

      {/* Score de saúde */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-primary/10 p-5 text-center"
      >
        <p className="text-xs text-muted-foreground font-medium mb-1">Saúde do Negócio</p>
        <div className="flex items-center justify-center gap-3">
          <div className="relative w-16 h-16">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-muted/30"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${stats.healthScore}, 100`}
                className={stats.healthScore >= 70 ? "text-emerald-500" : stats.healthScore >= 40 ? "text-amber-500" : "text-destructive"}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-black">
              {stats.healthScore}
            </span>
          </div>
          <div className="text-left">
            <p className="font-bold text-base">
              {stats.healthScore >= 70 ? "Excelente" : stats.healthScore >= 40 ? "Atenção" : "Crítico"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {stats.productsAtRisk > 0 ? `${stats.productsAtRisk} produtos em risco` : "Estoque saudável"}
            </p>
          </div>
        </div>
      </motion.div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          icon={DollarSign}
          label="Vendas Hoje"
          value={formatBRL(stats.salesToday)}
          sub={`${stats.salesCountToday} vendas`}
          color="bg-emerald-500/10 text-emerald-500"
          delay={0.15}
        />
        <KpiCard
          icon={ShoppingCart}
          label="Ticket Médio"
          value={formatBRL(stats.ticketMedio)}
          color="bg-blue-500/10 text-blue-500"
          delay={0.2}
        />
        <KpiCard
          icon={TrendingUp}
          label="Faturamento Mês"
          value={formatBRL(stats.monthRevenue)}
          trend={stats.salesGrowth}
          color="bg-primary/10 text-primary"
          delay={0.25}
        />
        <KpiCard
          icon={BarChart3}
          label="Lucro Mês"
          value={formatBRL(stats.monthProfit)}
          sub={`Margem ${margemLucro}%`}
          color={stats.monthProfit >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"}
          delay={0.3}
        />
        <KpiCard
          icon={Package}
          label="Produtos"
          value={String(stats.totalProducts)}
          sub={`${stats.productsAtRisk} em risco`}
          color="bg-amber-500/10 text-amber-600"
          delay={0.35}
        />
        <KpiCard
          icon={Users}
          label="Clientes"
          value={String(stats.totalClients)}
          color="bg-violet-500/10 text-violet-500"
          delay={0.4}
        />
      </div>

      {/* Alertas */}
      {stats.productsAtRisk > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3"
          onClick={() => navigate("/estoque/ruptura")}
        >
          <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold">{stats.productsAtRisk} produtos com estoque baixo</p>
            <p className="text-xs text-muted-foreground">Toque para ver o relatório de ruptura</p>
          </div>
          <ArrowUp className="w-4 h-4 text-muted-foreground rotate-90" />
        </motion.div>
      )}

      {/* Top produtos */}
      {stats.topProducts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-2xl border border-border bg-card p-5"
        >
          <h3 className="font-bold text-sm mb-3">🏆 Mais Vendidos Hoje</h3>
          <div className="space-y-2.5">
            {stats.topProducts.slice(0, 5).map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.quantity}un</span>
                <span className="text-sm font-semibold">{formatBRL(p.revenue)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="grid grid-cols-3 gap-2"
      >
        {[
          { label: "Dashboard", path: "/dashboard", icon: BarChart3 },
          { label: "PDV", path: "/pdv", icon: ShoppingCart },
          { label: "Estoque", path: "/produtos", icon: Package },
        ].map((action) => (
          <Button
            key={action.path}
            variant="outline"
            className="h-16 flex-col gap-1.5 text-xs font-medium"
            onClick={() => navigate(action.path)}
          >
            <action.icon className="w-5 h-5" />
            {action.label}
          </Button>
        ))}
      </motion.div>
    </div>
  );
}
