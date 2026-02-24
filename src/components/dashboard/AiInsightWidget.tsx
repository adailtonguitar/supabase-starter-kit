import { useState, useEffect, useCallback } from "react";
import { Sparkles, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export function AiInsightWidget() {
  const { companyId } = useCompany();
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchInsight = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(false);
    setInsight(null);

    try {
      const result = await supabase.functions.invoke("ai-report", {
        body: { report_type: "quick", company_id: companyId },
      });

      console.log("[AiInsight] response:", JSON.stringify(result?.data));

      if (result?.error) {
        console.error("[AiInsight] fn error:", result.error);
        setError(true);
        return;
      }

      const report = result?.data?.report;
      if (report && typeof report === "string") {
        setInsight(report);
      } else {
        console.warn("[AiInsight] no report in response:", result?.data);
        setError(true);
      }
    } catch (err) {
      console.error("[AiInsight] catch:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      fetchInsight();
    }
  }, [companyId, fetchInsight]);

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
          <AlertCircle className="w-4 h-4 text-warning shrink-0" />
          <div>
            <p>Edge function indisponível. Verifique o deploy no Supabase.</p>
            <button onClick={fetchInsight} className="text-primary text-xs hover:underline mt-1">
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {!loading && !error && insight && (
        <p className="text-sm text-foreground whitespace-pre-wrap">{insight}</p>
      )}

      {!loading && !error && !insight && (
        <p className="text-sm text-muted-foreground">
          {companyId
            ? "Clique em Atualizar para gerar um insight."
            : "Conecte-se para receber insights."}
        </p>
      )}
    </div>
  );
}
