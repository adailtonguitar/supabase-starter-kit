import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Building2, Users, CreditCard, ShoppingCart, TrendingUp, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { AdminSystemAnalytics } from "./AdminSystemAnalytics";
import { AdminQuickActions } from "./AdminQuickActions";
import { AdminSystemStatus } from "./AdminSystemStatus";
import { AdminRecentActivity } from "./AdminRecentActivity";
import { AdminCompanyGrowthChart } from "./AdminCompanyGrowthChart";

interface DashboardMetrics {
  totalCompanies: number;
  activeCompanies: number;
  blockedCompanies: number;
  totalUsers: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  expiredSubscriptions: number;
  recentCompanies: { id: string; name: string; created_at: string }[];
}

export function AdminDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("admin-metrics");
        if (error) throw error;
        setMetrics(data as DashboardMetrics);
      } catch (err) {
        console.error("[AdminDashboard] Failed to load metrics:", err);
        // Fallback: set empty metrics so UI doesn't stay in loading state
        setMetrics({
          totalCompanies: 0,
          activeCompanies: 0,
          blockedCompanies: 0,
          totalUsers: 0,
          activeSubscriptions: 0,
          trialSubscriptions: 0,
          expiredSubscriptions: 0,
          recentCompanies: [],
        });
      }
      setLoading(false);
    };
    load();
  }, []);

  const cards = [
    { label: "Total Empresas", value: metrics?.totalCompanies, icon: Building2, color: "text-primary", bg: "bg-primary/10" },
    { label: "Empresas Ativas", value: metrics?.activeCompanies, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
    { label: "Bloqueadas", value: metrics?.blockedCompanies, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "Total Usuários", value: metrics?.totalUsers, icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "Assinaturas Ativas", value: metrics?.activeSubscriptions, icon: CreditCard, color: "text-success", bg: "bg-success/10" },
    { label: "Em Trial", value: metrics?.trialSubscriptions, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
    { label: "Expiradas/Canceladas", value: metrics?.expiredSubscriptions, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div className="min-w-0">
                  {loading ? (
                    <Skeleton className="h-7 w-10" />
                  ) : (
                    <span className="text-xl font-bold font-mono text-foreground">{card.value ?? 0}</span>
                  )}
                  <p className="text-[11px] text-muted-foreground leading-tight truncate">{card.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Empresas Recentes
          </h3>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {metrics?.recentCompanies.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              ))}
              {metrics?.recentCompanies.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma empresa cadastrada.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
