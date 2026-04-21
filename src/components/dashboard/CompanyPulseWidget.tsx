import { useEffect, useMemo, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Heart, AlertTriangle, CheckCircle2, ChevronRight, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Link } from "react-router-dom";

interface PulseSignal {
  severity: "info" | "low" | "medium" | "high";
  key: string;
  message: string;
}

interface PulseResponse {
  ok: boolean;
  score: number;
  tier: "excelente" | "bom" | "atencao" | "critico";
  metrics: {
    sales_7d: number;
    sales_7d_prev: number;
    sales_count_7d: number;
    sales_delta_pct: number | null;
    low_stock: number;
    out_of_stock: number;
    active_clients: number;
    fiado_total: number;
    fiado_count: number;
    nfe_total_30d: number;
    rejection_rate: number;
    cert_status: string;
    cert_expires_at: string | null;
  };
  signals: PulseSignal[];
}

interface DataQualityItem {
  key: string;
  label: string;
  passed: boolean;
  severity: "low" | "medium" | "high";
  fix_route?: string;
  detail?: string | null;
}

interface DataQualityResponse {
  ok: boolean;
  total: number;
  passed: number;
  score: number;
  items: DataQualityItem[];
}

const TIER_META: Record<PulseResponse["tier"], { label: string; cls: string }> = {
  excelente: { label: "Excelente", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:text-emerald-300" },
  bom:       { label: "Bom",       cls: "bg-blue-500/15 text-blue-700 border-blue-300 dark:text-blue-300" },
  atencao:   { label: "Atenção",   cls: "bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-300" },
  critico:   { label: "Crítico",   cls: "bg-red-500/15 text-red-700 border-red-300 dark:text-red-300" },
};

const SEV_DOT: Record<PulseSignal["severity"], string> = {
  info: "bg-muted-foreground/50",
  low: "bg-blue-500",
  medium: "bg-amber-500",
  high: "bg-red-500",
};

export function CompanyPulseWidget() {
  const { companyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState<PulseResponse | null>(null);
  const [quality, setQuality] = useState<DataQualityResponse | null>(null);
  const [showQuality, setShowQuality] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [pulseRes, qRes] = await Promise.all([
          supabase.rpc("get_company_pulse", { p_company_id: companyId }),
          supabase.rpc("get_company_data_quality", { p_company_id: companyId }),
        ]);
        if (cancelled) return;
        if (pulseRes.data && (pulseRes.data as PulseResponse).ok) setPulse(pulseRes.data as PulseResponse);
        if (qRes.data && (qRes.data as DataQualityResponse).ok) setQuality(qRes.data as DataQualityResponse);
      } catch (err) {
        console.warn("[CompanyPulseWidget] load error:", err);
      }
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [companyId]);

  const failedItems = useMemo(
    () => (quality?.items ?? []).filter((i) => !i.passed).sort((a, b) => sevWeight(b.severity) - sevWeight(a.severity)),
    [quality],
  );

  if (loading && !pulse) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Calculando pulso da empresa…
        </CardContent>
      </Card>
    );
  }

  if (!pulse) return null;

  const meta = TIER_META[pulse.tier];
  const delta = pulse.metrics.sales_delta_pct;
  const deltaUp = (delta ?? 0) >= 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" /> Pulso da empresa
            </CardTitle>
            <CardDescription>
              Visão rápida de como a operação está hoje.
            </CardDescription>
          </div>
          <Badge variant="outline" className={`${meta.cls} whitespace-nowrap`}>
            {pulse.score}/100 · {meta.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={pulse.score} className="h-2" />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <PulseMetric
            label="Vendas (7d)"
            value={formatCurrency(pulse.metrics.sales_7d)}
            sub={delta === null ? `${pulse.metrics.sales_count_7d} venda(s)` : (
              <span className={deltaUp ? "text-success" : "text-destructive"}>
                {deltaUp ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />}
                {" "}{delta.toFixed(1)}% vs 7d anteriores
              </span>
            )}
          />
          <PulseMetric
            label="Estoque crítico"
            value={`${pulse.metrics.out_of_stock}`}
            sub={`+ ${pulse.metrics.low_stock} abaixo do mínimo`}
          />
          <PulseMetric
            label="Fiado aberto"
            value={formatCurrency(pulse.metrics.fiado_total)}
            sub={`${pulse.metrics.fiado_count} cliente(s)`}
          />
          <PulseMetric
            label="Rejeição fiscal"
            value={`${pulse.metrics.rejection_rate.toFixed(1)}%`}
            sub={`${pulse.metrics.nfe_total_30d} NF-e em 30d`}
            tone={pulse.metrics.rejection_rate > 5 ? "danger" : "default"}
          />
        </div>

        {pulse.signals.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Atenção</div>
            <ul className="space-y-1.5">
              {pulse.signals.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-sm">
                  <span className={`inline-block h-2 w-2 rounded-full ${SEV_DOT[s.severity]}`} />
                  {s.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {quality && quality.total > 0 && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium flex items-center gap-2">
                {quality.score >= 90 ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
                Qualidade de cadastros: <strong>{quality.score}%</strong>
                <span className="text-xs text-muted-foreground">
                  ({quality.passed}/{quality.total})
                </span>
              </div>
              {failedItems.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setShowQuality((v) => !v)}>
                  {showQuality ? "Ocultar" : "Ver pendências"}
                  <ChevronRight className={`h-3.5 w-3.5 ml-1 transition-transform ${showQuality ? "rotate-90" : ""}`} />
                </Button>
              )}
            </div>

            {showQuality && failedItems.length > 0 && (
              <ul className="space-y-1 text-sm">
                {failedItems.map((it) => (
                  <li key={it.key} className="flex items-center justify-between gap-2 border-t pt-1.5">
                    <div className="flex-1">
                      <div className="font-medium text-xs">{it.label}</div>
                      {it.detail && <div className="text-[11px] text-muted-foreground">{it.detail}</div>}
                    </div>
                    {it.fix_route && (
                      <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                        <Link to={it.fix_route}>Corrigir</Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PulseMetric({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: "default" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-300 bg-red-500/10"
      : "border-border bg-muted/20";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function sevWeight(sev: "low" | "medium" | "high") {
  return sev === "high" ? 3 : sev === "medium" ? 2 : 1;
}

export default CompanyPulseWidget;
