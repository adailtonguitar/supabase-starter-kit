import { Link } from "react-router-dom";
import { AlertTriangle, Package, FileText, CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";

interface DashboardAlertsProps {
  productsAtRisk: number;
  overdueBills: number;
  overdueBillsCount: number;
  fiadoTotal: number;
  fiadoCount: number;
  billsDueToday: number;
  billsDueTodayCount: number;
  pendingReceivables: number;
  pendingReceivablesCount: number;
}

export function DashboardAlerts({
  productsAtRisk,
  overdueBills,
  overdueBillsCount,
  fiadoTotal,
  fiadoCount,
  billsDueToday,
  billsDueTodayCount,
}: DashboardAlertsProps) {
  const alerts: Array<{
    icon: typeof AlertTriangle;
    label: string;
    detail: string;
    to: string;
    color: string;
    bg: string;
    border: string;
  }> = [];

  if (overdueBillsCount > 0) {
    alerts.push({
      icon: AlertTriangle,
      label: `${overdueBillsCount} conta${overdueBillsCount > 1 ? "s" : ""} a pagar vencida${overdueBillsCount > 1 ? "s" : ""}`,
      detail: formatCurrency(overdueBills),
      to: "/financeiro",
      color: "text-destructive",
      bg: "bg-destructive/10",
      border: "border-destructive/20",
    });
  }

  if (billsDueTodayCount > 0) {
    alerts.push({
      icon: CreditCard,
      label: `${billsDueTodayCount} conta${billsDueTodayCount > 1 ? "s" : ""} vence${billsDueTodayCount > 1 ? "m" : ""} hoje`,
      detail: formatCurrency(billsDueToday),
      to: "/financeiro",
      color: "text-warning",
      bg: "bg-warning/10",
      border: "border-warning/20",
    });
  }

  if (productsAtRisk > 0) {
    alerts.push({
      icon: Package,
      label: `${productsAtRisk} produto${productsAtRisk > 1 ? "s" : ""} com estoque baixo`,
      detail: "Repor estoque",
      to: "/produtos",
      color: "text-warning",
      bg: "bg-warning/10",
      border: "border-warning/20",
    });
  }

  if (fiadoCount > 0) {
    alerts.push({
      icon: FileText,
      label: `${fiadoCount} venda${fiadoCount > 1 ? "s" : ""} no fiado`,
      detail: formatCurrency(fiadoTotal),
      to: "/fiado",
      color: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/20",
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {alerts.map((alert, i) => (
        <motion.div
          key={alert.label}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06, duration: 0.35 }}
        >
          <Link
            to={alert.to}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${alert.border} ${alert.bg} hover:opacity-80 transition-opacity group`}
          >
            <div className={`w-9 h-9 rounded-lg ${alert.bg} flex items-center justify-center shrink-0`}>
              <alert.icon className={`w-4.5 h-4.5 ${alert.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${alert.color} truncate`}>{alert.label}</p>
              <p className="text-xs text-muted-foreground">{alert.detail}</p>
            </div>
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Ver →</span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
