import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Clock, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Info, Trash2, Play,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  last_start: string | null;
  last_end: string | null;
  last_status: string | null;
  last_duration_ms: number | null;
  runs_24h: number;
  failures_24h: number;
}

interface PurgeEntry {
  executed_at: string;
  result: {
    ok: boolean;
    duration_ms?: number;
    deleted_ai_usage?: number;
    deleted_error_events?: number;
    deleted_system_errors?: number;
    deleted_cert_alerts?: number;
    deleted_dunning_events?: number;
    deleted_http_responses?: number;
    error?: string;
  };
}

interface CronError {
  jobname: string;
  start_time: string;
  status: string;
  return_message: string | null;
}

interface CronStatus {
  ok: boolean;
  checked_at?: string;
  jobs?: CronJob[];
  purges?: PurgeEntry[];
  errors?: CronError[];
  error?: string;
}

// Tradução rápida do cron expression para texto humano (cobre os casos que usamos)
function humanizeCron(expr: string): string {
  const map: Record<string, string> = {
    "0 4 * * 0":   "Domingo, 01:00 (BRT)",
    "0 12 * * *":  "Diário, 09:00 (BRT)",
    "0 13 * * *":  "Diário, 10:00 (BRT)",
    "*/15 * * * *":"A cada 15 minutos",
    "0 3 * * *":   "Diário, 00:00 (BRT)",
  };
  return map[expr] ?? expr;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

function statusBadge(status: string | null) {
  if (!status) return <Badge variant="secondary">Nunca rodou</Badge>;
  const s = status.toLowerCase();
  if (s === "succeeded" || s === "success") {
    return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">OK</Badge>;
  }
  if (s === "failed" || s === "failure") {
    return <Badge variant="destructive">Falhou</Badge>;
  }
  if (s === "running" || s === "starting") {
    return <Badge variant="secondary">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

export function AdminCronStatus() {
  const [data, setData] = useState<CronStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [runningPurge, setRunningPurge] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase.rpc("get_cron_jobs_status");
      if (error) throw error;
      setData((data as unknown) as CronStatus);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Falha ao carregar status dos crons";
      setErr(msg);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runPurgeNow = async () => {
    setRunningPurge(true);
    try {
      const { data, error } = await supabase.rpc("purge_old_logs_and_record");
      if (error) throw error;
      const r = data as PurgeEntry["result"];
      if (r?.ok) {
        const total =
          (r.deleted_ai_usage ?? 0) +
          (r.deleted_error_events ?? 0) +
          (r.deleted_system_errors ?? 0) +
          (r.deleted_cert_alerts ?? 0) +
          (r.deleted_dunning_events ?? 0) +
          (r.deleted_http_responses ?? 0);
        toast.success(`Limpeza concluída — ${total.toLocaleString("pt-BR")} linhas removidas`);
      } else {
        toast.error(r?.error ?? "Falha na limpeza");
      }
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Falha ao executar limpeza";
      toast.error(msg);
    }
    setRunningPurge(false);
  };

  const jobs = data?.jobs ?? [];
  const purges = data?.purges ?? [];
  const errors = data?.errors ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Status dos Crons &amp; Retenção
          </CardTitle>
          <CardDescription>
            Tarefas agendadas no Supabase (pg_cron) e última execução da limpeza de logs.
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
        ) : loading && !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            {/* Tabela de jobs */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Jobs ativos</h4>
              {jobs.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Nenhum cron encontrado. Verifique se pg_cron está habilitado.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead>Quando</TableHead>
                        <TableHead>Último status</TableHead>
                        <TableHead>Último run</TableHead>
                        <TableHead>Duração</TableHead>
                        <TableHead className="text-right">24h</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((j) => (
                        <TableRow key={j.jobid}>
                          <TableCell className="text-xs font-medium">
                            <div className="flex items-center gap-2">
                              {j.active
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                              {j.jobname}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <span title={j.schedule}>{humanizeCron(j.schedule)}</span>
                          </TableCell>
                          <TableCell>{statusBadge(j.last_status)}</TableCell>
                          <TableCell className="text-xs">{fmtDate(j.last_start)}</TableCell>
                          <TableCell className="text-xs">{fmtDuration(j.last_duration_ms)}</TableCell>
                          <TableCell className="text-xs text-right">
                            {j.runs_24h}
                            {j.failures_24h > 0 && (
                              <span className="text-destructive ml-1">
                                ({j.failures_24h} falha{j.failures_24h > 1 ? "s" : ""})
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Erros recentes */}
            {errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Falhas recentes (7d)
                </h4>
                <div className="space-y-2">
                  {errors.map((e, i) => (
                    <div key={i} className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-medium">{e.jobname}</span>
                        <span className="text-muted-foreground">{fmtDate(e.start_time)}</span>
                      </div>
                      {e.return_message && (
                        <p className="mt-1 text-muted-foreground break-words">{e.return_message}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Histórico de purges */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Trash2 className="h-4 w-4" /> Últimas limpezas de retenção
                </h4>
                <Button
                  variant="outline" size="sm"
                  onClick={runPurgeNow} disabled={runningPurge}
                  title="Executa a função de retenção manualmente"
                >
                  {runningPurge
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    : <Play className="h-3.5 w-3.5 mr-1" />}
                  Executar agora
                </Button>
              </div>

              {purges.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma execução registrada ainda. O cron semanal roda domingo às 01:00 (BRT),
                  ou você pode executar manualmente pelo botão acima.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead>
                        <TableHead className="text-right">ai_usage</TableHead>
                        <TableHead className="text-right">error_events</TableHead>
                        <TableHead className="text-right">system_errors</TableHead>
                        <TableHead className="text-right">http_responses</TableHead>
                        <TableHead className="text-right">Duração</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purges.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{fmtDate(p.executed_at)}</TableCell>
                          <TableCell className="text-xs text-right">{p.result.deleted_ai_usage ?? 0}</TableCell>
                          <TableCell className="text-xs text-right">{p.result.deleted_error_events ?? 0}</TableCell>
                          <TableCell className="text-xs text-right">{p.result.deleted_system_errors ?? 0}</TableCell>
                          <TableCell className="text-xs text-right">{p.result.deleted_http_responses ?? 0}</TableCell>
                          <TableCell className="text-xs text-right">
                            {p.result.duration_ms != null
                              ? fmtDuration(Math.round(p.result.duration_ms))
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default AdminCronStatus;
