import { useState, useEffect } from "react";
import { Sparkles, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import ReactMarkdown from "react-markdown";

export function AiInsightWidget() {
  const { companyId } = useCompany();
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchInsight = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(false);

    try {
      const result = await supabase.functions.invoke("ai-report", {
        body: { report_type: "quick", company_id: companyId },
      });

      console.log("AI insight result:", JSON.stringify(result));

      if (result.error) {
        console.error("AI insight fn error:", result.error);
        setError(true);
        return;
      }

      const data = result.data;
      if (!data || data.error) {
        console.error("AI insight data error:", data?.error);
        setError(true);
        return;
      }

      setInsight(data.report || "Sem dados disponíveis.");
    } catch (err: any) {
      console.error("AI insight catch error:", err?.message || err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) fetchInsight();
  }, [companyId]);

  return (
    <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-5 border border-primary/20">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Insight IA
        </h3>
        {companyId && (
          <button
            onClick={fetchInsight}
            disabled={loading}
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          Analisando seus dados...
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <div>
            <p>Não foi possível gerar o insight.</p>
            <button onClick={fetchInsight} className="text-primary text-xs hover:underline mt-1">
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {!loading && !error && insight && (
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
          <ReactMarkdown>{insight}</ReactMarkdown>
        </div>
      )}

      {!loading && !error && !insight && (
        <p className="text-sm text-muted-foreground">
          {companyId
            ? "Clique em Atualizar para gerar um insight sobre seu negócio."
            : "Conecte-se para receber insights personalizados."}
        </p>
      )}
    </div>
  );
}
