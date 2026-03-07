import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users, CreditCard, AlertTriangle } from "lucide-react";
import { adminQuery } from "@/lib/admin-query";

interface ActivityItem {
  id: string;
  type: "company" | "user" | "subscription" | "error";
  message: string;
  date: string;
}

const ICONS = {
  company: Building2,
  user: Users,
  subscription: CreditCard,
  error: AlertTriangle,
};

const COLORS = {
  company: "text-primary",
  user: "text-success",
  subscription: "text-warning",
  error: "text-destructive",
};

export function AdminRecentActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const activities: ActivityItem[] = [];

        // Recent companies
        const companies = await adminQuery<{ id: string; name: string; created_at: string }>({
          table: "companies",
          select: "id,name,created_at",
          order: { column: "created_at", ascending: false },
          limit: 5,
        });
        companies.forEach((c) =>
          activities.push({ id: `c-${c.id}`, type: "company", message: `Empresa criada: ${c.name}`, date: c.created_at })
        );

        // Recent users
        const users = await adminQuery<{ id: string; user_id: string; created_at: string }>({
          table: "company_users",
          select: "id,user_id,created_at",
          order: { column: "created_at", ascending: false },
          limit: 5,
        });
        users.forEach((u) =>
          activities.push({ id: `u-${u.id}`, type: "user", message: `Novo usuário registrado`, date: u.created_at })
        );

        // Recent errors
        const errors = await adminQuery<{ id: string; error_message: string; created_at: string }>({
          table: "system_errors",
          select: "id,error_message,created_at",
          order: { column: "created_at", ascending: false },
          limit: 3,
        });
        errors.forEach((e) =>
          activities.push({ id: `e-${e.id}`, type: "error", message: `Erro: ${e.error_message?.slice(0, 60)}`, date: e.created_at })
        );

        // Sort by date desc, take 10
        activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setItems(activities.slice(0, 10));
      } catch (err) {
        console.error("[AdminRecentActivity]", err);
      }
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        📋 Atividade Recente
      </h3>
      <Card>
        <CardContent className="p-4">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma atividade recente.</p>
          ) : (
            <div className="space-y-1.5">
              {items.map((item) => {
                const Icon = ICONS[item.type];
                return (
                  <div key={item.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <Icon className={`w-4 h-4 shrink-0 ${COLORS[item.type]}`} />
                    <span className="text-sm text-foreground truncate flex-1">{item.message}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {new Date(item.date).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
