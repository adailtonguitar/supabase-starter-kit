import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Users, CreditCard, CalendarClock, TrendingUp, Building2 } from "lucide-react";
import { adminQuery } from "@/lib/admin-query";

export function AdminSystemAnalytics() {
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [newCompaniesMonth, setNewCompaniesMonth] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);

  useEffect(() => {
    const load = async () => {
      // Online users (action_logs last 30 min)
      const recentLogs = await adminQuery<{ user_id: string }>({
        table: "action_logs",
        select: "user_id",
        filters: [{ op: "gte", column: "created_at", value: new Date(Date.now() - 30 * 60000).toISOString() }],
        limit: 300,
      });
      setOnlineUsers(new Set(recentLogs.map((l) => l.user_id).filter(Boolean)).size);

      // Total users
      const users = await adminQuery<{ id: string }>({
        table: "company_users",
        select: "id",
        limit: 5000,
      });
      setTotalUsers(users.length);

      // New companies this month
      const monthStart = new Date().toISOString().slice(0, 7) + "-01";
      const newCompanies = await adminQuery<{ id: string }>({
        table: "companies",
        select: "id",
        filters: [{ op: "gte", column: "created_at", value: monthStart }],
        limit: 1000,
      });
      setNewCompaniesMonth(newCompanies.length);

      // Errors last 24h
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const errors = await adminQuery<{ id: string }>({
        table: "system_errors",
        select: "id",
        filters: [{ op: "gte", column: "created_at", value: dayAgo }],
        limit: 1000,
      });
      setTotalErrors(errors.length);

      setLoading(false);
    };
    load();
  }, []);

  const cards = [
    { label: "Usuários Online Agora", value: onlineUsers, icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "Total de Usuários", value: totalUsers, icon: Users, color: "text-success", bg: "bg-success/10" },
    { label: "Novas Empresas (Mês)", value: newCompaniesMonth, icon: Building2, color: "text-primary", bg: "bg-primary/10" },
    { label: "Erros (24h)", value: totalErrors, icon: CalendarClock, color: "text-warning", bg: "bg-warning/10" },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" /> Analytics do Sistema
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((card, i) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div className="min-w-0">
                  {loading ? (
                    <Skeleton className="h-7 w-16" />
                  ) : (
                    <span className="text-lg font-bold font-mono text-foreground">{card.value}</span>
                  )}
                  <p className="text-[11px] text-muted-foreground leading-tight truncate">{card.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
