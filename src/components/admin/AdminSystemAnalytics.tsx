import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Users, DollarSign, CalendarClock, TrendingUp } from "lucide-react";
import { adminQuery, adminCount } from "@/lib/admin-query";
import { formatCurrency } from "@/lib/utils";

export function AdminSystemAnalytics() {
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [revenueToday, setRevenueToday] = useState(0);
  const [revenueMonth, setRevenueMonth] = useState(0);
  const [expiringCompanies, setExpiringCompanies] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const monthStart = today.slice(0, 7) + "-01";
        const threeDaysFromNow = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

        // Online users: companies active in last 30 min (approximation via action_logs)
        const thirtyMinAgo = new Date(Date.now() - 30 * 60000).toISOString();
        const recentLogs = await adminQuery<{ user_id: string }>({
          table: "action_logs",
          select: "user_id",
          filters: [{ op: "gte", column: "created_at", value: thirtyMinAgo }],
          limit: 300,
        });
        const uniqueUsers = new Set(recentLogs.map((l) => l.user_id).filter(Boolean));
        setOnlineUsers(uniqueUsers.size);

        // Revenue today & month from plan_subscriptions
        const plans = await adminQuery<{ price: number; created_at: string }>({
          table: "plan_subscriptions",
          select: "price,created_at",
          filters: [{ op: "gte", column: "created_at", value: monthStart }],
          limit: 1000,
        });

        let todaySum = 0;
        let monthSum = 0;
        for (const p of plans) {
          const val = Number(p.price) || 0;
          monthSum += val;
          if (p.created_at?.startsWith(today)) todaySum += val;
        }
        setRevenueToday(todaySum);
        setRevenueMonth(monthSum);

        // Expiring companies (subscriptions ending in 3 days)
        const expiring = await adminQuery<{ id: string }>({
          table: "subscriptions",
          select: "id",
          filters: [
            { op: "lte", column: "current_period_end", value: threeDaysFromNow },
            { op: "gte", column: "current_period_end", value: today },
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
    { label: "Receita Hoje", value: formatCurrency(revenueToday), icon: DollarSign, color: "text-success", bg: "bg-success/10" },
    { label: "Receita do Mês", value: formatCurrency(revenueMonth), icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
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
