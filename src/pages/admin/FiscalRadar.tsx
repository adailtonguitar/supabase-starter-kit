/**
 * Radar Fiscal — painel admin somente leitura.
 * Identifica e prioriza problemas fiscais no cadastro de produtos
 * sem alterar emissão, XML ou cálculo de impostos.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Filter,
  Search,
  ShieldCheck,
  TrendingUp,
  Mail,
  Loader2,
  Clock,
} from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { useCompany } from "@/hooks/useCompany";
import { useAdminRole } from "@/hooks/useAdminRole";
import { supabase } from "@/integrations/supabase/client";
import { computeFiscalScore, suggestCfopFix, type FiscalRiskLevel } from "@/lib/fiscal-radar-score";
import { appendNotifyLog, lastNotifyForCompany } from "@/lib/fiscal-radar-notify-log";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const PAGE_SIZE = 25;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface SalesMetric {
  count: number;
  qty: number;
}

function useSales30dByProduct() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["fiscal-radar-sales-30d", companyId],
    queryFn: async (): Promise<Record<string, SalesMetric>> => {
      if (!companyId) return {};
      const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
      const { data, error } = await supabase
        .from("sale_items" as never)
        .select("product_id, quantity, created_at")
        .eq("company_id" as never, companyId)
        .gte("created_at" as never, since)
        .limit(20000);
      if (error) {
        console.warn("[FiscalRadar] Falha ao agregar vendas 30d:", error);
        return {};
      }
      const map: Record<string, SalesMetric> = {};
      for (const row of (data || []) as Array<{ product_id?: string | null; quantity?: number | null }>) {
        const id = row.product_id;
        if (!id) continue;
        const cur = map[id] || { count: 0, qty: 0 };
        cur.count += 1;
        cur.qty += Number(row.quantity || 0);
        map[id] = cur;
      }
      return map;
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

type FilterMode = "all" | "critical" | "warn" | "st" | "top";

export default function FiscalRadar() {
  const { data: products = [], isLoading } = useProducts();
  const { data: salesMap = {} } = useSales30dByProduct();
  const { companyId } = useCompany();
  const { isSuperAdmin } = useAdminRole();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyNote, setNotifyNote] = useState("");
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [lastNotify, setLastNotify] = useState(() => (companyId ? lastNotifyForCompany(companyId) : null));

  useEffect(() => {
    setLastNotify(companyId ? lastNotifyForCompany(companyId) : null);
  }, [companyId, notifyOpen]);

  const handleNotifyOwner = async () => {
    if (!companyId) {
      toast.error("Empresa não selecionada");
      return;
    }
    const items = scored
      .filter((r) => r.level === "critical" || r.level === "warn")
      .slice(0, 100)
      .map((r) => ({
        product_id: r.product.id,
        name: r.product.name,
        cfop: r.product.cfop ?? null,
        score: r.score,
        problem: r.issues.map((i) => i.message).join("; ") || "—",
        suggestion: suggestCfopFix(r.product.cfop),
        sales_30d: r.sales.count,
      }));
    if (items.length === 0) {
      toast.info("Nenhum produto crítico ou em alerta para notificar.");
      return;
    }
    setNotifyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("notify-fiscal-radar", {
        body: { company_id: companyId, items, note: notifyNote || undefined },
      });
      if (error) throw error;
      const sentTo = (data as any)?.sent_to || [];
      appendNotifyLog({
        ts: new Date().toISOString(),
        company_id: companyId,
        recipients: sentTo,
        critical: (data as any)?.critical || 0,
        warn: (data as any)?.warn || 0,
        note: notifyNote || undefined,
      });
      toast.success(`E-mail enviado para ${sentTo.length} destinatário(s).`);
      console.log("[FISCAL_RADAR_NOTIFY]", { company_id: companyId, sent_to: sentTo });
      setNotifyOpen(false);
      setNotifyNote("");
    } catch (e: any) {
      console.error("[FISCAL_RADAR_NOTIFY] erro:", e);
      toast.error(`Falha ao notificar: ${e?.message || "erro desconhecido"}`);
    } finally {
      setNotifyLoading(false);
    }
  };

  const scored = useMemo(() => {
    return products.map((p) => {
      const sales = salesMap[p.id] || { count: 0, qty: 0 };
      const result = computeFiscalScore(
        { id: p.id, name: p.name, cfop: p.cfop },
        { sales_count: sales.count }
      );
      return { product: p, sales, ...result };
    });
  }, [products, salesMap]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of scored) if (s.product.category) set.add(s.product.category);
    return ["all", ...Array.from(set).sort()];
  }, [scored]);

  const filtered = useMemo(() => {
    let out = scored.filter((r) => r.issues.length > 0 || r.sales.count > 0);
    if (filter === "critical") out = out.filter((r) => r.level === "critical");
    else if (filter === "warn") out = out.filter((r) => r.level === "warn");
    else if (filter === "st") out = out.filter((r) => /^54/.test(String(r.product.cfop || "")));
    else if (filter === "top") out = out.filter((r) => r.sales.count > 0);

    if (category !== "all") out = out.filter((r) => r.product.category === category);

    const q = search.trim().toLowerCase();
    if (q) out = out.filter((r) => (r.product.name || "").toLowerCase().includes(q) || String(r.product.cfop || "").includes(q));

    if (filter === "top") out.sort((a, b) => b.sales.count - a.sales.count || b.score - a.score);
    else out.sort((a, b) => b.score - a.score || b.sales.count - a.sales.count);

    return out;
  }, [scored, filter, category, search]);

  const kpis = useMemo(() => {
    const total = scored.length;
    const critical = scored.filter((r) => r.level === "critical").length;
    const warn = scored.filter((r) => r.level === "warn").length;
    const healthy = total - critical - warn;
    const salesAffected = scored
      .filter((r) => r.level !== "ok")
      .reduce((acc, r) => acc + r.sales.count, 0);
    return {
      total,
      critical,
      warn,
      healthy,
      healthPct: total ? Math.round((healthy / total) * 100) : 100,
      salesAffected,
    };
  }, [scored]);

  useEffect(() => {
    if (!isLoading) {
      console.log({
        type: "FISCAL_RADAR_LOAD",
        total_products: scored.length,
        critical_count: kpis.critical,
        warn_count: kpis.warn,
      });
    }
  }, [isLoading, scored.length, kpis.critical, kpis.warn]);

  useEffect(() => { setPage(1); }, [filter, category, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="p-4 sm:p-6 space-y-5">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-primary" /> Radar Fiscal
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Detecta riscos fiscais no cadastro de produtos, prioriza por impacto de vendas e sugere correções.
              Não altera dados nem o fluxo de emissão.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNotifyOpen(true)}
                disabled={kpis.critical + kpis.warn === 0}
                className="h-8 text-xs gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" /> Notificar dono
                {lastNotify && (
                  <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {new Date(lastNotify.ts).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </Button>
            )}
            <Link
              to="/produtos/auditoria-cfop"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Auditoria CFOP detalhada <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Críticos" value={kpis.critical} tone="critical" icon={<AlertCircle className="w-4 h-4" />} hint="Score ≥ 80 — corrigir imediatamente" />
          <Kpi label="Alertas" value={kpis.warn} tone="warn" icon={<AlertTriangle className="w-4 h-4" />} hint="Score 40–79 — revisar" />
          <Kpi label="Saudáveis" value={`${kpis.healthPct}%`} tone="ok" icon={<CheckCircle2 className="w-4 h-4" />} hint={`${kpis.healthy}/${kpis.total} produtos`} />
          <Kpi label="Vendas afetadas (30d)" value={kpis.salesAffected} tone="warn" icon={<TrendingUp className="w-4 h-4" />} hint="Itens vendidos com produto em risco" />
        </div>

        {/* Filtros */}
        <div className="bg-card rounded-2xl border border-border p-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
            <Filter className="w-3.5 h-3.5" /> Filtros:
          </div>
          {([
            { k: "all", l: "Todos" },
            { k: "critical", l: "Críticos" },
            { k: "warn", l: "Alertas" },
            { k: "st", l: "Apenas ST" },
            { k: "top", l: "Mais vendidos" },
          ] as { k: FilterMode; l: string }[]).map((opt) => (
            <Button
              key={opt.k}
              size="sm"
              variant={filter === opt.k ? "default" : "outline"}
              onClick={() => setFilter(opt.k)}
              className="h-8 text-xs"
            >
              {opt.l}
            </Button>
          ))}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 text-xs rounded-md border border-input bg-background px-2"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c === "all" ? "Todas categorias" : c}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[180px] max-w-xs ml-auto">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto ou CFOP..."
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>

        {/* Ranking */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Produto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">CFOP</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Problema</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Score</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Vendas 30d</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td colSpan={6} className="px-4 py-3"><Skeleton className="h-6 w-full" /></td>
                    </tr>
                  ))
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      Nenhum problema fiscal detectado com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  pageRows.map(({ product, issues, score, level, sales }) => {
                    const suggestion = suggestCfopFix(product.cfop);
                    return (
                      <tr key={product.id} className="border-b border-border last:border-0 hover:bg-primary/[0.03]">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{product.name}</div>
                          {product.category && <div className="text-xs text-muted-foreground">{product.category}</div>}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {product.cfop || <span className="text-muted-foreground">—</span>}
                          {suggestion && (
                            <div className="text-[11px] text-primary mt-0.5">→ sugerir {suggestion}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {issues.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Sem inconsistência</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {issues.map((i, idx) => (
                                <Tooltip key={idx}>
                                  <TooltipTrigger asChild>
                                    <li className={`text-xs cursor-help ${
                                      i.severity === "error" ? "text-destructive" :
                                      i.severity === "warn"  ? "text-amber-700 dark:text-amber-300" :
                                                               "text-sky-700 dark:text-sky-300"
                                    }`}>• {i.message}</li>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <span className="text-xs">{explainCode(i.code)}</span>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ScoreBadge score={score} level={level} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {sales.count > 0 ? sales.count : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/produtos?edit=${product.id}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Corrigir <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-7">Anterior</Button>
                <span>{page} / {totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="h-7">Próxima</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function Kpi({ label, value, tone, icon, hint }: { label: string; value: number | string; tone: FiscalRiskLevel; icon: React.ReactNode; hint?: string }) {
  const styles =
    tone === "critical" ? "border-destructive/30 bg-destructive/10 text-destructive" :
    tone === "warn"     ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" :
                          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`rounded-2xl border px-4 py-3 ${styles} flex items-center justify-between cursor-help`}>
          <div className="flex items-center gap-2 text-sm font-semibold">{icon}{label}</div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
        </div>
      </TooltipTrigger>
      {hint && <TooltipContent><span className="text-xs">{hint}</span></TooltipContent>}
    </Tooltip>
  );
}

function ScoreBadge({ score, level }: { score: number; level: FiscalRiskLevel }) {
  if (level === "critical") return <Badge variant="destructive" className="font-mono">{score}</Badge>;
  if (level === "warn") return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-mono" variant="outline">{score}</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-mono" variant="outline">{score}</Badge>;
}

function explainCode(code: string): string {
  switch (code) {
    case "CFOP_INVALIDO": return "CFOP ausente ou fora do padrão de 4 dígitos. Pode causar rejeição na SEFAZ.";
    case "CFOP_PRODUCAO_REVENDA": return "CFOPs 5101/6101 são de produção própria. Para revenda use 5102/6102.";
    case "CFOP_SOMENTE_INTERNO": return "CFOP 5xxx é válido apenas em operações dentro da mesma UF do emitente.";
    case "CFOP_SOMENTE_INTERESTADUAL": return "CFOP 6xxx é válido apenas em operações para UF diferente da emitente.";
    case "ST_DETECTADO": return "Substituição Tributária detectada (54xx/64xx). Não é erro; é informativo.";
    default: return "";
  }
}
