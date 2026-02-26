import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Stethoscope, Loader2, RefreshCw, AlertCircle, Calendar, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(mes: string) {
  const [year, month] = mes.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[Number(month) - 1]} ${year}`;
}

export default function DiagnosticoFinanceiro() {
  const { user } = useAuth();
  const [mesReferencia, setMesReferencia] = useState(getCurrentMonth());
  const [diagnostico, setDiagnostico] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingExistente, setLoadingExistente] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);

  // Load existing diagnosis for the selected month
  const carregarExistente = useCallback(async () => {
    if (!user) return;
    setLoadingExistente(true);
    try {
      const { data, error } = await supabase
        .from("diagnosticos_financeiros" as any)
        .select("conteudo, created_at")
        .eq("user_id", user.id)
        .eq("mes_referencia", mesReferencia)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!error && data && (data as any[]).length > 0) {
        const row = (data as any[])[0];
        setDiagnostico(row.conteudo);
        setGeradoEm(row.created_at);
      } else {
        setDiagnostico(null);
        setGeradoEm(null);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingExistente(false);
    }
  }, [user, mesReferencia]);

  useEffect(() => {
    carregarExistente();
  }, [carregarExistente]);

  const gerarDiagnostico = async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://fsvxpxziotklbxkivyug.supabase.co";
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdnhweHppb3RrbGJ4a2l2eXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODU5NTMsImV4cCI6MjA4NzM2MTk1M30.8I3ABsRZBZuE1IpK_g9z3PdRUd9Omt_F5qNx0Pgqvyo";

      const session = await supabase.auth.getSession();
      const accessToken = session?.data?.session?.access_token || anonKey;

      const resp = await fetch(`${supabaseUrl}/functions/v1/diagnostico-financeiro`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({ mes_referencia: mesReferencia }),
      });

      const data = await resp.json().catch(() => null);

      if (!resp.ok) {
        const msg = data?.error || `Erro ${resp.status}. Verifique os logs da Edge Function.`;
        setErrorMsg(msg);
        return;
      }

      if (data?.diagnostico) {
        setDiagnostico(data.diagnostico);
        setGeradoEm(new Date().toISOString());
        toast.success("Diagnóstico gerado com sucesso!");
      } else {
        setErrorMsg(data?.error || "Resposta inesperada do servidor.");
      }
    } catch (err: any) {
      console.error("[DiagnosticoFinanceiro] Erro:", err);
      setErrorMsg("Falha na conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-primary" />
            Diagnóstico Financeiro
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análise inteligente da saúde financeira do seu negócio
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <input
              type="month"
              value={mesReferencia}
              onChange={(e) => setMesReferencia(e.target.value)}
              className="bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground"
            />
          </div>

          <Button
            onClick={gerarDiagnostico}
            disabled={loading}
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analisando...
              </>
            ) : diagnostico ? (
              <>
                <RefreshCw className="w-4 h-4" />
                Gerar Nova Análise
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Analisar Meu Mês
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Loading */}
      {(loading || loadingExistente) && !diagnostico && (
        <Card className="border-primary/20">
          <CardContent className="py-16 flex flex-col items-center gap-4">
            <div className="relative">
              <Stethoscope className="w-12 h-12 text-primary animate-pulse" />
              <Loader2 className="w-6 h-6 text-primary animate-spin absolute -top-1 -right-1" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {loading ? "Gerando diagnóstico com IA..." : "Carregando diagnóstico existente..."}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {loading && "Analisando receitas, despesas, inadimplência e clientes"}
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
            <Button variant="outline" size="sm" onClick={gerarDiagnostico}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {!loading && !loadingExistente && diagnostico && (
        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Relatório Inteligente — {formatMonth(mesReferencia)}</CardTitle>
                  {geradoEm && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Gerado em {new Date(geradoEm).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 max-h-[60vh] overflow-y-auto">
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-li:text-muted-foreground">
              <ReactMarkdown>{diagnostico}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !loadingExistente && !errorMsg && !diagnostico && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <Stethoscope className="w-12 h-12 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Clique em "Analisar Meu Mês" para receber seu diagnóstico
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                A IA analisará receitas, despesas, lucro e inadimplência de {formatMonth(mesReferencia)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
