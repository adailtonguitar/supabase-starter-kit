import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { trackError } from "@/services/ErrorTracker";
import { format, subDays, startOfDay } from "date-fns";
import { AlertTriangle, Search, Monitor, User, Calendar, RefreshCw, Bug, FlaskConical, Trash2, Layers, List, Users, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface Breadcrumb {
  ts: number;
  category: string;
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
}

interface ErrorMetadata {
  breadcrumbs?: Breadcrumb[];
  web_vitals?: {
    LCP?: number; FCP?: number; CLS?: number; INP?: number; TTFB?: number;
  };
  viewport?: { w: number; h: number; dpr: number };
  connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } | null;
  url?: string;
  captured_at?: string;
}

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
  metadata?: ErrorMetadata | null;
  fingerprint?: string | null;
  support_code?: string | null;
}

interface ErrorBucket {
  fingerprint: string;
  count: number;
  affected_users: number;
  first_seen: string;
  last_seen: string;
  sample_message: string;
  sample_stack: string | null;
  latest_support_code: string | null;
  pages: string[] | null;
  browsers: string[] | null;
}

interface GroupedResult {
  from_ts: string;
  to_ts: string;
  total_buckets: number;
  total_events: number;
  buckets: ErrorBucket[];
}

type ViewMode = "grouped" | "individual";

export default function RegistroErros() {
  const { isSuperAdmin } = useAdminRole();
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");
  const [errors, setErrors] = useState<SystemError[]>([]);
  const [buckets, setBuckets] = useState<ErrorBucket[]>([]);
  const [totalGroupedEvents, setTotalGroupedEvents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("7d");
  const [pageFilter, setPageFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedFingerprint, setExpandedFingerprint] = useState<string | null>(null);
  const [bucketEvents, setBucketEvents] = useState<Record<string, SystemError[]>>({});
  const [loadingBucket, setLoadingBucket] = useState<string | null>(null);

  const daysMap: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "all": 365 };

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    try {
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
      setErrors((data || []) as SystemError[]);
    } catch (err) {
      console.error("[RegistroErros] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, pageFilter]);

  const fetchGrouped = useCallback(async () => {
    setLoading(true);
    try {
      const days = daysMap[dateFilter] || 7;
      const fromTs = startOfDay(subDays(new Date(), days)).toISOString();

      const { data, error } = await supabase.rpc("get_grouped_errors", {
        p_from_ts: fromTs,
        p_to_ts: new Date().toISOString(),
        p_limit: 100,
      });

      if (error) throw error;
      const result = data as unknown as GroupedResult | null;
      setBuckets(result?.buckets || []);
      setTotalGroupedEvents(result?.total_events || 0);
    } catch (err) {
      console.error("[RegistroErros] fetchGrouped error:", err);
      setBuckets([]);
      setTotalGroupedEvents(0);
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (viewMode === "grouped") void fetchGrouped();
    else void fetchErrors();
  }, [isSuperAdmin, viewMode, fetchErrors, fetchGrouped]);

  const loadBucketEvents = async (fingerprint: string) => {
    if (bucketEvents[fingerprint]) return; // já carregado
    setLoadingBucket(fingerprint);
    try {
      const days = daysMap[dateFilter] || 7;
      const fromTs = startOfDay(subDays(new Date(), days)).toISOString();
      const { data, error } = await supabase.rpc("get_errors_by_fingerprint", {
        p_fingerprint: fingerprint,
        p_from_ts: fromTs,
        p_limit: 50,
      });
      if (error) throw error;
      setBucketEvents((prev) => ({ ...prev, [fingerprint]: (data || []) as SystemError[] }));
    } catch (err) {
      console.error("[RegistroErros] loadBucketEvents error:", err);
    }
    setLoadingBucket(null);
  };

  const toggleBucket = (fingerprint: string) => {
    if (expandedFingerprint === fingerprint) {
      setExpandedFingerprint(null);
    } else {
      setExpandedFingerprint(fingerprint);
      void loadBucketEvents(fingerprint);
    }
  };

  const handleRefresh = () => {
    if (viewMode === "grouped") void fetchGrouped();
    else void fetchErrors();
  };

  const errorsLast24h = useMemo(() => {
    const cutoff = subDays(new Date(), 1).getTime();
    if (viewMode === "grouped") {
      return buckets
        .filter((b) => new Date(b.last_seen).getTime() > cutoff)
        .reduce((sum, b) => sum + b.count, 0);
    }
    return errors.filter(e => new Date(e.created_at).getTime() > cutoff).length;
  }, [errors, buckets, viewMode]);

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

  const filteredBuckets = useMemo(() => {
    if (!search) return buckets;
    const s = search.toLowerCase();
    return buckets.filter((b) =>
      b.sample_message?.toLowerCase().includes(s) ||
      b.fingerprint?.toLowerCase().includes(s) ||
      (b.pages || []).some((p) => p?.toLowerCase().includes(s))
    );
  }, [buckets, search]);

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
              <p className="text-2xl font-bold text-foreground">
                {viewMode === "grouped" ? totalGroupedEvents : filtered.length}
              </p>
              <p className="text-xs text-muted-foreground">
                {viewMode === "grouped"
                  ? `eventos em ${filteredBuckets.length} grupo(s)`
                  : "total no período"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border">
            <Button
              size="sm"
              variant={viewMode === "grouped" ? "default" : "ghost"}
              className="gap-1.5 text-xs h-8"
              onClick={() => setViewMode("grouped")}
            >
              <Layers className="w-3.5 h-3.5" /> Agrupado
            </Button>
            <Button
              size="sm"
              variant={viewMode === "individual" ? "default" : "ghost"}
              className="gap-1.5 text-xs h-8"
              onClick={() => setViewMode("individual")}
            >
              <List className="w-3.5 h-3.5" /> Individual
            </Button>
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

        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={async () => {
            await trackError({ page: "/admin", action: "botao_teste", error: new Error("Erro de teste gerado pelo admin") });
            handleRefresh();
          }}
        >
          <FlaskConical className="w-4 h-4" />
          Gerar erro teste
        </Button>

        <Button
          variant="destructive"
          size="sm"
          disabled={loading || errors.length === 0}
          onClick={async () => {
            if (!confirm("Apagar todos os registros de erros?")) return;
            try {
              const { error } = await (supabase as any)
                .from("system_errors")
                .delete()
                .neq("id", "00000000-0000-0000-0000-000000000000");
              if (error) {
                console.error("[RegistroErros] Delete error:", error);
                toast.error(`Falha ao limpar: ${error.message}`);
                return;
              }
              setErrors([]);
              setBuckets([]);
              setTotalGroupedEvents(0);
              setBucketEvents({});
              setExpandedFingerprint(null);
              toast.success("Registros apagados");
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "erro desconhecido";
              console.error("[RegistroErros] Delete error:", err);
              toast.error(`Falha ao limpar: ${msg}`);
            }
          }}
          className="gap-1.5 text-xs"
        >
          <Trash2 className="w-4 h-4" />
          Limpar registros
        </Button>
      </div>

      {/* Error list */}
      <div className="space-y-2">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))
        ) : viewMode === "grouped" ? (
          filteredBuckets.length === 0 ? (
            <div className="text-center py-16">
              <Bug className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">Nenhum erro agrupado no período.</p>
            </div>
          ) : (
            filteredBuckets.map((bucket) => {
              const isOpen = expandedFingerprint === bucket.fingerprint;
              const events = bucketEvents[bucket.fingerprint] || [];
              const isLoadingEvents = loadingBucket === bucket.fingerprint;
              return (
                <motion.div
                  key={bucket.fingerprint}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-card border border-border rounded-xl overflow-hidden hover:border-destructive/30 transition-colors"
                >
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-start gap-3 text-left"
                    onClick={() => toggleBucket(bucket.fingerprint)}
                  >
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <Badge
                      variant="destructive"
                      className="h-6 min-w-[42px] justify-center font-mono text-[11px] shrink-0"
                    >
                      {bucket.count}×
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {bucket.sample_message}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {bucket.fingerprint}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Users className="w-3 h-3" /> {bucket.affected_users} usuário(s)
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          1º: {format(new Date(bucket.first_seen), "dd/MM HH:mm")}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          último: {format(new Date(bucket.last_seen), "dd/MM HH:mm")}
                        </span>
                        {(bucket.pages || []).slice(0, 3).map((p) => (
                          <Badge key={p} variant="outline" className="text-[10px]">
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border">
                      {bucket.sample_stack && (
                        <pre className="text-[10px] text-muted-foreground bg-muted/30 px-4 py-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
                          {bucket.sample_stack}
                        </pre>
                      )}
                      <div className="px-4 py-3 space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                          Ocorrências ({events.length}
                          {bucket.count > events.length ? ` de ${bucket.count}` : ""})
                        </p>
                        {isLoadingEvents ? (
                          <Skeleton className="h-10 w-full rounded-lg" />
                        ) : events.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sem eventos no intervalo.</p>
                        ) : (
                          <div className="space-y-1 max-h-80 overflow-y-auto">
                            {events.map((ev) => (
                              <div
                                key={ev.id}
                                className="text-[11px] flex items-center gap-2 bg-muted/30 rounded-lg px-2 py-1.5 font-mono"
                              >
                                <span className="text-muted-foreground shrink-0">
                                  {format(new Date(ev.created_at), "dd/MM HH:mm:ss")}
                                </span>
                                <Badge variant="outline" className="text-[9px] h-4 px-1">
                                  {ev.page || "/"}
                                </Badge>
                                {ev.user_email && (
                                  <span className="text-muted-foreground truncate">
                                    {ev.user_email}
                                  </span>
                                )}
                                {ev.support_code && (
                                  <span className="ml-auto text-[9px] text-muted-foreground">
                                    {ev.support_code}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })
          )
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

                  {err.metadata?.web_vitals && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {Object.entries(err.metadata.web_vitals).map(([k, v]) => {
                        if (v == null) return null;
                        const badVital =
                          (k === "LCP" && v > 4000) ||
                          (k === "INP" && v > 500) ||
                          (k === "CLS" && v > 0.25);
                        return (
                          <Badge
                            key={k}
                            variant={badVital ? "destructive" : "secondary"}
                            className="text-[10px] font-mono"
                          >
                            {k}: {k === "CLS" ? v.toFixed(3) : `${Math.round(v)}ms`}
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {err.metadata?.breadcrumbs && err.metadata.breadcrumbs.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                        Últimas ações ({err.metadata.breadcrumbs.length})
                      </p>
                      <div className="space-y-0.5 bg-muted/50 rounded-lg p-2 max-h-40 overflow-y-auto">
                        {err.metadata.breadcrumbs.slice(-15).map((b, idx) => (
                          <div key={idx} className="text-[10px] font-mono flex items-start gap-2">
                            <span className="text-muted-foreground shrink-0 w-14">
                              {format(new Date(b.ts), "HH:mm:ss")}
                            </span>
                            <span className="text-muted-foreground shrink-0 w-16 uppercase">
                              {b.category}
                            </span>
                            <span className={
                              b.level === "error" ? "text-destructive" :
                              b.level === "warn"  ? "text-warning" : "text-foreground"
                            }>
                              {b.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
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
