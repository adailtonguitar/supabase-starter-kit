import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, TrendingUp, Package, Wallet, Sparkles, Loader2, RefreshCw, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";

type ReportType = "general" | "sales" | "stock" | "financial";

const reportOptions: { type: ReportType; label: string; description: string; icon: React.ReactNode }[] = [
  { type: "general", label: "Visão Geral", description: "Análise completa de vendas, estoque e finanças", icon: <Brain className="w-5 h-5" /> },
  { type: "sales", label: "Vendas", description: "Performance de vendas, ticket médio e tendências", icon: <TrendingUp className="w-5 h-5" /> },
  { type: "stock", label: "Estoque", description: "Alertas de ruptura, giro e oportunidades", icon: <Package className="w-5 h-5" /> },
  { type: "financial", label: "Financeiro", description: "Fluxo de caixa, inadimplência e projeções", icon: <Wallet className="w-5 h-5" /> },
];

export default function RelatoriosIA() {
  const { companyId } = useCompany();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<ReportType>("general");
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const generateReport = async (type: ReportType) => {
    if (!companyId) return;
    setLoading(true);
    setSelectedType(type);
    setReport(null);

    try {
      const { data, error } = await supabase.functions.invoke("ai-report", {
        body: { report_type: type, company_id: companyId },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setReport(data.report);
      setGeneratedAt(new Date());
      toast.success("Relatório gerado com sucesso!");
    } catch (err: any) {
      console.error("Report error:", err);
      toast.error("Erro ao gerar relatório. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              Relatórios Inteligentes
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Análises automatizadas com inteligência artificial sobre seu negócio
            </p>
          </div>
          {report && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateReport(selectedType)}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          )}
        </div>

        {/* Report type cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {reportOptions.map((opt) => (
            <button
              key={opt.type}
              onClick={() => generateReport(opt.type)}
              disabled={loading}
              className={`text-left p-4 rounded-xl border transition-all ${
                selectedType === opt.type && report
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-primary/40 hover:bg-accent"
              } ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className={`mb-2 ${selectedType === opt.type && report ? "text-primary" : "text-muted-foreground"}`}>
                {opt.icon}
              </div>
              <p className="text-sm font-semibold text-foreground">{opt.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <Card>
            <CardContent className="py-16 flex flex-col items-center gap-4">
              <div className="relative">
                <Brain className="w-12 h-12 text-primary animate-pulse" />
                <Loader2 className="w-6 h-6 text-primary animate-spin absolute -top-1 -right-1" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Analisando seus dados...</p>
                <p className="text-xs text-muted-foreground mt-1">A IA está processando vendas, estoque e finanças dos últimos 30 dias</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Report result */}
        {!loading && report && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">
                    Relatório {reportOptions.find((o) => o.type === selectedType)?.label}
                  </CardTitle>
                </div>
                {generatedAt && (
                  <CardDescription className="text-xs">
                    Gerado em {generatedAt.toLocaleString("pt-BR")}
                  </CardDescription>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{report}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!loading && !report && (
          <Card>
            <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
              <Brain className="w-12 h-12 text-muted-foreground/30" />
              <div>
                <p className="text-sm font-medium text-foreground">Selecione um tipo de relatório</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Clique em uma das opções acima para gerar um relatório inteligente com IA
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
  );
}