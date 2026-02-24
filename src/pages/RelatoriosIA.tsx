import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/hooks/useCompany";
import { generateAIReport, type AIReportResult } from "@/services/aiReportService";
import { toast } from "sonner";
import { Brain, Sparkles, Loader2, RefreshCw, ChevronUp, ChevronDown, Calendar, FileText, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { format, subDays, startOfMonth } from "date-fns";

export default function RelatoriosIA() {
  const { companyId } = useCompany();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIReportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Default: first of current month to today
  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);

  const handleGenerate = async () => {
    if (!companyId) {
      toast.error("Empresa não identificada. Faça login novamente.");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Selecione o período de análise.");
      return;
    }
    if (startDate > endDate) {
      toast.error("Data inicial não pode ser maior que a final.");
      return;
    }

    setLoading(true);
    setResult(null);
    setErrorMsg(null);
    setCollapsed(false);

    try {
      const data = await generateAIReport(companyId, startDate, endDate);
      setResult(data);
      setGeneratedAt(new Date());
      toast.success("Relatório gerado com sucesso!");
    } catch (err: any) {
      console.error("[RelatoriosIA] Error:", err?.message || err);
      setErrorMsg(err?.message || "Erro ao gerar relatório.");
      toast.error(err?.message || "Erro ao gerar relatório.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          Relatórios Inteligentes
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Análises com IA baseadas em dados reais do seu negócio
        </p>
      </div>

      {/* Date range + Generate button */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-end gap-4">
            <div className="flex-1 w-full">
              <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                Período de análise
              </label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex-1"
                />
                <span className="self-center text-muted-foreground text-sm">até</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={loading || !companyId}
              className="w-full sm:w-auto"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4" />
                  Gerar Relatório IA
                </>
              )}
            </Button>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => {
                setStartDate(format(subDays(new Date(), 7), "yyyy-MM-dd"));
                setEndDate(today);
              }}
              className="text-xs text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
            >
              Últimos 7 dias
            </button>
            <button
              type="button"
              onClick={() => {
                setStartDate(format(subDays(new Date(), 30), "yyyy-MM-dd"));
                setEndDate(today);
              }}
              className="text-xs text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
            >
              Últimos 30 dias
            </button>
            <button
              type="button"
              onClick={() => {
                setStartDate(monthStart);
                setEndDate(today);
              }}
              className="text-xs text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
            >
              Mês atual
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <Card className="border-primary/20">
          <CardContent className="py-16 flex flex-col items-center gap-4">
            <div className="relative">
              <Brain className="w-12 h-12 text-primary animate-pulse" />
              <Loader2 className="w-6 h-6 text-primary animate-spin absolute -top-1 -right-1" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                A IA está analisando seus dados reais...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Buscando vendas, produtos, clientes e financeiro de {startDate} a {endDate}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {!loading && errorMsg && (
        <Card className="border-destructive/30">
          <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-10 h-10 text-destructive" />
            <p className="text-sm font-medium text-foreground">{errorMsg}</p>
            <Button variant="outline" size="sm" onClick={handleGenerate}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Report result */}
      {!loading && !errorMsg && result && (
        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Relatório Executivo</CardTitle>
                  <CardDescription className="text-xs">
                    {result.source === "gemini" ? "Powered by Gemini AI" : "Gerado por IA"} •{" "}
                    {result.data_summary?.period}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {result.data_summary && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {result.data_summary.sales_count} vendas · {result.data_summary.products_count} produtos · {result.data_summary.clients_count} clientes
                  </span>
                )}
                <button
                  onClick={() => setCollapsed(!collapsed)}
                  className="p-1.5 rounded-md hover:bg-accent transition-colors"
                >
                  {collapsed ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={loading}
                  className="text-muted-foreground hover:text-primary"
                >
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Atualizar
                </Button>
              </div>
            </div>
            {generatedAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Gerado em {generatedAt.toLocaleString("pt-BR")}
              </p>
            )}
          </CardHeader>
          {!collapsed && (
            <CardContent className="pt-6">
              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-li:text-muted-foreground prose-table:text-sm">
                <ReactMarkdown>{result.report}</ReactMarkdown>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Empty state */}
      {!loading && !errorMsg && !result && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <Brain className="w-12 h-12 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Selecione o período e clique em "Gerar Relatório IA"
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                A IA analisará dados reais de vendas, estoque, clientes e finanças
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
