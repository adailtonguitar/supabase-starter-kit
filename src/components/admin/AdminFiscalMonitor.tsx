import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert, Loader2, Calendar, AlertTriangle, CheckCircle2, FileWarning, Info } from "lucide-react";

interface CertificateAlert {
  company_id: string;
  company_name: string | null;
  doc_type: string;
  environment: string;
  file_name: string | null;
  expires_at: string | null;
  days_remaining: number | null;
  status: "ok" | "warning" | "critical" | "expired" | "missing";
}

interface RejectionDashboard {
  ok: boolean;
  available?: boolean;
  reason?: string;
  message?: string;
  totals: {
    total: number;
    authorized: number;
    rejected: number;
    pending: number;
    rejection_rate: number;
  };
  daily: Array<{ date: string; rejected: number; authorized: number }>;
  top_reasons: Array<{ reason: string; count: number }>;
  top_companies: Array<{
    company_id: string;
    company_name: string;
    rejected: number;
    authorized: number;
    rejection_rate: number;
  }>;
}

const STATUS_COLOR: Record<CertificateAlert["status"], string> = {
  ok: "bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:text-emerald-300",
  warning: "bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-300",
  critical: "bg-orange-500/15 text-orange-700 border-orange-300 dark:text-orange-300",
  expired: "bg-red-500/15 text-red-700 border-red-300 dark:text-red-300",
  missing: "bg-muted text-muted-foreground border-muted",
};

const STATUS_LABEL: Record<CertificateAlert["status"], string> = {
  ok: "OK",
  warning: "Vence em breve",
  critical: "Crítico",
  expired: "VENCIDO",
  missing: "Sem certificado",
};

export function AdminFiscalMonitor() {
  const [certs, setCerts] = useState<CertificateAlert[]>([]);
  const [certsLoading, setCertsLoading] = useState(true);
  const [dashboard, setDashboard] = useState<RejectionDashboard | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [days, setDays] = useState(30);

  const loadCerts = async () => {
    setCertsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_certificate_alerts", { p_days: 90 });
      if (error) throw error;
      setCerts(((data as CertificateAlert[] | null) ?? []).filter((c) => c.status !== "ok"));
    } catch (err) {
      console.error("[AdminFiscalMonitor] loadCerts:", err);
      setCerts([]);
    }
    setCertsLoading(false);
  };

  const [dashError, setDashError] = useState<string | null>(null);

  const loadDashboard = async (d: number) => {
    setDashLoading(true);
    setDashError(null);
    try {
      const { data, error } = await supabase.rpc("get_fiscal_rejection_dashboard", {
        p_days: d,
        p_company_id: null,
      });
      if (error) throw error;
      setDashboard(data as RejectionDashboard);
    } catch (err) {
      console.error("[AdminFiscalMonitor] loadDashboard:", err);
      setDashboard(null);
      setDashError(err instanceof Error ? err.message : "Erro desconhecido");
    }
    setDashLoading(false);
  };

  useEffect(() => {
    void loadCerts();
  }, []);

  useEffect(() => {
    void loadDashboard(days);
  }, [days]);

  const certCounts = useMemo(() => {
    return {
      expired: certs.filter((c) => c.status === "expired").length,
      critical: certs.filter((c) => c.status === "critical").length,
      warning: certs.filter((c) => c.status === "warning").length,
    };
  }, [certs]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" /> Certificados digitais
          </CardTitle>
          <CardDescription>
            Empresas com certificado A1 vencido ou vencendo em até 90 dias. E-mails automáticos são enviados em 30/15/7/1 dia(s) e após o vencimento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {certsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Vencidos" value={certCounts.expired} tone="danger" />
                <StatCard label="Críticos (<7d)" value={certCounts.critical} tone="warning" />
                <StatCard label="Atenção (<30d)" value={certCounts.warning} tone="muted" />
              </div>

              {certs.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Tudo em ordem</AlertTitle>
                  <AlertDescription>
                    Nenhum certificado vencido ou vencendo nos próximos 90 dias.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Arquivo</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Dias</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certs.map((c) => (
                        <TableRow key={`${c.company_id}-${c.doc_type}`}>
                          <TableCell className="font-medium">{c.company_name || c.company_id.slice(0, 8)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">{c.file_name || "—"}</TableCell>
                          <TableCell className="text-xs">{c.doc_type}</TableCell>
                          <TableCell className="text-xs">
                            {c.expires_at
                              ? new Date(c.expires_at).toLocaleDateString("pt-BR")
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {c.days_remaining == null ? "—" : c.days_remaining < 0 ? `${c.days_remaining}` : c.days_remaining}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_COLOR[c.status]}>
                              {STATUS_LABEL[c.status]}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={loadCerts}>
                  <Calendar className="h-3.5 w-3.5 mr-1" /> Atualizar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileWarning className="h-5 w-5" /> Rejeições fiscais
            </CardTitle>
            <CardDescription>
              Panorama de NF-e / NFC-e autorizadas × rejeitadas e motivos mais frequentes.
            </CardDescription>
          </div>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-4">
          {dashLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : dashError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Não foi possível carregar o painel</AlertTitle>
              <AlertDescription className="text-xs">{dashError}</AlertDescription>
            </Alert>
          ) : !dashboard ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Sem dados</AlertTitle>
              <AlertDescription>
                Nenhuma informação retornada pelo servidor.
              </AlertDescription>
            </Alert>
          ) : dashboard.available === false ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Módulo de emissão não configurado</AlertTitle>
              <AlertDescription>
                {dashboard.message ||
                  "Esta instalação não emite NF-e/NFC-e próprios — apenas importa. Não há rejeições a monitorar."}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total emitido" value={dashboard.totals.total} tone="muted" />
                <StatCard label="Autorizadas" value={dashboard.totals.authorized} tone="ok" />
                <StatCard label="Rejeitadas" value={dashboard.totals.rejected} tone="danger" />
                <StatCard
                  label="% Rejeição"
                  value={`${dashboard.totals.rejection_rate.toFixed(2)}%`}
                  tone={dashboard.totals.rejection_rate > 5 ? "danger" : dashboard.totals.rejection_rate > 2 ? "warning" : "ok"}
                />
              </div>

              {dashboard.totals.rejection_rate > 5 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Taxa de rejeição acima de 5%</AlertTitle>
                  <AlertDescription>
                    Investigue os motivos abaixo. Uma rejeição saudável fica abaixo de 2%.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Principais motivos</h3>
                  {dashboard.top_reasons.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma rejeição no período.</p>
                  ) : (
                    <div className="space-y-2">
                      {dashboard.top_reasons.map((r, i) => (
                        <div key={i} className="flex items-start justify-between gap-3 rounded border p-2 text-xs">
                          <span className="flex-1">{r.reason}</span>
                          <Badge variant="destructive">{r.count}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Empresas com mais rejeições</h3>
                  {dashboard.top_companies.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma empresa com rejeição relevante.</p>
                  ) : (
                    <div className="space-y-2">
                      {dashboard.top_companies.map((c) => (
                        <div key={c.company_id} className="flex items-center justify-between gap-3 rounded border p-2 text-xs">
                          <span className="flex-1 font-medium truncate">{c.company_name}</span>
                          <span className="tabular-nums">{c.rejected}/{c.rejected + c.authorized}</span>
                          <Badge variant={c.rejection_rate > 5 ? "destructive" : "secondary"}>
                            {c.rejection_rate.toFixed(1)}%
                          </Badge>
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
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone: "ok" | "warning" | "danger" | "muted" }) {
  const toneClass = {
    ok: "border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "border-amber-300 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    danger: "border-red-300 bg-red-500/10 text-red-700 dark:text-red-300",
    muted: "border-border bg-muted/30 text-foreground",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-[11px] font-medium opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

export default AdminFiscalMonitor;
