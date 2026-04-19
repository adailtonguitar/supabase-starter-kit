import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminRole } from "@/hooks/useAdminRole";
import {
  getFiscalAuditStats,
  readFiscalAuditEvents,
  clearFiscalAuditEvents,
  type FiscalAuditStats,
  type FiscalAuditEvent,
} from "@/lib/fiscal-audit-store";
import { RefreshCw, Trash2, ShieldCheck, AlertTriangle, ShieldAlert, Inbox } from "lucide-react";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function StatusBadge({ stats }: { stats: FiscalAuditStats }) {
  const map = {
    READY: { variant: "default" as const, icon: ShieldCheck, cls: "bg-emerald-600 hover:bg-emerald-600 text-white" },
    STABLE: { variant: "secondary" as const, icon: AlertTriangle, cls: "bg-amber-500 hover:bg-amber-500 text-white" },
    RISK: { variant: "destructive" as const, icon: ShieldAlert, cls: "" },
    NO_DATA: { variant: "outline" as const, icon: Inbox, cls: "" },
  }[stats.status];
  const Icon = map.icon;
  return (
    <Badge variant={map.variant} className={`gap-1 text-sm px-3 py-1 ${map.cls}`}>
      <Icon className="h-4 w-4" />
      {stats.status_label}
    </Badge>
  );
}

export default function FiscalAudit() {
  const { isSuperAdmin, loading } = useAdminRole();
  const [tick, setTick] = useState(0);

  const stats = useMemo(() => getFiscalAuditStats(), [tick]);
  const events = useMemo<FiscalAuditEvent[]>(() => readFiscalAuditEvents(), [tick]);

  useEffect(() => {
    document.title = "Auditoria Fiscal — CFOP & Motor Tributário";
  }, []);

  if (loading) return <div className="p-6 text-muted-foreground">Verificando permissão...</div>;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  const divergences = events
    .filter(e => (e.divergences?.length ?? 0) > 0)
    .slice(-50)
    .reverse();

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Auditoria Fiscal</h1>
          <p className="text-sm text-muted-foreground">
            Painel read-only baseado em logs locais do shadow pipeline (CFOP + Motor Tributário).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setTick(t => t + 1)}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar dados
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Limpar eventos locais de auditoria? Não afeta emissão.")) {
                clearFiscalAuditEvents();
                setTick(t => t + 1);
              }
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Limpar
          </Button>
        </div>
      </header>

      {/* RESUMO */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total de eventos</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Auto-aplicação</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{pct(stats.auto_apply_rate)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Divergência</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{pct(stats.divergence_rate)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Fallback (RPC falhou)</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{pct(stats.fallback_rate)}</div></CardContent>
        </Card>
      </section>

      {/* STATUS INTELIGENTE */}
      <Card>
        <CardHeader><CardTitle>Status geral da automação fiscal</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          <StatusBadge stats={stats} />
          <p className="text-sm text-muted-foreground">
            Critério: ≥95% auto-apply e ≥30 eventos = pronto. 85–94% = monitorar. &lt;85% = risco.
          </p>
        </CardContent>
      </Card>

      {stats.total === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 mx-auto mb-2 opacity-50" />
            Nenhum evento registrado ainda. Emita uma NFC-e ou NF-e para popular o painel.
          </CardContent>
        </Card>
      )}

      {/* DIVERGÊNCIAS */}
      {divergences.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Últimas divergências (50)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>CFOP atual</TableHead>
                  <TableHead>CFOP sugerido</TableHead>
                  <TableHead>Campos divergentes</TableHead>
                  <TableHead>Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {divergences.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{e.produto_id ?? "—"}</TableCell>
                    <TableCell className="font-mono">{e.cfop_atual ?? "—"}</TableCell>
                    <TableCell className="font-mono">{e.cfop_sugerido ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {(e.divergences || []).map((d, j) => (
                        <div key={j}>
                          <span className="font-semibold">{d.field}:</span> {String(d.current)} → {String(d.suggested)}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(e.timestamp).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* CAMPOS PROBLEMÁTICOS */}
      {stats.top_skipped_fields.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Campos mais ignorados (skipped)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Campo</TableHead><TableHead className="text-right">Ocorrências</TableHead></TableRow></TableHeader>
                <TableBody>
                  {stats.top_skipped_fields.map(f => (
                    <TableRow key={f.field}>
                      <TableCell className="font-mono">{f.field}</TableCell>
                      <TableCell className="text-right">{f.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Top divergências de CFOP</CardTitle></CardHeader>
            <CardContent>
              {stats.top_cfop_errors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem divergências de CFOP.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Atual</TableHead><TableHead>Sugerido</TableHead><TableHead className="text-right">Qtd</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {stats.top_cfop_errors.map(e => (
                      <TableRow key={e.key}>
                        <TableCell className="font-mono">{e.current}</TableCell>
                        <TableCell className="font-mono">{e.suggested}</TableCell>
                        <TableCell className="text-right">{e.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
