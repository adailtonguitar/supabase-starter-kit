import { motion } from "framer-motion";
import {
  DollarSign, ShoppingCart, TrendingUp, Package, AlertTriangle,
  Users, BarChart3, ArrowUp, ArrowDown, RefreshCw, Crown,
  CreditCard, Receipt, Wallet, FileText, ArrowRight,
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
  onClick,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  color: string;
  trend?: number;
  delay: number;
  onClick?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3 active:scale-[0.98] transition-transform cursor-pointer"
      onClick={onClick}
    >
      <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
        <p className="text-lg font-black tracking-tight mt-0.5">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {trend !== undefined && trend !== 0 && (
        <div className={`flex items-center gap-0.5 text-[11px] font-bold ${trend > 0 ? "text-success" : "text-destructive"}`}>
          {trend > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {Math.abs(Math.round(trend))}%
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

  // Compare today vs yesterday
  const dailyTrend = stats.salesYesterday > 0
    ? ((stats.salesToday - stats.salesYesterday) / stats.salesYesterday) * 100
    : 0;

  return (
    <div className="space-y-4 pb-8 px-1">
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
            <p className="text-xs text-muted-foreground">Visão completa do seu negócio</p>
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
                fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none" stroke="currentColor" strokeWidth="3"
                strokeDasharray={`${stats.healthScore}, 100`}
                className={stats.healthScore >= 70 ? "text-success" : stats.healthScore >= 40 ? "text-warning" : "text-destructive"}
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

      {/* Comparativo Hoje vs Ontem */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="rounded-2xl border border-border bg-card p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">📊 Hoje vs Ontem</p>
          {dailyTrend !== 0 && (
            <span className={`text-xs font-bold flex items-center gap-0.5 ${dailyTrend > 0 ? "text-success" : "text-destructive"}`}>
              {dailyTrend > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              {Math.abs(Math.round(dailyTrend))}%
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 mobile-keep-grid">
          <div className="text-center p-3 rounded-xl bg-primary/5 border border-primary/10">
            <p className="text-[10px] text-muted-foreground font-medium">Hoje</p>
            <p className="text-lg font-black text-primary">{formatBRL(stats.salesToday)}</p>
            <p className="text-[10px] text-muted-foreground">{stats.salesCountToday} vendas</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-muted/30 border border-border">
            <p className="text-[10px] text-muted-foreground font-medium">Ontem</p>
            <p className="text-lg font-black">{formatBRL(stats.salesYesterday)}</p>
            <p className="text-[10px] text-muted-foreground">{stats.salesCountYesterday} vendas</p>
          </div>
        </div>
      </motion.div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-2 gap-3 mobile-keep-grid">
        <KpiCard
          icon={ShoppingCart}
          label="Ticket Médio"
          value={formatBRL(stats.ticketMedio)}
          color="bg-blue-500/10 text-blue-500"
          delay={0.15}
        />
        <KpiCard
          icon={TrendingUp}
          label="Faturamento Mês"
          value={formatBRL(stats.monthRevenue)}
          trend={stats.salesGrowth}
          color="bg-primary/10 text-primary"
          delay={0.2}
        />
        <KpiCard
          icon={BarChart3}
          label="Lucro Mês"
          value={formatBRL(stats.monthProfit)}
          sub={`Margem ${margemLucro}%`}
          color={stats.monthProfit >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"}
          delay={0.25}
        />
        <KpiCard
          icon={CreditCard}
          label="Fiado Pendente"
          value={formatBRL(stats.fiadoTotal)}
          sub={`${stats.fiadoCount} clientes`}
          color={stats.fiadoTotal > 0 ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-500"}
          delay={0.3}
          onClick={() => navigate("/fiado")}
        />
        <KpiCard
          icon={Package}
          label="Produtos"
          value={String(stats.totalProducts)}
          sub={`${stats.productsAtRisk} em risco`}
          color="bg-amber-500/10 text-amber-600"
          delay={0.35}
          onClick={() => navigate("/produtos")}
        />
        <KpiCard
          icon={Users}
          label="Clientes"
          value={String(stats.totalClients)}
          color="bg-violet-500/10 text-violet-500"
          delay={0.4}
          onClick={() => navigate("/cadastro/clientes")}
        />
      </div>

      {/* Contas a pagar */}
      {(stats.billsDueTodayCount > 0 || stats.overdueBillsCount > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42 }}
          className="rounded-2xl border border-border bg-card p-4 space-y-2"
          onClick={() => navigate("/financeiro")}
        >
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">💸 Contas a Pagar</p>
          {stats.overdueBillsCount > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/15">
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-destructive">{stats.overdueBillsCount} vencidas</p>
                <p className="text-[10px] text-muted-foreground">Total: {formatBRL(stats.overdueBills)}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          {stats.billsDueTodayCount > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-warning/5 border border-warning/15">
              <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center">
                <Receipt className="w-4 h-4 text-warning" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{stats.billsDueTodayCount} vencem hoje</p>
                <p className="text-[10px] text-muted-foreground">Total: {formatBRL(stats.billsDueToday)}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
        </motion.div>
      )}

      {/* Alertas estoque */}
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
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
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
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? "bg-amber-500/15 text-amber-500" : i === 1 ? "bg-muted text-muted-foreground" : i === 2 ? "bg-orange-500/10 text-orange-500" : "bg-muted/50 text-muted-foreground"
                }`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.quantity}un</span>
                <span className="text-sm font-semibold font-mono">{formatBRL(p.revenue)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Quick actions - expanded */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="space-y-2"
      >
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">⚡ Acesso Rápido</p>
        <div className="grid grid-cols-3 gap-2 mobile-keep-grid">
          {[
            { label: "PDV", path: "/pdv", icon: ShoppingCart, accent: "text-primary" },
            { label: "Dashboard", path: "/dashboard", icon: BarChart3, accent: "text-foreground" },
            { label: "Financeiro", path: "/financeiro", icon: Wallet, accent: "text-warning" },
            { label: "Fiado", path: "/fiado", icon: CreditCard, accent: "text-amber-500" },
            { label: "Relatórios", path: "/relatorio-vendas", icon: FileText, accent: "text-primary" },
            { label: "Estoque", path: "/produtos", icon: Package, accent: "text-foreground" },
          ].map((action) => (
            <Button
              key={action.path}
              variant="outline"
              className="h-14 flex-col gap-1 text-[11px] font-medium rounded-xl"
              onClick={() => navigate(action.path)}
            >
              <action.icon className={`w-4.5 h-4.5 ${action.accent}`} />
              {action.label}
            </Button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
