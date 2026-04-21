import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, ShieldAlert, UserPlus, UserMinus, UserCog, Clock } from "lucide-react";
import { format } from "date-fns";

interface RoleAuditEntry {
  id: number;
  event_type: "INSERT" | "UPDATE" | "DELETE";
  actor_id: string | null;
  actor_email: string | null;
  target_user_id: string;
  target_email: string | null;
  old_role: string | null;
  new_role: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

function eventIcon(event: RoleAuditEntry) {
  if (event.event_type === "INSERT") return <UserPlus className="h-4 w-4 text-emerald-500" />;
  if (event.event_type === "DELETE") return <UserMinus className="h-4 w-4 text-destructive" />;
  return <UserCog className="h-4 w-4 text-amber-500" />;
}

function eventLabel(event: RoleAuditEntry) {
  if (event.event_type === "INSERT") {
    return `Criado com role ${event.new_role ?? "?"}`;
  }
  if (event.event_type === "DELETE") {
    return `Removido (era ${event.old_role ?? "?"})`;
  }
  return `${event.old_role ?? "?"} → ${event.new_role ?? "?"}`;
}

function severity(event: RoleAuditEntry): "critical" | "warning" | "info" {
  if (event.new_role === "super_admin" || event.old_role === "super_admin") {
    return "critical";
  }
  return "info";
}

export function AdminRoleAudit() {
  const { isSuperAdmin } = useAdminRole();
  const [entries, setEntries] = useState<RoleAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAudit = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_admin_role_audit", {
        p_limit: 100,
        p_offset: 0,
      });
      if (error) throw error;
      setEntries((data || []) as RoleAuditEntry[]);
    } catch (err) {
      console.error("[AdminRoleAudit] fetch:", err);
      setEntries([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isSuperAdmin) void fetchAudit();
  }, [isSuperAdmin]);

  const stats = useMemo(() => {
    const criticos = entries.filter(
      (e) => e.new_role === "super_admin" || e.old_role === "super_admin",
    ).length;
    const orphans = entries.filter((e) => e.actor_id == null).length;
    return { total: entries.length, criticos, orphans };
  }, [entries]);

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Acesso restrito.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Auditoria de admin_roles
            </CardTitle>
            <CardDescription>
              Histórico completo de concessões/revogações de permissões administrativas.
              Alertas externos (Discord/Slack/Telegram) são disparados em tempo real para
              eventos envolvendo <code>super_admin</code>.
            </CardDescription>
          </div>
          <Button variant="outline" size="icon" onClick={fetchAudit} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-semibold">{stats.total}</p>
            </div>
            <div className="rounded-lg border bg-destructive/5 border-destructive/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">Envolvendo super_admin</p>
              <p className="text-xl font-semibold text-destructive">{stats.criticos}</p>
            </div>
            <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 px-3 py-2">
              <p className="text-xs text-muted-foreground">Sem actor (SQL direto)</p>
              <p className="text-xl font-semibold text-amber-700 dark:text-amber-400">
                {stats.orphans}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ShieldAlert className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Nenhuma mudança registrada ainda.</p>
              <p className="text-xs mt-1">
                Qualquer INSERT/UPDATE/DELETE em <code>admin_roles</code> aparecerá aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => {
                const sev = severity(e);
                return (
                  <div
                    key={e.id}
                    className={`rounded-lg border p-3 ${
                      sev === "critical"
                        ? "bg-destructive/5 border-destructive/30"
                        : "bg-card border-border"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">{eventIcon(e)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {e.target_email || e.target_user_id.slice(0, 8) + "…"}
                          </span>
                          <Badge
                            variant={sev === "critical" ? "destructive" : "secondary"}
                            className="text-[10px]"
                          >
                            {eventLabel(e)}
                          </Badge>
                          {e.actor_id == null && (
                            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">
                              ⚠ SQL direto
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 items-center mt-1 text-xs text-muted-foreground">
                          <span>
                            por <strong className="text-foreground">
                              {e.actor_email || e.actor_id?.slice(0, 8) || "sistema"}
                            </strong>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(e.created_at), "dd/MM/yyyy HH:mm:ss")}
                          </span>
                          {e.ip && <span>IP: {e.ip}</span>}
                        </div>
                      </div>
                    </div>
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
