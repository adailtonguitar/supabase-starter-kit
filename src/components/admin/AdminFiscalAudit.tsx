import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getFiscalAuditStats,
  readFiscalAuditEvents,
  clearFiscalAuditEvents,
  recordFiscalAuditEvent,
  type FiscalAuditStats,
  type FiscalAuditEvent,
} from "@/lib/fiscal-audit-store";
import { isAutoApplyFiscalEnabled } from "@/lib/fiscal-auto-apply-flag";
import { RefreshCw, Trash2, ShieldCheck, AlertTriangle, ShieldAlert, Inbox, FlaskConical, Power } from "lucide-react";
import { toast } from "sonner";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function StatusBadge({ stats }: { stats: FiscalAuditStats }) {
  const map = {
    READY:   { icon: ShieldCheck, cls: "bg-emerald-600 hover:bg-emerald-600 text-white" },
    STABLE:  { icon: AlertTriangle, cls: "bg-amber-500 hover:bg-amber-500 text-white" },
    RISK:    { icon: ShieldAlert, cls: "bg-destructive text-destructive-foreground" },
    NO_DATA: { icon: Inbox, cls: "bg-muted text-muted-foreground" },
  }[stats.status];
  const Icon = map.icon;
  return (
    <Badge className={`gap-1 text-sm px-3 py-1 ${map.cls}`}>
      <Icon className="h-4 w-4" />
      {stats.status_label}
    </Badge>
  );
}

export function AdminFiscalAudit() {
  const [tick, setTick] = useState(0);
  const [autoApply, setAutoApply] = useState<boolean>(() => isAutoApplyFiscalEnabled());

  const stats = useMemo(() => getFiscalAuditStats(), [tick]);
  const events = useMemo<FiscalAuditEvent[]>(() => readFiscalAuditEvents(), [tick]);

  useEffect(() => { setAutoApply(isAutoApplyFiscalEnabled()); }, [tick]);

  const toggleAutoApply = (v: boolean) => {
    try {
      if (v) localStorage.setItem("AUTO_APPLY_FISCAL", "true");
      else localStorage.removeItem("AUTO_APPLY_FISCAL");
      setAutoApply(v);
      toast.success(v ? "Auto-aplicação ATIVADA" : "Auto-aplicação DESATIVADA (modo shadow)");
    } catch {
      toast.error("Falha ao alterar a flag");
    }
  };

  const seedDemoData = () => {
    for (let i = 0; i < 35; i++) {
      const hasDiv = i % 5 === 0;
      recordFiscalAuditEvent({
        produto_id: `demo-${i}`,
        cfop_atual: hasDiv ? "5101" : "5102",
        cfop_sugerido: "5405",
        applied: !hasDiv,
        applied_fields: !hasDiv ? ["cfop", "csosn"] : [],
        skipped_fields: hasDiv ? ["cfop"] : [],
        divergences: hasDiv ? [{ field: "cfop", current: "5101", suggested: "5405" }] : [],
        reason: !hasDiv ? "auto_applied_safe" : "shadow_only",
      });
    }
    setTick(t => t + 1);
    toast.success("35 eventos de demonstração inseridos");
  };

  const divergences = events
    .filter(e => (e.divergences?.length ?? 0) > 0)
    .slice(-50)
    .reverse();

  return (
    <div className="space-y-4">
      {/* Controles */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Power className="h-4 w-4 text-primary" /> Controle da Automação Fiscal
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-medium text-sm">Auto-aplicação (CFOP + Motor Tributário)</p>
              <p className="text-xs text-muted-foreground">
                Quando ATIVO: preenche campos vazios/fallback genérico. Nunca sobrescreve dados manuais.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={autoApply ? "default" : "outline"}>
                {autoApply ? "ATIVO" : "SHADOW (somente log)"}
              </Badge>
              <Switch checked={autoApply} onCheckedChange={toggleAutoApply} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              setTick(t => t + 1);
              const s = getFiscalAuditStats();
              toast.success(`Dados atualizados — ${s.total} evento(s) registrado(s)`);
            }}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar dados
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => {
                if (confirm("Limpar eventos locais? Não afeta emissão.")) {
                  clearFiscalAuditEvents();
                  setTick(t => t + 1);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Limpar eventos
            </Button>
            <Button variant="secondary" size="sm" onClick={seedDemoData}>
              <FlaskConical className="h-4 w-4 mr-1" /> Inserir 35 eventos demo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* RESUMO */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total de eventos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Auto-aplicação</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{pct(stats.auto_apply_rate)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Divergência</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{pct(stats.divergence_rate)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Fallback (RPC)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{pct(stats.fallback_rate)}</div></CardContent></Card>
      </div>

      {/* STATUS */}
      <Card>
        <CardHeader className="p-3 sm:p-6"><CardTitle className="text-base sm:text-lg">Status geral</CardTitle></CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 flex items-center gap-4 flex-wrap">
          <StatusBadge stats={stats} />
          <p className="text-xs text-muted-foreground">≥95% e ≥30 eventos = pronto. 85–94% = monitorar. &lt;85% = risco.</p>
        </CardContent>
      </Card>

      {stats.total === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 mx-auto mb-2 opacity-50" />
            Nenhum evento registrado. Emita uma NFC-e ou clique em "Inserir 35 eventos demo".
          </CardContent>
        </Card>
      )}

      {divergences.length > 0 && (
        <Card>
          <CardHeader className="p-3 sm:p-6"><CardTitle className="text-base sm:text-lg">Últimas divergências</CardTitle></CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Produto</TableHead><TableHead>CFOP atual</TableHead><TableHead>Sugerido</TableHead><TableHead>Campos</TableHead><TableHead>Quando</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {divergences.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{e.produto_id ?? "—"}</TableCell>
                    <TableCell className="font-mono">{e.cfop_atual ?? "—"}</TableCell>
                    <TableCell className="font-mono">{e.cfop_sugerido ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {(e.divergences || []).map((d, j) => (
                        <div key={j}><span className="font-semibold">{d.field}:</span> {String(d.current)} → {String(d.suggested)}</div>
                      ))}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(e.timestamp).toLocaleString("pt-BR")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {stats.top_skipped_fields.length > 0 && (
        <div className="grid md:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="p-3 sm:p-6"><CardTitle className="text-base sm:text-lg">Campos mais ignorados</CardTitle></CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <Table>
                <TableHeader><TableRow><TableHead>Campo</TableHead><TableHead className="text-right">Qtd</TableHead></TableRow></TableHeader>
                <TableBody>
                  {stats.top_skipped_fields.map(f => (
                    <TableRow key={f.field}><TableCell className="font-mono">{f.field}</TableCell><TableCell className="text-right">{f.count}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3 sm:p-6"><CardTitle className="text-base sm:text-lg">Top divergências CFOP</CardTitle></CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              {stats.top_cfop_errors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem divergências de CFOP.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Atual</TableHead><TableHead>Sugerido</TableHead><TableHead className="text-right">Qtd</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {stats.top_cfop_errors.map(e => (
                      <TableRow key={e.key}><TableCell className="font-mono">{e.current}</TableCell><TableCell className="font-mono">{e.suggested}</TableCell><TableCell className="text-right">{e.count}</TableCell></TableRow>
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
