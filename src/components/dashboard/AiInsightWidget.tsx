import { useState, useCallback, useRef } from "react";
import { Sparkles, Loader2, RefreshCw, AlertCircle, BrainCircuit } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";

const COOLDOWN_MS = 30_000;

export function AiInsightWidget() {
  const { companyId } = useCompany();
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
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
        setErrorMsg(error.message || "Erro ao gerar insight.");
        setLoading(false);
        return;
      }

      if (data?.error) {
        setErrorMsg(data.error);
      } else if (data?.report && typeof data.report === "string") {
        setInsight(data.report);
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
    <div className="relative bg-gradient-to-br from-primary/8 via-primary/4 to-transparent rounded-2xl p-5 border border-primary/15 overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-12 translate-x-12" />
      
      <div className="relative flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
            <BrainCircuit className="w-4 h-4 text-primary" />
          </div>
          Insight IA
        </h3>
        {companyId && (
          <button
            onClick={fetchInsight}
            disabled={loading || cooldown}
            title={cooldown ? "Aguarde 30s entre atualizações" : ""}
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 disabled:opacity-50 px-3 py-1.5 rounded-full hover:bg-primary/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          Analisando seus dados...
        </div>
      )}

      {!loading && errorMsg && (
        <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div>
            <p>{errorMsg}</p>
            <button onClick={fetchInsight} className="text-primary text-xs hover:underline mt-1.5 font-medium">
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {!loading && !errorMsg && insight && (
        <div className="text-sm text-foreground prose prose-sm max-w-none">
          <ReactMarkdown>{insight}</ReactMarkdown>
        </div>
      )}

      {!loading && !errorMsg && !insight && (
        <p className="text-sm text-muted-foreground">
          {companyId ? "Clique em Atualizar para gerar um insight." : "Conecte-se para receber insights."}
        </p>
      )}
    </div>
  );
}
