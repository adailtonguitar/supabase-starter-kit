import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, TrendingUp, Package, Wallet, Sparkles, Loader2, RefreshCw, FileText, ChevronUp, ChevronDown } from "lucide-react";
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
  const [collapsed, setCollapsed] = useState(false);

  const generateReport = async (type: ReportType) => {
    if (!companyId) return;
    setLoading(true);
    setSelectedType(type);
    setReport(null);
    setCollapsed(false);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://fsvxpxziotklbxkivyug.supabase.co";
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdnhweHppb3RrbGJ4a2l2eXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODU5NTMsImV4cCI6MjA4NzM2MTk1M30.8I3ABsRZBZuE1IpK_g9z3PdRUd9Omt_F5qNx0Pgqvyo";

      const resp = await fetch(`${supabaseUrl}/functions/v1/ai-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({ report_type: type, company_id: companyId }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        toast.error(data?.error || `Erro ${resp.status}. Tente novamente.`);
        return;
      }

      if (data?.report) {
        setReport(data.report);
        setGeneratedAt(new Date());
        toast.success("Relatório gerado com sucesso!");
      } else {
        toast.error("Resposta inesperada da edge function.");
      }
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
        <Card className="border-primary/20">
          <CardContent className="py-16 flex flex-col items-center gap-4">
            <div className="relative">
              <Brain className="w-12 h-12 text-primary animate-pulse" />
              <Loader2 className="w-6 h-6 text-primary animate-spin absolute -top-1 -right-1" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">A IA está analisando seus dados...</p>
              <p className="text-xs text-muted-foreground mt-1">Gerando relatório executivo detalhado com base nos últimos 30 dias</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report result */}
      {!loading && report && (
        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Análise Inteligente</CardTitle>
                  <CardDescription className="text-xs">Powered by IA</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCollapsed(!collapsed)}
                  className="p-1.5 rounded-md hover:bg-accent transition-colors"
                >
                  {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => generateReport(selectedType)}
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
              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-li:text-muted-foreground">
                <ReactMarkdown>{report}</ReactMarkdown>
              </div>
            </CardContent>
          )}
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
                Clique em uma das opções acima para gerar um relatório executivo com IA
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
