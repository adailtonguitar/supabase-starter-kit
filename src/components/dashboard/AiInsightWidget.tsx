import { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";

const COOLDOWN_MS = 30_000; // 30s entre chamadas

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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://fsvxpxziotklbxkivyug.supabase.co";
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdnhweHppb3RrbGJ4a2l2eXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODU5NTMsImV4cCI6MjA4NzM2MTk1M30.8I3ABsRZBZuE1IpK_g9z3PdRUd9Omt_F5qNx0Pgqvyo";

      const resp = await fetch(`${supabaseUrl}/functions/v1/ai-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({ report_type: "quick", company_id: companyId }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error("[AiInsight] HTTP error:", resp.status, text);
        setErrorMsg(`Erro ${resp.status}. Verifique o deploy da edge function.`);
        setLoading(false);
        return;
      }

      const data = await resp.json();
      if (data?.report && typeof data.report === "string") {
        setInsight(data.report);
      } else {
        setErrorMsg("Resposta inesperada da edge function.");
      }
    } catch (err: any) {
      console.error("[AiInsight] error:", err?.message || err);
      setErrorMsg("Falha na conexão com a edge function.");
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
            disabled={loading || cooldown}
            title={cooldown ? "Aguarde 30s entre atualizações" : ""}
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 disabled:opacity-50"
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

      {!loading && errorMsg && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4 text-warning shrink-0" />
          <div>
            <p>{errorMsg}</p>
            <button onClick={fetchInsight} className="text-primary text-xs hover:underline mt-1">
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {!loading && !errorMsg && insight && (
        <p className="text-sm text-foreground whitespace-pre-wrap">{insight}</p>
      )}

      {!loading && !errorMsg && !insight && (
        <p className="text-sm text-muted-foreground">
          {companyId ? "Clique em Atualizar para gerar um insight." : "Conecte-se para receber insights."}
        </p>
      )}
    </div>
  );
}
