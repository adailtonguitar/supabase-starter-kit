import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Bell, AlertTriangle, UserX, CreditCard, Monitor, RefreshCw,
  Clock, Bug, ChevronDown, ChevronUp, Building2, Loader2,
} from "lucide-react";
import { adminQuery } from "@/lib/admin-query";

interface Alert {
  id: string;
  type: "errors" | "inactive" | "expiring" | "stuck_cash";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  company_name: string;
  company_id: string;
  timestamp: string;
  meta?: Record<string, any>;
}

const SEVERITY_CONFIG = {
  critical: {
    bg: "bg-destructive/10 border-destructive/30",
    badge: "destructive" as const,
    icon: "text-destructive",
  },
  warning: {
    bg: "bg-warning/10 border-warning/30",
    badge: "outline" as const,
    icon: "text-warning",
  },
  info: {
    bg: "bg-primary/10 border-primary/30",
    badge: "outline" as const,
    icon: "text-primary",
  },
};

const TYPE_ICONS = {
  errors: Bug,
  inactive: UserX,
  expiring: CreditCard,
  stuck_cash: Monitor,
};

const TYPE_LABELS = {
  errors: "Erros Frequentes",
  inactive: "Inatividade",
  expiring: "Assinatura Vencendo",
  stuck_cash: "Caixa Travado",
};

export function AdminProactiveAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = async () => {
    try {
      const generatedAlerts: Alert[] = [];

      // 1. Companies with many errors (last 24h)
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const recentErrors = await adminQuery<{ id: string; error_message: string; created_at: string }>({
        table: "system_errors",
        select: "id, error_message, created_at",
        filters: [{ op: "gte", column: "created_at", value: dayAgo }],
        limit: 200,
      });

      if (recentErrors.length > 10) {
        generatedAlerts.push({
          id: "errors-global",
          type: "errors",
          severity: recentErrors.length > 30 ? "critical" : "warning",
          title: `${recentErrors.length} erros nas últimas 24h`,
          description: `Erro mais recente: ${recentErrors[0]?.error_message?.slice(0, 80) || "N/A"}`,
          company_name: "Sistema Global",
          company_id: "",
          timestamp: recentErrors[0]?.created_at || new Date().toISOString(),
        });
      }

      // 2. Inactive companies (no action_logs in 3+ days)
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
      const allCompaniesRaw = await adminQuery<{ id: string; name: string; created_at: string }>({
        table: "companies",
        select: "id, name, created_at",
        limit: 500,
      });

      // Filter out demo companies from all alerts
      const isDemo = (name: string) => name.toLowerCase().startsWith("loja demo");
      const allCompanies = allCompaniesRaw.filter(c => !isDemo(c.name));

      // Get companies with recent activity
      const recentActivity = await adminQuery<{ company_id: string }>({
        table: "action_logs",
        select: "company_id",
        filters: [{ op: "gte", column: "created_at", value: threeDaysAgo }],
        limit: 1000,
      });
      const activeCompanyIds = new Set(recentActivity.map(a => a.company_id).filter(Boolean));

      // Find inactive companies (exclude very new ones < 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const inactiveCompanies = allCompanies.filter(
        c => !activeCompanyIds.has(c.id) && c.created_at < sevenDaysAgo
      );

      if (inactiveCompanies.length > 0) {
        // Group: show up to 5 individually
        inactiveCompanies.slice(0, 5).forEach(c => {
          generatedAlerts.push({
            id: `inactive-${c.id}`,
            type: "inactive",
            severity: "warning",
            title: `${c.name} sem atividade`,
            description: "Nenhum acesso nos últimos 3+ dias. Risco de churn.",
            company_name: c.name,
            company_id: c.id,
            timestamp: new Date().toISOString(),
          });
        });

        if (inactiveCompanies.length > 5) {
          generatedAlerts.push({
            id: "inactive-more",
            type: "inactive",
            severity: "info",
            title: `+${inactiveCompanies.length - 5} empresas inativas`,
            description: "Verifique na aba Leads para detalhes completos.",
            company_name: "Várias",
            company_id: "",
            timestamp: new Date().toISOString(),
          });
        }
      }

      // 3. Expiring subscriptions (next 7 days)
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const expiringPlans = await adminQuery<{ company_id: string; expires_at: string; status: string }>({
        table: "company_plans",
        select: "company_id, expires_at, status",
        filters: [
          { op: "eq", column: "status", value: "active" },
          { op: "lte", column: "expires_at", value: nextWeek },
          { op: "gte", column: "expires_at", value: today },
        ],
        limit: 50,
      });

      for (const plan of expiringPlans) {
        const company = allCompanies.find(c => c.id === plan.company_id);
        if (!company) continue;
        const daysLeft = Math.ceil((new Date(plan.expires_at).getTime() - Date.now()) / 86400000);
        generatedAlerts.push({
          id: `expiring-${plan.company_id}`,
          type: "expiring",
          severity: daysLeft <= 2 ? "critical" : "warning",
          title: `${company.name} vence em ${daysLeft} dia${daysLeft > 1 ? "s" : ""}`,
          description: `Assinatura expira em ${new Date(plan.expires_at).toLocaleDateString("pt-BR")}`,
          company_name: company.name,
          company_id: plan.company_id,
          timestamp: plan.expires_at,
        });
      }

      // 4. Stuck cash sessions (open > 12h)
      const twelveHoursAgo = new Date(Date.now() - 12 * 3600000).toISOString();
      const openSessions = await adminQuery<{ id: string; company_id: string; opened_at: string }>({
        table: "cash_sessions",
        select: "id, company_id, opened_at",
        filters: [
          { op: "eq", column: "status", value: "aberto" },
          { op: "lte", column: "opened_at", value: twelveHoursAgo },
        ],
        limit: 20,
      });

      for (const session of openSessions) {
        const company = allCompanies.find(c => c.id === session.company_id);
        if (!company) continue;
        const hoursOpen = Math.round((Date.now() - new Date(session.opened_at).getTime()) / 3600000);
        generatedAlerts.push({
          id: `cash-${session.id}`,
          type: "stuck_cash",
          severity: hoursOpen > 24 ? "critical" : "warning",
          title: `Caixa aberto há ${hoursOpen}h`,
          description: `${company.name} — pode estar travado. Verifique no Painel de Saúde.`,
          company_name: company.name,
          company_id: session.company_id,
          timestamp: session.opened_at,
          meta: { session_id: session.id },
        });
      }

      // Sort: critical first, then warning, then info
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      generatedAlerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      setAlerts(generatedAlerts);
    } catch (e) {
      console.error("Alerts load error:", e);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadAlerts();
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadAlerts, 5 * 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadAlerts();
    toast.success("Alertas atualizados!");
  };

  const criticalCount = alerts.filter(a => a.severity === "critical").length;
  const warningCount = alerts.filter(a => a.severity === "warning").length;

  return (
    <Card className={criticalCount > 0 ? "border-destructive/30" : ""}>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className="relative">
              <Bell className={`w-4 h-4 ${criticalCount > 0 ? "text-destructive" : "text-primary"}`} />
              {alerts.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                  {alerts.length}
                </span>
              )}
            </div>
            Alertas Proativos
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-[10px] h-5">{criticalCount} críticos</Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="outline" className="text-warning border-warning text-[10px] h-5">{warningCount} atenção</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="p-4 pt-2">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-6">
                  <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-2">
                    <Bell className="w-5 h-5 text-success" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Tudo tranquilo! 🎉</p>
                  <p className="text-xs text-muted-foreground mt-1">Nenhum alerta no momento</p>
                </div>
              ) : (
                <ScrollArea className={alerts.length > 5 ? "h-[400px]" : ""}>
                  <div className="space-y-2">
                    {alerts.map((alert, i) => {
                      const config = SEVERITY_CONFIG[alert.severity];
                      const TypeIcon = TYPE_ICONS[alert.type];
                      return (
                        <motion.div
                          key={alert.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className={`flex items-start gap-3 p-3 rounded-xl border ${config.bg}`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            alert.severity === "critical" ? "bg-destructive/15" : 
                            alert.severity === "warning" ? "bg-warning/15" : "bg-primary/15"
                          }`}>
                            <TypeIcon className={`w-4 h-4 ${config.icon}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm font-semibold text-foreground truncate">{alert.title}</p>
                              <Badge variant={config.badge} className="text-[9px] h-4 shrink-0">
                                {TYPE_LABELS[alert.type]}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{alert.description}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Building2 className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">{alert.company_name}</span>
                              <Clock className="w-3 h-3 text-muted-foreground ml-1" />
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(alert.timestamp).toLocaleDateString("pt-BR")}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}

              {/* Summary footer */}
              {alerts.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    Atualizado automaticamente a cada 5 minutos
                  </p>
                  <div className="flex gap-2 text-[10px]">
                    {alerts.filter(a => a.type === "errors").length > 0 && (
                      <span className="text-destructive font-medium">🐛 {alerts.filter(a => a.type === "errors").length}</span>
                    )}
                    {alerts.filter(a => a.type === "inactive").length > 0 && (
                      <span className="text-warning font-medium">👤 {alerts.filter(a => a.type === "inactive").length}</span>
                    )}
                    {alerts.filter(a => a.type === "expiring").length > 0 && (
                      <span className="text-warning font-medium">💳 {alerts.filter(a => a.type === "expiring").length}</span>
                    )}
                    {alerts.filter(a => a.type === "stuck_cash").length > 0 && (
                      <span className="text-destructive font-medium">🖥️ {alerts.filter(a => a.type === "stuck_cash").length}</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
