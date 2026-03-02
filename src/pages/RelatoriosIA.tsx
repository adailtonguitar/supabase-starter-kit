import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { BrainCircuit, Sparkles, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";

const COOLDOWN_MS = 30_000;

export default function RelatoriosIA() {
  const { companyId } = useCompany();
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const lastCallRef = useRef(0);

  const fetchInsight = useCallback(async () => {
    if (!companyId) return;

    const now = Date.now();
    if (now - lastCallRef.current < COOLDOWN_MS) {
      setCooldown(true);
      setTimeout(() => setCooldown(false), COOLDOWN_MS - (now - lastCallRef.current));
      return;
    }
    lastCallRef.current = now;

    setLoading(true);
    setErrorMsg(null);
    setInsight(null);

    try {
      const { data, error } = await supabase.functions.invoke("ai-report", {
        body: { report_type: "quick", company_id: companyId },
      });

      if (error) {
        setErrorMsg(error.message || "Erro ao gerar análise.");
        setLoading(false);
        return;
      }

      if (data?.error) {
        setErrorMsg(data.error);
      } else if (data?.report && typeof data.report === "string") {
        setInsight(data.report);
        setGeneratedAt(new Date());
      } else {
        setErrorMsg("Resposta inesperada do servidor.");
      }
    } catch {
      setErrorMsg("Falha na conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Análise Inteligente
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Insights gerados por IA com base nos dados reais do seu negócio
          </p>
        </div>
        <Button
          onClick={fetchInsight}
          disabled={loading || cooldown || !companyId}
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analisando...
            </>
          ) : (
            <>
              <BrainCircuit className="w-4 h-4" />
              {insight ? "Atualizar Análise" : "Gerar Análise"}
            </>
          )}
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <Card className="border-primary/20">
          <CardContent className="py-16 flex flex-col items-center gap-4">
            <div className="relative">
              <BrainCircuit className="w-12 h-12 text-primary animate-pulse" />
              <Loader2 className="w-6 h-6 text-primary animate-spin absolute -top-1 -right-1" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                A IA está analisando seus dados...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Vendas, produtos, estoque e financeiro sendo processados
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
            <Button variant="outline" size="sm" onClick={fetchInsight}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {!loading && !errorMsg && insight && (
        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Insight do Negócio</CardTitle>
                  {generatedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Gerado em {generatedAt.toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchInsight}
                disabled={loading || cooldown}
                className="text-muted-foreground hover:text-primary"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" />
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-li:text-muted-foreground">
              <ReactMarkdown>{insight}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !errorMsg && !insight && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <BrainCircuit className="w-12 h-12 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Clique em "Gerar Análise" para receber insights da IA
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                A IA analisará vendas, estoque, produtos e finanças do seu negócio
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {cooldown && (
        <p className="text-xs text-muted-foreground text-center">
          Aguarde 30 segundos entre atualizações.
        </p>
      )}
    </div>
  );
}
