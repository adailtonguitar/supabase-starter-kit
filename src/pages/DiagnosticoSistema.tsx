import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity, CheckCircle2, XCircle, Clock, Play, RotateCcw,
  ShieldCheck, Package, ArrowUpDown, ShoppingCart, DollarSign, BarChart3,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { SystemDiagnosticService, type TestResult, type DiagnosticReport } from "@/services/SystemDiagnosticService";
import { cn } from "@/lib/utils";

const groupIcons: Record<string, any> = {
  "Autenticação": ShieldCheck,
  "Produtos": Package,
  "Estoque": ArrowUpDown,
  "Vendas": ShoppingCart,
  "Financeiro": DollarSign,
  "Relatórios": BarChart3,
};

export default function DiagnosticoSistema() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const [results, setResults] = useState<TestResult[]>([]);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [running, setRunning] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  const runDiagnostics = useCallback(async () => {
    if (!companyId || !user?.id) return;
    setRunning(true);
    setReport(null);
    setResults([]);
    setExpandedErrors(new Set());

    const service = new SystemDiagnosticService(companyId, user.id, (r) => {
      setResults([...r]);
    });

    const finalReport = await service.runAll();
    setReport(finalReport);
    setRunning(false);
  }, [companyId, user?.id]);

  const toggleError = (id: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const total = results.length;
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const runningCount = results.filter((r) => r.status === "running").length;
  const progress = total > 0 ? Math.round(((passed + failed) / total) * 100) : 0;

  // Group results by group name
  const groups = results.reduce<Record<string, TestResult[]>>((acc, r) => {
    if (!acc[r.group]) acc[r.group] = [];
    acc[r.group].push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Diagnóstico do Sistema
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Testa automaticamente todas as funções críticas do Anthosystem
          </p>
        </div>
        <Button
          size="lg"
          onClick={runDiagnostics}
          disabled={running || !companyId}
          className="gap-2"
        >
          {running ? (
            <>
              <RotateCcw className="w-4 h-4 animate-spin" />
              Executando...
            </>
          ) : report ? (
            <>
              <RotateCcw className="w-4 h-4" />
              Executar novamente
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Executar testes
            </>
          )}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold">{total}</div>
            <div className="text-xs text-muted-foreground mt-1">Testes Executados</div>
          </CardContent>
        </Card>
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold text-green-600">{passed}</div>
            <div className="text-xs text-muted-foreground mt-1">Aprovados</div>
          </CardContent>
        </Card>
        <Card className={cn("border-red-500/30", failed > 0 && "bg-red-500/5")}>
          <CardContent className="pt-4 pb-3 text-center">
            <div className={cn("text-3xl font-bold", failed > 0 ? "text-red-600" : "text-muted-foreground")}>{failed}</div>
            <div className="text-xs text-muted-foreground mt-1">Com Erro</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold text-primary">{runningCount}</div>
            <div className="text-xs text-muted-foreground mt-1">Em Execução</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      {running && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progresso</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {/* Status badge */}
      {report && !running && (
        <div className="flex items-center gap-3">
          {report.failed === 0 ? (
            <Badge className="bg-green-600 text-white gap-1 text-sm py-1 px-3">
              <CheckCircle2 className="w-4 h-4" />
              Sistema 100% operacional
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1 text-sm py-1 px-3">
              <XCircle className="w-4 h-4" />
              {report.failed} erro{report.failed > 1 ? "s" : ""} detectado{report.failed > 1 ? "s" : ""}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            Executado em {report.finishedAt ? Math.round((report.finishedAt.getTime() - report.startedAt.getTime()) / 1000) : 0}s
          </span>
        </div>
      )}

      {/* Detailed results */}
      {total > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Resultado Detalhado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
                {Object.entries(groups).map(([groupName, tests]) => {
                  const Icon = groupIcons[groupName] || Activity;
                  const groupPassed = tests.filter((t) => t.status === "pass").length;
                  const groupFailed = tests.filter((t) => t.status === "fail").length;

                  return (
                    <div key={groupName} className="space-y-2">
                      <div className="flex items-center gap-2 pb-1 border-b">
                        <Icon className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-sm">{groupName}</span>
                        <div className="ml-auto flex gap-2">
                          {groupPassed > 0 && (
                            <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                              {groupPassed} ✓
                            </Badge>
                          )}
                          {groupFailed > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {groupFailed} ✗
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 pl-2">
                        {tests.map((test) => (
                          <div key={test.id}>
                            <div
                              className={cn(
                                "flex items-center gap-2 py-1.5 px-2 rounded text-sm",
                                test.status === "fail" && "bg-red-500/5 cursor-pointer hover:bg-red-500/10",
                                test.status === "pass" && "bg-green-500/5"
                              )}
                              onClick={() => test.status === "fail" && toggleError(test.id)}
                            >
                              {test.status === "pass" && (
                                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                              )}
                              {test.status === "fail" && (
                                <>
                                  {expandedErrors.has(test.id) ? (
                                    <ChevronDown className="w-4 h-4 text-red-500 flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-red-500 flex-shrink-0" />
                                  )}
                                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                </>
                              )}
                              {test.status === "running" && (
                                <RotateCcw className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                              )}
                              {test.status === "pending" && (
                                <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              )}

                              <span className={cn(
                                "flex-1",
                                test.status === "fail" && "text-red-700 dark:text-red-400"
                              )}>
                                {test.name}
                              </span>

                              {test.duration !== undefined && (
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {test.duration}ms
                                </span>
                              )}
                            </div>

                            {test.status === "fail" && expandedErrors.has(test.id) && (
                              <div className="ml-8 mt-1 mb-2 p-3 bg-red-500/10 rounded border border-red-500/20">
                                <p className="text-xs font-mono text-red-700 dark:text-red-300 whitespace-pre-wrap break-all">
                                  {test.error}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {total === 0 && !running && (
        <Card>
          <CardContent className="py-16 text-center">
            <Activity className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-1">Nenhum teste executado</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Clique em "Executar testes" para validar se o sistema está funcionando corretamente.
            </p>
            <Button onClick={runDiagnostics} disabled={!companyId} className="gap-2">
              <Play className="w-4 h-4" />
              Iniciar diagnóstico
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
