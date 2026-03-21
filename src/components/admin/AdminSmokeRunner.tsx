/**
 * Smoke tests de PLATAFORMA (super admin): conexão, Edge admin-query, tabelas críticas.
 * Complementa o Diagnóstico do Sistema (/admin/diagnostico), que testa fluxos na empresa selecionada.
 */
import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { adminQuery } from "@/lib/admin-query";
import { CheckCircle2, XCircle, Loader2, Play, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export type SmokeCheckStatus = "pending" | "running" | "pass" | "fail";

export interface SmokeCheck {
  id: string;
  name: string;
  description: string;
  status: SmokeCheckStatus;
  detail?: string;
  ms?: number;
}

const INITIAL_CHECKS: Omit<SmokeCheck, "status" | "detail" | "ms">[] = [
  {
    id: "session",
    name: "Sessão Supabase (JWT)",
    description: "Token válido e sessão ativa no cliente.",
  },
  {
    id: "edge-admin-query",
    name: "Edge Function admin-query",
    description: "Função responde e retorna empresas (service role + super_admin).",
  },
  {
    id: "system-errors-24h",
    name: "Tabela system_errors (24h)",
    description: "Leitura via admin-query com filtro de data (últimas 24h).",
  },
  {
    id: "action-logs-sample",
    name: "Tabela action_logs",
    description: "Último registro de auditoria (amostra).",
  },
  {
    id: "telemetry-sample",
    name: "Tabela telemetry",
    description: "Amostra de telemetria (dashboard de uso).",
  },
  {
    id: "webhook-logs-sample",
    name: "Tabela payment_webhook_logs",
    description: "Amostra de logs de webhook de pagamento.",
  },
  {
    id: "companies-direct",
    name: "Leitura direta companies (RLS)",
    description: "Cliente Supabase com seu usuário (não só Edge).",
  },
];

export function AdminSmokeRunner() {
  const [checks, setChecks] = useState<SmokeCheck[]>(() =>
    INITIAL_CHECKS.map((c) => ({ ...c, status: "pending" as const }))
  );
  const [running, setRunning] = useState(false);

  const updateCheck = useCallback((id: string, patch: Partial<SmokeCheck>) => {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const runSmoke = useCallback(async () => {
    setRunning(true);
    setChecks(INITIAL_CHECKS.map((c) => ({ ...c, status: "pending" as const })));
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (const def of INITIAL_CHECKS) {
      updateCheck(def.id, { status: "running", detail: undefined, ms: undefined });
      const t0 = performance.now();

      try {
        switch (def.id) {
          case "session": {
            const { data, error } = await supabase.auth.getSession();
            if (error) throw error;
            if (!data.session?.access_token) throw new Error("Sem access_token");
            updateCheck(def.id, {
              status: "pass",
              detail: `user: ${data.session.user?.id?.slice(0, 8) ?? "?"}…`,
              ms: Math.round(performance.now() - t0),
            });
            break;
          }
          case "edge-admin-query": {
            const rows = await adminQuery<{ id: string; name?: string }>({
              table: "companies",
              select: "id, name",
              limit: 1,
            });
            if (!Array.isArray(rows)) throw new Error("Resposta inválida");
            updateCheck(def.id, {
              status: "pass",
              detail: rows.length ? `${rows.length} linha(s)` : "0 empresas (ok)",
              ms: Math.round(performance.now() - t0),
            });
            break;
          }
          case "system-errors-24h": {
            const rows = await adminQuery<{ id: string }>({
              table: "system_errors",
              select: "id",
              filters: [{ op: "gte", column: "created_at", value: since }],
              order: { column: "created_at", ascending: false },
              limit: 5,
            });
            if (!Array.isArray(rows)) throw new Error("Resposta inválida");
            updateCheck(def.id, {
              status: "pass",
              detail: `${rows.length} registro(s) em 24h (amostra até 5)`,
              ms: Math.round(performance.now() - t0),
            });
            break;
          }
          case "action-logs-sample": {
            const rows = await adminQuery<{ id: string; action?: string }>({
              table: "action_logs",
              select: "id, action, created_at",
              order: { column: "created_at", ascending: false },
              limit: 1,
            });
            if (!Array.isArray(rows)) throw new Error("Resposta inválida");
            updateCheck(def.id, {
              status: "pass",
              detail: rows[0]?.action ? `último: ${rows[0].action}` : "sem linhas",
              ms: Math.round(performance.now() - t0),
            });
            break;
          }
          case "telemetry-sample": {
            const rows = await adminQuery<{ id: string }>({
              table: "telemetry",
              select: "id",
              order: { column: "period_date", ascending: false },
              limit: 1,
            });
            if (!Array.isArray(rows)) throw new Error("Resposta inválida");
            updateCheck(def.id, {
              status: "pass",
              detail: rows.length ? "ok" : "vazio (ok)",
              ms: Math.round(performance.now() - t0),
            });
            break;
          }
          case "webhook-logs-sample": {
            const rows = await adminQuery<{ id: string }>({
              table: "payment_webhook_logs",
              select: "id",
              order: { column: "created_at", ascending: false },
              limit: 1,
            });
            if (!Array.isArray(rows)) throw new Error("Resposta inválida");
            updateCheck(def.id, {
              status: "pass",
              detail: rows.length ? "ok" : "sem webhooks ainda (ok)",
              ms: Math.round(performance.now() - t0),
            });
            break;
          }
          case "companies-direct": {
            const { error, count } = await supabase
              .from("companies")
              .select("id", { count: "exact", head: true });
            if (error) throw error;
            updateCheck(def.id, {
              status: "pass",
              detail: `count: ${count ?? 0}`,
              ms: Math.round(performance.now() - t0),
            });
            break;
          }
          default:
            throw new Error("Check desconhecido");
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        updateCheck(def.id, {
          status: "fail",
          detail: msg,
          ms: Math.round(performance.now() - t0),
        });
      }
    }

    setRunning(false);
  }, [updateCheck]);

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Radio className="h-5 w-5 text-primary" />
              Smoke — Plataforma
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm max-w-2xl">
              Sete verificações rápidas (somente leitura / amostra) para validar Edge <code className="text-[10px] sm:text-xs">admin-query</code>, auditoria e
              tabelas usadas no painel. Para testes de negócio na empresa (PDV, estoque, RPC de venda), use a aba{" "}
              <strong>Diagnóstico</strong> ou <strong>/admin/diagnostico</strong>.
            </CardDescription>
          </div>
          <Button size="sm" onClick={runSmoke} disabled={running} className="gap-2 shrink-0">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Executando…" : "Rodar smoke"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge variant="outline" className="text-xs">
            {checks.filter((c) => c.status !== "pending").length}/{checks.length} executados
          </Badge>
          {passed > 0 && (
            <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-emerald-600/30 text-xs">{passed} ok</Badge>
          )}
          {failed > 0 && (
            <Badge variant="destructive" className="text-xs">
              {failed} falha(s)
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 space-y-2">
        <ul className="space-y-2">
          {checks.map((c) => (
            <li
              key={c.id}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 rounded-lg border border-border/80 px-3 py-2 text-sm",
                c.status === "fail" && "border-destructive/40 bg-destructive/5"
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {c.status === "pass" && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                {c.status === "fail" && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                {c.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                {c.status === "pending" && <span className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />}
                <div className="min-w-0">
                  <div className="font-medium leading-tight">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.description}</div>
                  {c.detail && (
                    <div className="text-xs mt-0.5 font-mono break-all text-muted-foreground">{c.detail}</div>
                  )}
                </div>
              </div>
              {c.ms != null && (
                <span className="text-[10px] text-muted-foreground sm:ml-auto shrink-0">{c.ms} ms</span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
