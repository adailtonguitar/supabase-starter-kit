import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Users, CreditCard, CalendarClock, TrendingUp, Building2 } from "lucide-react";
import { adminQuery } from "@/lib/admin-query";

export function AdminSystemAnalytics() {
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [activeSubscriptions, setActiveSubscriptions] = useState(0);
  const [newCompaniesMonth, setNewCompaniesMonth] = useState(0);
  const [expiringCompanies, setExpiringCompanies] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const monthStart = today.slice(0, 7) + "-01";
        const threeDaysFromNow = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

        // Online users: unique users in action_logs last 30 min
        const thirtyMinAgo = new Date(Date.now() - 30 * 60000).toISOString();
        const recentLogs = await adminQuery<{ user_id: string }>({
          table: "action_logs",
          select: "user_id",
          filters: [{ op: "gte", column: "created_at", value: thirtyMinAgo }],
          limit: 300,
        });
        const uniqueUsers = new Set(recentLogs.map((l) => l.user_id).filter(Boolean));
        setOnlineUsers(uniqueUsers.size);

        // Active subscriptions count
        const activeSubs = await adminQuery<{ id: string }>({
          table: "subscriptions",
          select: "id",
          filters: [{ op: "eq", column: "status", value: "active" }],
          limit: 1000,
        });
        setActiveSubscriptions(activeSubs.length);

        // New companies this month
        const newCompanies = await adminQuery<{ id: string }>({
          table: "companies",
          select: "id",
          filters: [{ op: "gte", column: "created_at", value: monthStart }],
          limit: 1000,
        });
        setNewCompaniesMonth(newCompanies.length);

        // Expiring subscriptions (ending in 3 days)
        const expiring = await adminQuery<{ id: string }>({
          table: "subscriptions",
          select: "id",
          filters: [
            { op: "lte", column: "subscription_end", value: threeDaysFromNow },
            { op: "gte", column: "subscription_end", value: today },
            { op: "eq", column: "status", value: "active" },
          ],
          limit: 300,
        });
        setExpiringCompanies(expiring.length);
      } catch (err) {
        console.error("[AdminSystemAnalytics]", err);
      }
      setLoading(false);
    };
    load();
  }, []);

  const cards = [
    { label: "Usuários Online Agora", value: onlineUsers, icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "Assinaturas Ativas", value: activeSubscriptions, icon: CreditCard, color: "text-success", bg: "bg-success/10" },
    { label: "Novas Empresas (Mês)", value: newCompaniesMonth, icon: Building2, color: "text-primary", bg: "bg-primary/10" },
    { label: "Vencimento em 3 Dias", value: expiringCompanies, icon: CalendarClock, color: "text-warning", bg: "bg-warning/10" },
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
