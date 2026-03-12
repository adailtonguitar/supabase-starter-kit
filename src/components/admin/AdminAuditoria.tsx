import { useState, useCallback, useRef, useEffect } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Play, Square, CheckCircle, XCircle, AlertTriangle, Clock, Loader2,
  Shield, Activity, Database, Zap, BarChart3, History, Search,
  Server, Lock, HardDrive, ShoppingCart, Package, DollarSign, FileText,
  Trash2, RefreshCw, Bot,
} from "lucide-react";
import { toast } from "sonner";
import {
  AnthoTestEngine,
  TestCase,
  TestExecutionReport,
  SystemHealthStatus,
  IntegrityIssue,
} from "@/services/AnthoTestEngine";

interface ExecutionHistory {
  id: string;
  date: string;
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  duration: number;
  coveragePercent: number;
}

const HISTORY_KEY = "antho_test_history";

function loadHistory(): ExecutionHistory[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch { return []; }
}

function saveHistory(h: ExecutionHistory[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50)));
}

export function AdminAuditoria() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [tests, setTests] = useState<TestCase[]>([]);
  const [report, setReport] = useState<TestExecutionReport | null>(null);
  const [history, setHistory] = useState<ExecutionHistory[]>(loadHistory);
  const [integrityIssues, setIntegrityIssues] = useState<IntegrityIssue[] | null>(null);
  const [auditingIntegrity, setAuditingIntegrity] = useState(false);
  const [filterLayer, setFilterLayer] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const engineRef = useRef<AnthoTestEngine | null>(null);

  const progress = tests.length > 0
    ? Math.round((tests.filter(t => t.status !== "pending" && t.status !== "running").length / tests.length) * 100)
    : 0;

  const runTests = useCallback(async () => {
    if (!companyId || !user) {
      toast.error("Empresa ou usuário não encontrado");
      return;
    }
    setRunning(true);
    setReport(null);
    setTests([]);
    setIntegrityIssues(null);

    const engine = new AnthoTestEngine(companyId, user.id, (t, r) => {
      setTests([...t]);
      if (r) setReport(r as TestExecutionReport);
    });
    engineRef.current = engine;

    try {
      const result = await engine.runAll();
      setReport(result);

      const entry: ExecutionHistory = {
        id: result.id,
        date: result.startedAt,
        totalTests: result.totalTests,
        passed: result.passed,
        failed: result.failed,
        warnings: result.warnings,
        duration: result.duration,
        coveragePercent: result.coveragePercent,
      };
      const newHistory = [entry, ...history].slice(0, 50);
      setHistory(newHistory);
      saveHistory(newHistory);

      if (result.failed === 0) {
        toast.success(`✅ Todos os ${result.passed} testes passaram!`);
      } else {
        toast.error(`${result.failed} testes falharam de ${result.totalTests}`);
      }
    } catch (err: any) {
      toast.error("Erro ao executar testes: " + err.message);
    } finally {
      setRunning(false);
      engineRef.current = null;
    }
  }, [companyId, user, history]);

  const cancelTests = () => {
    engineRef.current?.cancel();
    toast.info("Cancelando testes...");
  };

  const runIntegrityAudit = useCallback(async () => {
    if (!companyId || !user) return;
    setAuditingIntegrity(true);
    try {
      const engine = new AnthoTestEngine(companyId, user.id, () => {});
      const issues = await engine.runIntegrityAudit();
      setIntegrityIssues(issues);
      if (issues.length === 0) toast.success("Nenhuma inconsistência encontrada!");
      else toast.warning(`${issues.length} problema(s) encontrado(s)`);
    } catch (err: any) {
      toast.error("Erro na auditoria: " + err.message);
    } finally {
      setAuditingIntegrity(false);
    }
  }, [companyId, user]);

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
    toast.success("Histórico limpo");
  };

  const filteredTests = tests.filter(t => {
    if (filterLayer !== "all" && t.layer !== filterLayer) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    return true;
  });

  const layerLabels: Record<string, string> = {
    api: "API", database: "Banco de Dados", interface: "Interface", flow: "Fluxo Completo",
  };
  const layerIcons: Record<string, React.ElementType> = {
    api: Server, database: Database, interface: Zap, flow: ShoppingCart,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-bold text-foreground">AnthoTest Engine</h2>
          <p className="text-xs text-muted-foreground">Motor de testes automáticos do sistema</p>
        </div>
      </div>

      <Tabs defaultValue="execute">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="execute" className="text-xs gap-1"><Play className="h-3.5 w-3.5" /> Executar</TabsTrigger>
          <TabsTrigger value="health" className="text-xs gap-1"><Activity className="h-3.5 w-3.5" /> Saúde</TabsTrigger>
          <TabsTrigger value="results" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" /> Resultados</TabsTrigger>
          <TabsTrigger value="integrity" className="text-xs gap-1"><Shield className="h-3.5 w-3.5" /> Integridade</TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1"><History className="h-3.5 w-3.5" /> Histórico</TabsTrigger>
        </TabsList>

        {/* ─── EXECUTE TAB ─── */}
        <TabsContent value="execute">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Execução de Testes Automáticos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              <p className="text-sm text-muted-foreground">
                Executa testes em <strong>4 camadas</strong>: API, Banco de Dados, Interface e Fluxo Completo.
                Dados de teste são criados e <strong>revertidos automaticamente</strong>.
              </p>

              <div className="flex gap-2">
                <Button onClick={runTests} disabled={running} className="gap-2">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {running ? "Executando..." : "Executar Todos os Testes"}
                </Button>
                {running && (
                  <Button variant="destructive" onClick={cancelTests} className="gap-2">
                    <Square className="h-4 w-4" /> Cancelar
                  </Button>
                )}
              </div>

              {tests.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{tests.filter(t => t.status !== "pending" && t.status !== "running").length} de {tests.length} testes</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />

                  {/* Layer progress cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    {(["api", "database", "interface", "flow"] as const).map(layer => {
                      const layerTests = tests.filter(t => t.layer === layer);
                      const done = layerTests.filter(t => t.status === "pass" || t.status === "warn").length;
                      const failed = layerTests.filter(t => t.status === "fail").length;
                      const Icon = layerIcons[layer];
                      return (
                        <div key={layer} className="bg-muted/50 rounded-lg p-3 text-center space-y-1">
                          <Icon className="h-4 w-4 mx-auto text-muted-foreground" />
                          <p className="text-xs font-medium text-foreground">{layerLabels[layer]}</p>
                          <p className="text-lg font-bold font-mono text-foreground">
                            {done}<span className="text-xs text-muted-foreground">/{layerTests.length}</span>
                          </p>
                          {failed > 0 && <Badge variant="destructive" className="text-[10px]">{failed} falha(s)</Badge>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Live test list */}
              {running && tests.length > 0 && (
                <ScrollArea className="h-48 border rounded-lg p-2">
                  <div className="space-y-1">
                    {tests.filter(t => t.status === "running" || t.status === "fail").slice(-15).map(t => (
                      <div key={t.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                        {t.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />}
                        {t.status === "fail" && <XCircle className="h-3 w-3 text-destructive shrink-0" />}
                        <span className="text-muted-foreground">[{layerLabels[t.layer]}]</span>
                        <span className="font-medium text-foreground">{t.group} › {t.name}</span>
                        {t.duration && <span className="text-muted-foreground ml-auto">{t.duration}ms</span>}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {/* Summary */}
              {report && !running && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                  <SummaryCard label="Total" value={report.totalTests} color="text-foreground" bg="bg-muted/50" />
                  <SummaryCard label="Passou" value={report.passed} color="text-success" bg="bg-success/10" icon={<CheckCircle className="h-4 w-4" />} />
                  <SummaryCard label="Falhou" value={report.failed} color="text-destructive" bg="bg-destructive/10" icon={<XCircle className="h-4 w-4" />} />
                  <SummaryCard label="Avisos" value={report.warnings} color="text-warning" bg="bg-warning/10" icon={<AlertTriangle className="h-4 w-4" />} />
                  <SummaryCard label="Cobertura" value={`${report.coveragePercent}%`} color="text-primary" bg="bg-primary/10" icon={<BarChart3 className="h-4 w-4" />} />
                </div>
              )}

              {report && !running && report.failed === 0 && (
                <div className="flex items-center gap-3 p-4 bg-success/10 rounded-xl border border-success/20">
                  <CheckCircle className="h-6 w-6 text-success shrink-0" />
                  <div>
                    <p className="font-semibold text-success">Sistema aprovado para atualização!</p>
                    <p className="text-sm text-muted-foreground">
                      Todos os {report.passed} testes passaram. Tempo: {(report.duration / 1000).toFixed(1)}s
                    </p>
                  </div>
                </div>
              )}

              {report && !running && report.failed > 0 && (
                <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl border border-destructive/20">
                  <XCircle className="h-6 w-6 text-destructive shrink-0" />
                  <div>
                    <p className="font-semibold text-destructive">⚠️ Atualização bloqueada</p>
                    <p className="text-sm text-muted-foreground">
                      {report.failed} teste(s) crítico(s) falharam. Verifique os resultados antes de atualizar.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── HEALTH TAB ─── */}
        <TabsContent value="health">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Saúde do Sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {!report ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Execute os testes para ver a saúde do sistema</p>
                  <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={runTests} disabled={running}>
                    <Play className="h-3.5 w-3.5" /> Executar Testes
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <HealthCard label="Autenticação" icon={Lock} status={report.systemHealth.auth} />
                    <HealthCard label="Banco de Dados" icon={Database} status={report.systemHealth.database} />
                    <HealthCard label="Storage" icon={HardDrive} status={report.systemHealth.storage} />
                    <HealthCard label="Edge Functions" icon={Server} status={report.systemHealth.edgeFunctions} />
                    <HealthCard label="Vendas" icon={ShoppingCart} status={report.systemHealth.sales} />
                    <HealthCard label="Estoque" icon={Package} status={report.systemHealth.stock} />
                    <HealthCard label="Financeiro" icon={DollarSign} status={report.systemHealth.financial} />
                    <HealthCard label="Relatórios" icon={FileText} status={report.systemHealth.reports} />
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm">
                    <Badge variant="outline" className="font-mono">Cobertura: {report.coveragePercent}%</Badge>
                    <Badge variant="outline" className="font-mono">Tempo: {(report.duration / 1000).toFixed(1)}s</Badge>
                    <Badge variant="outline" className="font-mono">Falhas: {report.failed}</Badge>
                    <Badge variant="outline" className="font-mono">
                      {new Date(report.startedAt).toLocaleString("pt-BR")}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── RESULTS TAB ─── */}
        <TabsContent value="results">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Relatório de Testes ({filteredTests.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              {tests.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum teste executado ainda</p>
              ) : (
                <>
                  {/* Filters */}
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="text-xs border rounded px-2 py-1 bg-background text-foreground"
                      value={filterLayer}
                      onChange={e => setFilterLayer(e.target.value)}
                    >
                      <option value="all">Todas as camadas</option>
                      <option value="api">API</option>
                      <option value="database">Banco de Dados</option>
                      <option value="interface">Interface</option>
                      <option value="flow">Fluxo Completo</option>
                    </select>
                    <select
                      className="text-xs border rounded px-2 py-1 bg-background text-foreground"
                      value={filterStatus}
                      onChange={e => setFilterStatus(e.target.value)}
                    >
                      <option value="all">Todos status</option>
                      <option value="pass">✔ Passou</option>
                      <option value="fail">✖ Falhou</option>
                      <option value="warn">⚠ Aviso</option>
                    </select>
                  </div>

                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-8">Status</TableHead>
                          <TableHead className="text-xs">Camada</TableHead>
                          <TableHead className="text-xs">Grupo</TableHead>
                          <TableHead className="text-xs">Teste</TableHead>
                          <TableHead className="text-xs text-right">Tempo</TableHead>
                          <TableHead className="text-xs">Detalhes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTests.map(t => (
                          <TableRow key={t.id} className={t.status === "fail" ? "bg-destructive/5" : t.status === "warn" ? "bg-warning/5" : ""}>
                            <TableCell className="p-2">
                              <StatusIcon status={t.status} />
                            </TableCell>
                            <TableCell className="text-xs p-2">
                              <Badge variant="outline" className="text-[10px]">{layerLabels[t.layer]}</Badge>
                            </TableCell>
                            <TableCell className="text-xs p-2 font-medium">{t.group}</TableCell>
                            <TableCell className="text-xs p-2">{t.name}</TableCell>
                            <TableCell className="text-xs p-2 text-right font-mono">{t.duration ? `${t.duration}ms` : "—"}</TableCell>
                            <TableCell className="text-xs p-2 text-muted-foreground max-w-[200px] truncate">
                              {t.error || t.warning || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── INTEGRITY TAB ─── */}
        <TabsContent value="integrity">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Auditoria de Integridade
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              <p className="text-sm text-muted-foreground">
                Verifica inconsistências de estoque, vendas sem pagamento, dados corrompidos e registros órfãos.
              </p>
              <Button onClick={runIntegrityAudit} disabled={auditingIntegrity} className="gap-2">
                {auditingIntegrity ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {auditingIntegrity ? "Auditando..." : "Executar Auditoria"}
              </Button>

              {integrityIssues !== null && (
                integrityIssues.length === 0 ? (
                  <div className="flex items-center gap-3 p-4 bg-success/10 rounded-xl border border-success/20">
                    <CheckCircle className="h-6 w-6 text-success" />
                    <div>
                      <p className="font-semibold text-success">Nenhuma inconsistência encontrada</p>
                      <p className="text-sm text-muted-foreground">Todos os dados estão íntegros</p>
                    </div>
                  </div>
                ) : (
                  <ScrollArea className="h-64 border rounded-lg p-3">
                    <div className="space-y-2">
                      {integrityIssues.map((issue, i) => (
                        <div key={i} className={`flex items-start gap-2 text-xs p-2.5 rounded ${
                          issue.severity === "critical" ? "bg-destructive/10" : issue.severity === "warning" ? "bg-warning/10" : "bg-muted/50"
                        }`}>
                          {issue.severity === "critical" && <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                          {issue.severity === "warning" && <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />}
                          {issue.severity === "info" && <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                          <div>
                            <span className="font-medium text-foreground">[{issue.module}]</span>
                            <span className="ml-1 text-foreground">{issue.description}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── HISTORY TAB ─── */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  Histórico de Execuções ({history.length})
                </span>
                {history.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearHistory} className="gap-1 text-xs text-muted-foreground">
                    <Trash2 className="h-3.5 w-3.5" /> Limpar
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma execução registrada</p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs text-center">Testes</TableHead>
                        <TableHead className="text-xs text-center">✔</TableHead>
                        <TableHead className="text-xs text-center">✖</TableHead>
                        <TableHead className="text-xs text-center">⚠</TableHead>
                        <TableHead className="text-xs text-center">Cobertura</TableHead>
                        <TableHead className="text-xs text-right">Duração</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map(h => (
                        <TableRow key={h.id}>
                          <TableCell className="text-xs p-2">
                            {new Date(h.date).toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-xs p-2 text-center font-mono">{h.totalTests}</TableCell>
                          <TableCell className="text-xs p-2 text-center font-mono text-success">{h.passed}</TableCell>
                          <TableCell className="text-xs p-2 text-center font-mono text-destructive">{h.failed}</TableCell>
                          <TableCell className="text-xs p-2 text-center font-mono text-warning">{h.warnings}</TableCell>
                          <TableCell className="text-xs p-2 text-center">
                            <Badge variant={h.coveragePercent >= 90 ? "default" : "destructive"} className="text-[10px]">
                              {h.coveragePercent}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs p-2 text-right font-mono">
                            {(h.duration / 1000).toFixed(1)}s
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── SUB-COMPONENTS ───

function SummaryCard({ label, value, color, bg, icon }: { label: string; value: string | number; color: string; bg: string; icon?: React.ReactNode }) {
  return (
    <div className={`${bg} rounded-lg p-3 text-center`}>
      {icon && <div className={`${color} flex justify-center mb-1`}>{icon}</div>}
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function HealthCard({ label, icon: Icon, status }: { label: string; icon: React.ElementType; status: "ok" | "fail" | "unknown" }) {
  const styles = {
    ok: "bg-success/10 border-success/20",
    fail: "bg-destructive/10 border-destructive/20",
    unknown: "bg-muted/50 border-muted",
  };
  const statusLabels = { ok: "✔ OK", fail: "✖ Falha", unknown: "?" };
  const statusColors = { ok: "text-success", fail: "text-destructive", unknown: "text-muted-foreground" };

  return (
    <div className={`flex items-center gap-2.5 p-3 rounded-lg border ${styles[status]}`}>
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{label}</p>
        <p className={`text-xs font-bold ${statusColors[status]}`}>{statusLabels[status]}</p>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: TestCase["status"] }) {
  switch (status) {
    case "pass": return <CheckCircle className="h-3.5 w-3.5 text-success" />;
    case "fail": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    case "warn": return <AlertTriangle className="h-3.5 w-3.5 text-warning" />;
    case "running": return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
    case "skipped": return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}
