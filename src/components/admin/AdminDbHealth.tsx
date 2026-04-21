import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Database, RefreshCw, Loader2, AlertTriangle, Activity,
  HardDrive, Network, Clock, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface HealthSnapshot {
  ok: boolean;
  checked_at?: string;
  database_size?: number;
  database_size_pretty?: string;
  connections?: number;
  connections_max?: number;
  connections_pct?: number;
  last_purge_at?: string | null;
  last_purge_ok?: boolean | null;
  last_critical_error_at?: string | null;
  table_counts?: Record<string, number>;
  error?: string;
}

const TABLE_LABELS: Record<string, string> = {
  companies:        "Empresas",
  company_users:    "Vínculos empresa-usuário",
  profiles:         "Usuários",
  sales:            "Vendas",
  sale_items:       "Itens de venda",
  products:         "Produtos",
  clients:          "Clientes",
  suppliers:        "Fornecedores",
  financial_entries:"Lançamentos financeiros",
  stock_movements:  "Movimentos de estoque",
  fiscal_documents: "Documentos fiscais",
  fiscal_queue:     "Fila fiscal",
  nfe_imports:      "NF-e importadas",
  subscriptions:    "Assinaturas",
  payments:         "Pagamentos",
  company_plans:    "Planos ativos",
  user_sessions:    "Sessões",
};

const CRITICAL_ORDER = [
  "companies", "subscriptions", "company_plans", "profiles", "company_users",
  "sales", "sale_items", "products", "clients", "suppliers",
  "financial_entries", "stock_movements",
  "fiscal_documents", "fiscal_queue", "nfe_imports",
  "payments", "user_sessions",
];

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function fmtNumber(n: number | undefined | null): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR");
}

function hoursSince(s: string | null | undefined): number | null {
  if (!s) return null;
  const diffMs = Date.now() - new Date(s).getTime();
  return diffMs / (1000 * 60 * 60);
}

export function AdminDbHealth() {
  const [snap, setSnap] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase.rpc("get_db_health_snapshot");
      if (error) throw error;
      setSnap((data as unknown) as HealthSnapshot);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Falha ao carregar health");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Sinalizações
  const connPct = snap?.connections_pct ?? 0;
  const connWarn = connPct >= 70;
  const connCritical = connPct >= 90;

  const criticalAgeHours = hoursSince(snap?.last_critical_error_at);
  const criticalRecent = criticalAgeHours != null && criticalAgeHours < 24;

  const purgeAgeHours = hoursSince(snap?.last_purge_at);
  // Purge semanal: alerta se > 10 dias (cron pode ter parado)
  const purgeStale = purgeAgeHours != null && purgeAgeHours > 24 * 10;

  const tableCounts = snap?.table_counts ?? {};
  const knownTables = CRITICAL_ORDER.filter(k => k in tableCounts);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" /> Saúde do Banco
          </CardTitle>
          <CardDescription>
            Snapshot de integridade — atualizado a cada 60s. Contagens são estimativas (pg_class.reltuples).
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {err ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro ao consultar</AlertTitle>
            <AlertDescription className="text-xs">{err}</AlertDescription>
          </Alert>
        ) : loading && !snap ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : !snap?.ok ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Snapshot indisponível</AlertTitle>
            <AlertDescription className="text-xs">{snap?.error ?? "Erro desconhecido"}</AlertDescription>
          </Alert>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <HardDrive className="h-3.5 w-3.5" /> Tamanho
                </div>
                <div className="mt-1 text-lg font-semibold">{snap.database_size_pretty ?? "—"}</div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Network className="h-3.5 w-3.5" /> Conexões
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {snap.connections}/{snap.connections_max}
                  {connCritical && <Badge variant="destructive" className="ml-2 text-[10px]">Crítico</Badge>}
                  {!connCritical && connWarn && <Badge variant="secondary" className="ml-2 text-[10px]">Alto</Badge>}
                </div>
                <Progress value={connPct} className="mt-2 h-1.5" />
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" /> Última limpeza
                </div>
                <div className="mt-1 text-sm font-medium">
                  {fmtDate(snap.last_purge_at)}
                  {snap.last_purge_ok === false && (
                    <Badge variant="destructive" className="ml-2 text-[10px]">Falhou</Badge>
                  )}
                  {purgeStale && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">&gt; 10d</Badge>
                  )}
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Activity className="h-3.5 w-3.5" /> Último erro crítico
                </div>
                <div className="mt-1 text-sm font-medium">
                  {fmtDate(snap.last_critical_error_at)}
                  {criticalRecent && (
                    <Badge variant="destructive" className="ml-2 text-[10px]">&lt; 24h</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Avisos */}
            {(connCritical || purgeStale || criticalRecent) && (
              <div className="space-y-2">
                {connCritical && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Conexões saturadas</AlertTitle>
                    <AlertDescription className="text-xs">
                      Uso em {connPct}% do pool. Investigue connection leaks ou aumente pool em
                      Supabase Dashboard → Settings → Database → Connection Pool.
                    </AlertDescription>
                  </Alert>
                )}
                {purgeStale && (
                  <Alert>
                    <Clock className="h-4 w-4" />
                    <AlertTitle>Retenção parada</AlertTitle>
                    <AlertDescription className="text-xs">
                      O cron semanal de limpeza não executa há mais de 10 dias. Cheque
                      &quot;Status dos Crons&quot; ou rode manualmente.
                    </AlertDescription>
                  </Alert>
                )}
                {criticalRecent && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Erro crítico nas últimas 24h</AlertTitle>
                    <AlertDescription className="text-xs">
                      Verifique Global Logs ou o canal de webhook configurado.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Contagens */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">
                Contagens estimadas ({knownTables.length} tabelas críticas)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {knownTables.map((key) => (
                  <div key={key} className="rounded border p-2 flex flex-col">
                    <span className="text-[11px] text-muted-foreground truncate" title={key}>
                      {TABLE_LABELS[key] ?? key}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {fmtNumber(tableCounts[key])}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Dica: uma queda súbita em qualquer contagem é sinal de deleção em massa ou corrupção — vale investigar
                os logs de auditoria antes de assumir que foi intencional.
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Última verificação: {fmtDate(snap.checked_at)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default AdminDbHealth;
