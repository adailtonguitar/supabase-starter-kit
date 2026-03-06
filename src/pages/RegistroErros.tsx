import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { AlertTriangle, Search, Monitor, User, Calendar, RefreshCw, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

interface SystemError {
  id: string;
  user_email: string | null;
  page: string;
  action: string;
  error_message: string;
  error_stack: string;
  browser: string;
  device: string;
  created_at: string;
}

export default function RegistroErros() {
  const { isSuperAdmin } = useAdminRole();
  const [errors, setErrors] = useState<SystemError[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("7d");
  const [pageFilter, setPageFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchErrors = async () => {
    setLoading(true);
    try {
      const daysMap: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "all": 365 };
      const days = daysMap[dateFilter] || 7;
      const from = startOfDay(subDays(new Date(), days)).toISOString();

      let query = (supabase as any)
        .from("system_errors")
        .select("*")
        .gte("created_at", from)
        .order("created_at", { ascending: false })
        .limit(500);

      if (pageFilter !== "all") {
        query = query.eq("page", pageFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setErrors(data || []);
    } catch (err) {
      console.error("[RegistroErros] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) fetchErrors();
  }, [isSuperAdmin, dateFilter, pageFilter]);

  const errorsLast24h = useMemo(() => {
    const cutoff = subDays(new Date(), 1).getTime();
    return errors.filter(e => new Date(e.created_at).getTime() > cutoff).length;
  }, [errors]);

  const uniquePages = useMemo(() => {
    const pages = new Set(errors.map(e => e.page).filter(Boolean));
    return Array.from(pages).sort();
  }, [errors]);

  const filtered = useMemo(() => {
    if (!search) return errors;
    const s = search.toLowerCase();
    return errors.filter(e =>
      e.error_message?.toLowerCase().includes(s) ||
      e.user_email?.toLowerCase().includes(s) ||
      e.page?.toLowerCase().includes(s) ||
      e.action?.toLowerCase().includes(s)
    );
  }, [errors, search]);

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <Bug className="w-7 h-7 text-destructive" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Registro de Erros</h1>
            <p className="text-sm text-muted-foreground">Monitoramento automático de erros do sistema</p>
          </div>
        </div>
      </motion.div>

      {/* Indicator: last 24h */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${errorsLast24h > 0 ? "bg-destructive/10 border-destructive/30" : "bg-muted/50 border-border"}`}>
            <AlertTriangle className={`w-5 h-5 ${errorsLast24h > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            <div>
              <p className="text-2xl font-bold text-foreground">{errorsLast24h}</p>
              <p className="text-xs text-muted-foreground">erros nas últimas 24h</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted/50 border border-border">
            <Monitor className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold text-foreground">{filtered.length}</p>
              <p className="text-xs text-muted-foreground">total no período</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por mensagem, usuário, tela..."
            className="pl-10"
          />
        </div>

        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[140px]">
            <Calendar className="w-4 h-4 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Últimas 24h</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={pageFilter} onValueChange={setPageFilter}>
          <SelectTrigger className="w-[180px]">
            <Monitor className="w-4 h-4 mr-1" />
            <SelectValue placeholder="Todas as telas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as telas</SelectItem>
            {uniquePages.map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon" onClick={fetchErrors} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Error list */}
      <div className="space-y-2">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Bug className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground">Nenhum erro registrado no período.</p>
          </div>
        ) : (
          filtered.map((err) => (
            <motion.div
              key={err.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-destructive/30 transition-colors"
              onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
            >
              <div className="px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{err.error_message}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">{err.page || "/"}</Badge>
                    {err.user_email && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <User className="w-3 h-3" /> {err.user_email}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(err.created_at), "dd/MM/yyyy HH:mm:ss")}
                    </span>
                  </div>
                </div>
              </div>

              {expandedId === err.id && (
                <div className="px-4 pb-4 pt-1 border-t border-border space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Ação:</span>
                      <span className="ml-1 text-foreground">{err.action || "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Navegador:</span>
                      <span className="ml-1 text-foreground">{err.browser || "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Dispositivo:</span>
                      <span className="ml-1 text-foreground">{err.device || "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Página:</span>
                      <span className="ml-1 text-foreground">{err.page || "/"}</span>
                    </div>
                  </div>
                  {err.error_stack && (
                    <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                      {err.error_stack}
                    </pre>
                  )}
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
