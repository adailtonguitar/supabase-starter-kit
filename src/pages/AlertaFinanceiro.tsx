import { AlertTriangle, TrendingDown, Package, Shield, ArrowDown, Info } from "lucide-react";
import { motion } from "framer-motion";
import { useFinancialAlerts, type FinancialAlert, type AlertSeverity } from "@/hooks/useFinancialAlerts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/mock-data";

const severityConfig: Record<AlertSeverity, { label: string; color: string; bgColor: string; icon: typeof AlertTriangle }> = {
  high: { label: "ALTO", color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/30", icon: AlertTriangle },
  medium: { label: "MÉDIO", color: "text-warning", bgColor: "bg-warning/10 border-warning/30", icon: TrendingDown },
  low: { label: "BAIXO", color: "text-muted-foreground", bgColor: "bg-muted border-border", icon: Info },
};

const typeIcons: Record<string, typeof AlertTriangle> = {
  selling_below_cost: TrendingDown, low_margin: ArrowDown, stale_stock: Package, missing_fiscal: Shield, low_stock: Package,
};

function AlertCard({ alert, index }: { alert: FinancialAlert; index: number }) {
  const config = severityConfig[alert.severity];
  const Icon = typeIcons[alert.type] || AlertTriangle;
  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.03 }}>
      <Card className={`${config.bgColor} border`}><CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${alert.severity === "high" ? "bg-destructive/20" : alert.severity === "medium" ? "bg-warning/20" : "bg-muted"}`}><Icon className={`w-5 h-5 ${config.color}`} /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1"><h3 className="text-sm font-semibold text-foreground">{alert.title}</h3><Badge variant={alert.severity === "high" ? "destructive" : alert.severity === "medium" ? "secondary" : "outline"} className="text-[10px]">{config.label}</Badge></div>
            <p className="text-xs text-muted-foreground">{alert.description}</p>
            <div className="mt-2 flex items-center gap-1 text-xs text-primary"><span>💡</span><span>{alert.suggestion}</span></div>
          </div>
          {alert.value !== undefined && (
            <div className="text-right flex-shrink-0"><p className={`text-sm font-bold font-mono ${config.color}`}>
              {alert.type === "low_margin" ? `${alert.value.toFixed(1)}%` : alert.type === "low_stock" ? `${alert.value} un.` : formatCurrency(Math.abs(alert.value))}
            </p></div>
          )}
        </div>
      </CardContent></Card>
    </motion.div>
  );
}

export default function AlertaFinanceiro() {
  const { data: alerts = [], isLoading } = useFinancialAlerts();
  const highCount = alerts.filter(a => a.severity === "high").length;
  const mediumCount = alerts.filter(a => a.severity === "medium").length;
  const lowCount = alerts.filter(a => a.severity === "low").length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div><h1 className="text-2xl font-bold text-foreground">Alertas de Dinheiro Perdido</h1><p className="text-sm text-muted-foreground mt-1">Identificação automática de perdas invisíveis</p></div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-4 border border-border card-shadow"><p className="text-xs text-muted-foreground">Total de Alertas</p><p className="text-2xl font-bold text-foreground">{alerts.length}</p></motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-destructive/10 rounded-xl p-4 border border-destructive/30"><p className="text-xs text-destructive">Risco Alto</p><p className="text-2xl font-bold text-destructive">{highCount}</p></motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-warning/10 rounded-xl p-4 border border-warning/30"><p className="text-xs text-warning">Risco Médio</p><p className="text-2xl font-bold text-warning">{mediumCount}</p></motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-muted rounded-xl p-4 border border-border"><p className="text-xs text-muted-foreground">Risco Baixo</p><p className="text-2xl font-bold text-foreground">{lowCount}</p></motion.div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : alerts.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Shield className="w-12 h-12 mx-auto text-success mb-3" /><h3 className="text-lg font-semibold text-foreground">Nenhum alerta ativo!</h3><p className="text-sm text-muted-foreground mt-1">Sua empresa está com boa saúde financeira.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">{alerts.map((alert, i) => <AlertCard key={alert.id} alert={alert} index={i} />)}</div>
      )}
    </div>
  );
}