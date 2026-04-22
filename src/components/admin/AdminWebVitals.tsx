import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gauge, RefreshCw, TrendingUp, AlertTriangle, ArrowLeft, Smartphone, Wifi } from "lucide-react";
import { subDays } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

interface Overall {
  total_samples: number;
  lcp_p50: number | null;
  lcp_p75: number | null;
  lcp_p95: number | null;
  fcp_p75: number | null;
  cls_p75: number | null;
  inp_p75: number | null;
  ttfb_p75: number | null;
}

interface PageStat {
  page: string;
  samples: number;
  lcp_p75: number | null;
  fcp_p75: number | null;
  cls_p75: number | null;
  inp_p75: number | null;
  ttfb_p75: number | null;
}

interface DayStat {
  day: string;
  samples: number;
  lcp_p75: number | null;
  cls_p75: number | null;
  inp_p75: number | null;
}

interface Summary {
  overall: Overall;
  by_page: PageStat[];
  timeline: DayStat[];
}

interface ConnStat {
  connection: string;
  samples: number;
  lcp_p75: number | null;
  inp_p75: number | null;
}

interface DeviceStat {
  device: string;
  samples: number;
  lcp_p75: number | null;
  inp_p75: number | null;
  cls_p75: number | null;
}

interface PageDetail {
  page: string;
  overall: Overall;
  timeline: DayStat[];
  by_connection: ConnStat[];
  by_device: DeviceStat[];
}

// Thresholds "good/needs improvement/poor" (Core Web Vitals)
function classify(metric: string, v: number | null | undefined): "good" | "ni" | "poor" | null {
  if (v == null) return null;
  switch (metric) {
    case "LCP":  return v <= 2500 ? "good" : v <= 4000 ? "ni" : "poor";
    case "FCP":  return v <= 1800 ? "good" : v <= 3000 ? "ni" : "poor";
    case "INP":  return v <= 200  ? "good" : v <= 500  ? "ni" : "poor";
    case "CLS":  return v <= 0.1  ? "good" : v <= 0.25 ? "ni" : "poor";
    case "TTFB": return v <= 800  ? "good" : v <= 1800 ? "ni" : "poor";
    default:     return null;
  }
}

function classColor(c: "good" | "ni" | "poor" | null): string {
  if (c === "good") return "text-emerald-600 dark:text-emerald-400";
  if (c === "ni")   return "text-amber-600 dark:text-amber-400";
  if (c === "poor") return "text-destructive";
  return "text-muted-foreground";
}

function format(metric: string, v: number | null | undefined): string {
  if (v == null) return "—";
  if (metric === "CLS") return v.toFixed(3);
  return `${Math.round(v)} ms`;
}

function VitalCard({ metric, value, label }: { metric: string; value: number | null; label: string }) {
  const c = classify(metric, value);
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
        {c && (
          <Badge
            variant={c === "poor" ? "destructive" : c === "ni" ? "secondary" : "outline"}
            className="text-[10px]"
          >
            {c === "good" ? "bom" : c === "ni" ? "precisa melhorar" : "ruim"}
          </Badge>
        )}
      </div>
      <div className={`text-2xl font-bold font-mono ${classColor(c)}`}>
        {format(metric, value)}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">p75 • {metric}</div>
    </div>
  );
}

export function AdminWebVitals() {
  const { isSuperAdmin } = useAdminRole();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"1d" | "7d" | "30d">("7d");

  // Drill-down por rota
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [detail, setDetail] = useState<PageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const getRangeTs = useCallback(() => {
    const daysMap = { "1d": 1, "7d": 7, "30d": 30 } as const;
    const from = subDays(new Date(), daysMap[range]).toISOString();
    const to = new Date().toISOString();
    return { from, to };
  }, [range]);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getRangeTs();
      const { data, error } = await supabase.rpc("get_web_vitals_summary", {
        p_from_ts: from,
        p_to_ts: to,
      });
      if (error) throw error;
      setSummary(data as unknown as Summary);
    } catch (err) {
      console.error("[AdminWebVitals] fetch:", err);
      setSummary(null);
    }
    setLoading(false);
  }, [getRangeTs]);

  const fetchDetail = useCallback(async (page: string) => {
    setDetailLoading(true);
    try {
      const { from, to } = getRangeTs();
      const { data, error } = await supabase.rpc("get_web_vitals_page_detail", {
        p_page: page,
        p_from_ts: from,
        p_to_ts: to,
      });
      if (error) throw error;
      setDetail(data as unknown as PageDetail);
    } catch (err) {
      console.error("[AdminWebVitals] fetch detail:", err);
      setDetail(null);
    }
    setDetailLoading(false);
  }, [getRangeTs]);

  useEffect(() => {
    if (isSuperAdmin) void fetchSummary();
  }, [isSuperAdmin, fetchSummary]);

  useEffect(() => {
    if (isSuperAdmin && selectedPage) void fetchDetail(selectedPage);
  }, [isSuperAdmin, selectedPage, fetchDetail]);

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Acesso restrito.</p>
      </div>
    );
  }

  const overall = summary?.overall;
  const pages = summary?.by_page || [];
  const timeline = (summary?.timeline || []).map((d) => ({
    ...d,
    dayLabel: new Date(d.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Web Vitals
            </CardTitle>
            <CardDescription>
              Performance real do cliente (não sintética). Amostras são coletadas no
              <code className="mx-1">visibilitychange</code> de cada sessão ativa.
              {overall && (
                <span className="block mt-1 font-mono text-xs">
                  {overall.total_samples.toLocaleString("pt-BR")} amostras no período
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={(v: "1d" | "7d" | "30d") => setRange(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">Últimas 24h</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchSummary} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : !overall || !overall.total_samples ? (
            <div className="text-center py-10 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Ainda não temos amostras no período.</p>
              <p className="text-xs mt-1">
                Os dados começam a aparecer conforme usuários navegam (coleta no fim de cada sessão).
              </p>
            </div>
          ) : (
            <>
              {/* Vital cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <VitalCard metric="LCP"  value={overall.lcp_p75}  label="Largest CP" />
                <VitalCard metric="FCP"  value={overall.fcp_p75}  label="First CP" />
                <VitalCard metric="INP"  value={overall.inp_p75}  label="Interaction" />
                <VitalCard metric="CLS"  value={overall.cls_p75}  label="Layout Shift" />
                <VitalCard metric="TTFB" value={overall.ttfb_p75} label="Time to FB" />
              </div>

              {/* LCP percentis (contexto) */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase">LCP p50</p>
                  <p className="font-mono text-foreground">{format("LCP", overall.lcp_p50)}</p>
                </div>
                <div className="rounded-lg border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase">LCP p75</p>
                  <p className="font-mono text-foreground">{format("LCP", overall.lcp_p75)}</p>
                </div>
                <div className="rounded-lg border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase">LCP p95</p>
                  <p className={`font-mono ${classColor(classify("LCP", overall.lcp_p95))}`}>
                    {format("LCP", overall.lcp_p95)}
                  </p>
                </div>
              </div>

              {/* Timeline */}
              {timeline.length > 1 && (
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Tendência — LCP / INP p75 por dia</p>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={timeline}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => `${Math.round(v)} ms`} />
                      <Legend />
                      <Line type="monotone" dataKey="lcp_p75" name="LCP" stroke="hsl(var(--primary))" dot={false} />
                      <Line type="monotone" dataKey="inp_p75" name="INP" stroke="hsl(var(--destructive))" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Por página (com drill-down) */}
              {pages.length > 0 && (
                <div className="rounded-lg border">
                  <div className="px-3 py-2 border-b flex items-center justify-between">
                    <p className="text-sm font-medium">Páginas mais lentas (por LCP p75)</p>
                    <span className="text-xs text-muted-foreground">
                      top 20 · clique para ver detalhe
                    </span>
                  </div>
                  <div className="divide-y">
                    {pages.map((p) => (
                      <button
                        key={p.page}
                        type="button"
                        onClick={() => setSelectedPage(p.page)}
                        className="w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                      >
                        <code className="text-xs flex-1 min-w-0 truncate">{p.page}</code>
                        <span className="text-[10px] text-muted-foreground w-16 text-right">
                          {p.samples} amostras
                        </span>
                        <span className={`text-xs font-mono w-20 text-right ${classColor(classify("LCP", p.lcp_p75))}`}>
                          LCP {format("LCP", p.lcp_p75)}
                        </span>
                        <span className={`text-xs font-mono w-20 text-right ${classColor(classify("INP", p.inp_p75))}`}>
                          INP {format("INP", p.inp_p75)}
                        </span>
                        <span className={`text-xs font-mono w-20 text-right ${classColor(classify("CLS", p.cls_p75))}`}>
                          CLS {format("CLS", p.cls_p75)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detalhe da rota selecionada */}
      {selectedPage && (
        <PageDetailCard
          page={selectedPage}
          detail={detail}
          loading={detailLoading}
          onBack={() => {
            setSelectedPage(null);
            setDetail(null);
          }}
          onRefresh={() => void fetchDetail(selectedPage)}
        />
      )}
    </div>
  );
}

function PageDetailCard({
  page,
  detail,
  loading,
  onBack,
  onRefresh,
}: {
  page: string;
  detail: PageDetail | null;
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const overall = detail?.overall;
  const timeline = (detail?.timeline || []).map((d) => ({
    ...d,
    dayLabel: new Date(d.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">Detalhe · </span>
            <code className="text-sm font-mono bg-muted/50 px-2 py-0.5 rounded truncate">
              {page}
            </code>
          </CardTitle>
          <CardDescription>
            Métricas e breakdown de performance apenas desta rota.
            {overall && (
              <span className="block mt-1 font-mono text-xs">
                {overall.total_samples.toLocaleString("pt-BR")} amostras no período
              </span>
            )}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="icon" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : !overall || !overall.total_samples ? (
          <div className="text-center py-10 text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Sem amostras para esta rota no período selecionado.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <VitalCard metric="LCP"  value={overall.lcp_p75}  label="Largest CP" />
              <VitalCard metric="FCP"  value={overall.fcp_p75}  label="First CP" />
              <VitalCard metric="INP"  value={overall.inp_p75}  label="Interaction" />
              <VitalCard metric="CLS"  value={overall.cls_p75}  label="Layout Shift" />
              <VitalCard metric="TTFB" value={overall.ttfb_p75} label="Time to FB" />
            </div>

            {timeline.length > 1 && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Tendência desta rota — p75 por dia</p>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={timeline}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `${Math.round(v)} ms`} />
                    <Legend />
                    <Line type="monotone" dataKey="lcp_p75" name="LCP" stroke="hsl(var(--primary))" dot={false} />
                    <Line type="monotone" dataKey="inp_p75" name="INP" stroke="hsl(var(--destructive))" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              {/* Breakdown por device */}
              <div className="rounded-lg border">
                <div className="px-3 py-2 border-b flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Por classe de dispositivo</p>
                </div>
                {(detail?.by_device || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3 py-4">Sem dados suficientes.</p>
                ) : (
                  <div className="divide-y">
                    {(detail?.by_device || []).map((d) => (
                      <div key={d.device} className="px-3 py-2 flex items-center gap-3">
                        <span className="text-xs capitalize flex-1">{d.device}</span>
                        <span className="text-[10px] text-muted-foreground w-16 text-right">
                          {d.samples} amostras
                        </span>
                        <span className={`text-xs font-mono w-20 text-right ${classColor(classify("LCP", d.lcp_p75))}`}>
                          LCP {format("LCP", d.lcp_p75)}
                        </span>
                        <span className={`text-xs font-mono w-20 text-right ${classColor(classify("INP", d.inp_p75))}`}>
                          INP {format("INP", d.inp_p75)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Breakdown por conexão */}
              <div className="rounded-lg border">
                <div className="px-3 py-2 border-b flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Por tipo de conexão</p>
                </div>
                {(detail?.by_connection || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3 py-4">Sem dados suficientes.</p>
                ) : (
                  <div className="divide-y">
                    {(detail?.by_connection || []).map((c) => (
                      <div key={c.connection} className="px-3 py-2 flex items-center gap-3">
                        <span className="text-xs uppercase flex-1">{c.connection}</span>
                        <span className="text-[10px] text-muted-foreground w-16 text-right">
                          {c.samples} amostras
                        </span>
                        <span className={`text-xs font-mono w-20 text-right ${classColor(classify("LCP", c.lcp_p75))}`}>
                          LCP {format("LCP", c.lcp_p75)}
                        </span>
                        <span className={`text-xs font-mono w-20 text-right ${classColor(classify("INP", c.inp_p75))}`}>
                          INP {format("INP", c.inp_p75)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
