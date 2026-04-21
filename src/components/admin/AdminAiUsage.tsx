import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, RefreshCw, Brain, TrendingUp, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface UsageRow {
  company_id: string | null;
  company_name: string | null;
  function_name: string;
  calls_ok: number;
  calls_error: number;
  tokens_total: number | null;
  cost_millicents: number | null;
}

interface QuotaRow {
  id: string;
  plan: string;
  function_name: string;
  monthly_limit: number;
  description: string | null;
  updated_at: string;
}

const PLAN_ORDER = ["emissor", "starter", "business", "pro"];
const FUNCTION_LABELS: Record<string, string> = {
  ai_support: "Assistente suporte",
  ai_report: "Relatórios IA",
  ai_product_image: "Cadastro por foto",
  ai_marketing_art: "Artes de marketing",
};

function formatCost(millicents: number | null): string {
  if (!millicents || millicents <= 0) return "US$ 0,00";
  const usd = millicents / 100_000;
  return usd.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatNumber(n: number | null): string {
  if (!n) return "0";
  return n.toLocaleString("pt-BR");
}

export function AdminAiUsage() {
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingQuota, setSavingQuota] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const loadData = async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - days * 86400000).toISOString();

      // Consulta agregada: soma calls_ok, calls_error, tokens, cost por (company, function)
      const [usageRes, quotasRes] = await Promise.all([
        supabase
          .from("ai_usage_daily_by_company" as never)
          .select("*")
          .gte("day", since),
        supabase
          .from("ai_quotas_per_plan" as never)
          .select("*")
          .order("plan"),
      ]);

      if (usageRes.error) throw usageRes.error;
      if (quotasRes.error) throw quotasRes.error;

      // Agrega por company × function
      const agg = new Map<string, UsageRow>();
      for (const row of (usageRes.data ?? []) as unknown as (UsageRow & { day: string })[]) {
        const key = `${row.company_id ?? "null"}::${row.function_name}`;
        const existing = agg.get(key);
        if (existing) {
          existing.calls_ok += row.calls_ok || 0;
          existing.calls_error += row.calls_error || 0;
          existing.tokens_total = (existing.tokens_total ?? 0) + (row.tokens_total ?? 0);
          existing.cost_millicents = (existing.cost_millicents ?? 0) + (row.cost_millicents ?? 0);
        } else {
          agg.set(key, {
            company_id: row.company_id,
            company_name: row.company_name,
            function_name: row.function_name,
            calls_ok: row.calls_ok || 0,
            calls_error: row.calls_error || 0,
            tokens_total: row.tokens_total ?? 0,
            cost_millicents: row.cost_millicents ?? 0,
          });
        }
      }

      setUsage(
        Array.from(agg.values()).sort(
          (a, b) => (b.cost_millicents ?? 0) - (a.cost_millicents ?? 0),
        ),
      );
      setQuotas((quotasRes.data ?? []) as unknown as QuotaRow[]);
    } catch (err) {
      toast.error("Erro ao carregar uso: " + (err instanceof Error ? err.message : "?"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const totals = useMemo(() => {
    return usage.reduce(
      (acc, r) => {
        acc.calls += r.calls_ok + r.calls_error;
        acc.errors += r.calls_error;
        acc.tokens += r.tokens_total ?? 0;
        acc.cost += r.cost_millicents ?? 0;
        return acc;
      },
      { calls: 0, errors: 0, tokens: 0, cost: 0 },
    );
  }, [usage]);

  const topConsumers = useMemo(() => {
    const byCompany = new Map<string, { name: string; cost: number; calls: number }>();
    for (const r of usage) {
      if (!r.company_id) continue;
      const k = r.company_id;
      const e = byCompany.get(k) ?? {
        name: r.company_name ?? "(sem nome)",
        cost: 0,
        calls: 0,
      };
      e.cost += r.cost_millicents ?? 0;
      e.calls += r.calls_ok + r.calls_error;
      byCompany.set(k, e);
    }
    return Array.from(byCompany.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);
  }, [usage]);

  const updateQuota = async (quota: QuotaRow, newLimit: number) => {
    setSavingQuota(quota.id);
    try {
      const { error } = await supabase
        .from("ai_quotas_per_plan" as never)
        .update({ monthly_limit: newLimit })
        .eq("id", quota.id);
      if (error) throw error;
      setQuotas((prev) =>
        prev.map((q) => (q.id === quota.id ? { ...q, monthly_limit: newLimit } : q)),
      );
      toast.success("Quota atualizada");
    } catch (err) {
      toast.error("Erro ao atualizar quota: " + (err instanceof Error ? err.message : "?"));
    } finally {
      setSavingQuota(null);
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Brain className="h-4 w-4" />
        <AlertTitle>Controle de Custo de IA</AlertTitle>
        <AlertDescription className="text-sm">
          Toda chamada de IA é registrada em <code>ai_usage</code> com tokens e custo estimado.
          Use esta tela para identificar empresas consumindo muito e ajustar quotas por plano.
          Quotas aplicadas: <code>ai_support</code>, <code>ai_report</code>,{" "}
          <code>ai_product_image</code>, <code>ai_marketing_art</code>.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Chamadas totais" value={formatNumber(totals.calls)} icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard
          label="Erros"
          value={formatNumber(totals.errors)}
          sub={totals.calls > 0 ? `${((totals.errors / totals.calls) * 100).toFixed(1)}% erro` : ""}
          variant={totals.errors > 10 ? "warning" : "default"}
        />
        <StatCard label="Tokens consumidos" value={formatNumber(totals.tokens)} />
        <StatCard
          label="Custo estimado (USD)"
          value={formatCost(totals.cost)}
          sub={`últimos ${days} dias`}
          variant={totals.cost > 1_000_000 ? "warning" : "default"}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Consumo por empresa × função</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[130px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          {loading && <Loader2 className="w-5 h-5 animate-spin mx-auto my-4" />}
          {!loading && usage.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Sem uso de IA no período.</p>
          )}
          {usage.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="text-left border-b">
                  <tr>
                    <th className="p-2">Empresa</th>
                    <th className="p-2">Função</th>
                    <th className="p-2 text-right">Chamadas</th>
                    <th className="p-2 text-right">Erros</th>
                    <th className="p-2 text-right">Tokens</th>
                    <th className="p-2 text-right">Custo est.</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.slice(0, 50).map((r, idx) => {
                    const total = r.calls_ok + r.calls_error;
                    const errorPct = total > 0 ? (r.calls_error / total) * 100 : 0;
                    return (
                      <tr key={idx} className="border-b last:border-b-0">
                        <td className="p-2 truncate max-w-[200px]">{r.company_name ?? "(sem empresa)"}</td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[10px]">
                            {FUNCTION_LABELS[r.function_name] ?? r.function_name}
                          </Badge>
                        </td>
                        <td className="p-2 text-right">{formatNumber(total)}</td>
                        <td className="p-2 text-right">
                          <span className={errorPct > 10 ? "text-destructive font-medium" : ""}>
                            {formatNumber(r.calls_error)}
                            {errorPct > 0 && <span className="ml-1 text-muted-foreground">({errorPct.toFixed(0)}%)</span>}
                          </span>
                        </td>
                        <td className="p-2 text-right">{formatNumber(r.tokens_total)}</td>
                        <td className="p-2 text-right font-medium">{formatCost(r.cost_millicents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {topConsumers.length > 0 && (
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Top 10 consumidores
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-2">
            {topConsumers.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-2 rounded bg-muted/40 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{formatNumber(c.calls)} chamadas</div>
                </div>
                <div className="font-semibold shrink-0">{formatCost(c.cost)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Quotas mensais por plano</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <p className="text-xs text-muted-foreground mb-3">
            0 = função indisponível no plano · vazio = ilimitado (não recomendado em produção).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="text-left border-b">
                <tr>
                  <th className="p-2">Plano</th>
                  <th className="p-2">Função</th>
                  <th className="p-2">Descrição</th>
                  <th className="p-2 w-32">Limite mensal</th>
                </tr>
              </thead>
              <tbody>
                {quotas
                  .sort((a, b) => {
                    const pa = PLAN_ORDER.indexOf(a.plan);
                    const pb = PLAN_ORDER.indexOf(b.plan);
                    if (pa !== pb) return pa - pb;
                    return a.function_name.localeCompare(b.function_name);
                  })
                  .map((q) => (
                    <QuotaRowEditor
                      key={q.id}
                      quota={q}
                      saving={savingQuota === q.id}
                      onSave={(v) => updateQuota(q, v)}
                    />
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  variant = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  variant?: "default" | "warning";
}) {
  return (
    <Card className={variant === "warning" ? "border-amber-400/60" : ""}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>{label}</span>
          {icon}
        </div>
        <div className="text-lg sm:text-xl font-bold">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function QuotaRowEditor({
  quota,
  saving,
  onSave,
}: {
  quota: QuotaRow;
  saving: boolean;
  onSave: (n: number) => void;
}) {
  const [value, setValue] = useState(String(quota.monthly_limit));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(String(quota.monthly_limit));
    setDirty(false);
  }, [quota.monthly_limit]);

  return (
    <tr className="border-b last:border-b-0">
      <td className="p-2 font-medium capitalize">{quota.plan}</td>
      <td className="p-2">
        <Badge variant="outline" className="text-[10px]">
          {FUNCTION_LABELS[quota.function_name] ?? quota.function_name}
        </Badge>
      </td>
      <td className="p-2 text-muted-foreground">{quota.description || "—"}</td>
      <td className="p-2">
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setDirty(e.target.value !== String(quota.monthly_limit));
            }}
            className="h-8 w-20 text-right"
            disabled={saving}
          />
          {dirty && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onSave(Math.max(0, Math.round(Number(value) || 0)))}
              disabled={saving}
              className="h-8 gap-1"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
