import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

interface ServiceStatus {
  service: string;
  status: "ok" | "error" | string;
  latency_ms: number;
}

interface PublicStatus {
  status: "healthy" | "degraded" | "critical" | "unknown" | string;
  updated_at: string | null;
  total_latency_ms?: number;
  failed_services?: string[];
  services?: ServiceStatus[];
}

interface LookupResult {
  found: boolean;
  restricted?: boolean;
  page?: string;
  action?: string;
  created_at?: string;
  error_message?: string;
}

const SERVICE_LABELS: Record<string, string> = {
  database: "Banco de dados",
  auth: "Autenticação",
  storage: "Armazenamento de arquivos",
  "edge:emit-nfce": "Emissão de NFC-e",
  "edge:check-subscription": "Assinatura",
  "edge:create-checkout": "Pagamentos (checkout)",
  "edge:payment-webhook": "Webhook de pagamento",
  "edge:ai-support": "Assistente IA",
  "edge:generate-ai-report": "Relatórios IA",
};

function labelFor(service: string): string {
  return SERVICE_LABELS[service] ?? service;
}

function statusPill(s: string): { label: string; className: string; icon: JSX.Element } {
  if (s === "healthy" || s === "ok") {
    return {
      label: "Operacional",
      className: "bg-green-600 hover:bg-green-600 text-white",
      icon: <CheckCircle2 className="w-4 h-4" />,
    };
  }
  if (s === "degraded") {
    return {
      label: "Degradado",
      className: "bg-amber-500 hover:bg-amber-500 text-white",
      icon: <AlertCircle className="w-4 h-4" />,
    };
  }
  if (s === "critical" || s === "error") {
    return {
      label: "Fora do ar",
      className: "bg-red-600 hover:bg-red-600 text-white",
      icon: <ShieldAlert className="w-4 h-4" />,
    };
  }
  return {
    label: "Sem dados",
    className: "bg-muted text-muted-foreground",
    icon: <Activity className="w-4 h-4" />,
  };
}

function formatDelta(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return iso;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia(s)`;
}

export default function StatusPage() {
  const [data, setData] = useState<PublicStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const { data: res, error } = await supabase.rpc("get_public_system_status");
      if (error) throw error;
      setData(res as unknown as PublicStatus);
    } catch (err) {
      console.warn("[StatusPage] load failed", err);
      setData({ status: "unknown", updated_at: null, services: [] });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLookingUp(true);
    setLookupResult(null);
    try {
      const { data: res, error } = await supabase.rpc("lookup_support_code", {
        p_code: code.trim().toUpperCase(),
      });
      if (error) throw error;
      setLookupResult(res as unknown as LookupResult);
    } catch (err) {
      toast.error("Erro ao consultar: " + (err instanceof Error ? err.message : "?"));
    } finally {
      setLookingUp(false);
    }
  };

  const overall = statusPill(data?.status ?? "unknown");

  return (
    <div className="h-screen overflow-y-auto bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="text-sm inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao site
          </Link>
          <div className="text-sm font-semibold">Antho System · Status</div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold">Status do sistema</h1>
          <p className="text-sm text-muted-foreground">
            Transparência em tempo real sobre a saúde dos serviços do Antho System.
            Atualizamos automaticamente a cada minuto.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Status geral</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Última verificação: {formatDelta(data?.updated_at ?? null)}
              </span>
              <Button variant="ghost" size="sm" onClick={load} disabled={refreshing}>
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <div className="flex items-center gap-3">
                <Badge className={`${overall.className} gap-1.5 px-3 py-1.5 text-sm`}>
                  {overall.icon} {overall.label}
                </Badge>
                {data?.status === "degraded" && data.failed_services && data.failed_services.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    Serviços afetados: {data.failed_services.map(labelFor).join(", ")}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Serviços monitorados</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : !data?.services || data.services.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda não há dados de monitoramento.</p>
            ) : (
              <ul className="divide-y">
                {data.services.map((s) => {
                  const pill = statusPill(s.status);
                  return (
                    <li key={s.service} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-medium text-sm">{labelFor(s.service)}</div>
                        <div className="text-[11px] text-muted-foreground">{s.service}</div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-xs text-muted-foreground">
                          {s.latency_ms}ms
                        </span>
                        <Badge className={`${pill.className} gap-1`}>{pill.icon} {pill.label}</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consultar código de suporte</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se recebeu um código (ex.: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">AS-20260421-7F3A</code>)
              ao encontrar um erro, cole aqui para ver quando aconteceu. Você precisa estar logado para ver detalhes.
            </p>
            <form onSubmit={handleLookup} className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="AS-YYYYMMDD-XXXX"
                className="font-mono uppercase max-w-xs"
                maxLength={32}
              />
              <Button type="submit" disabled={lookingUp || code.trim().length < 6}>
                {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : "Consultar"}
              </Button>
            </form>

            {lookupResult && (
              <div className="text-sm rounded-md bg-muted/50 p-3 space-y-1">
                {!lookupResult.found ? (
                  <div className="text-muted-foreground">Código não encontrado.</div>
                ) : lookupResult.restricted ? (
                  <div className="text-muted-foreground">
                    Código válido, registrado em {lookupResult.created_at && new Date(lookupResult.created_at).toLocaleString("pt-BR")}.
                    Entre com sua conta para ver detalhes.
                  </div>
                ) : (
                  <>
                    <div><strong>Quando:</strong> {lookupResult.created_at && new Date(lookupResult.created_at).toLocaleString("pt-BR")}</div>
                    {lookupResult.page && <div><strong>Página:</strong> {lookupResult.page}</div>}
                    {lookupResult.action && <div><strong>Ação:</strong> {lookupResult.action}</div>}
                    {lookupResult.error_message && (
                      <div className="text-xs font-mono bg-background border rounded px-2 py-1 mt-2 break-all">
                        {lookupResult.error_message}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Problemas? O que fazer?</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              <strong>1.</strong> Verifique aqui se há algum serviço marcado como fora do ar ou degradado.
            </p>
            <p>
              <strong>2.</strong> Se sim, aguarde alguns minutos e recarregue — normalmente nossos alertas
              automáticos já acionaram o time.
            </p>
            <p>
              <strong>3.</strong> Se o erro for só com você, copie o <em>código de suporte</em> exibido
              na tela de erro e envie para{" "}
              <a className="underline" href="mailto:suporte@anthosystem.com.br">suporte@anthosystem.com.br</a>.
            </p>
          </CardContent>
        </Card>

        <footer className="text-[11px] text-muted-foreground text-center py-4">
          Última atualização automática: {formatDelta(data?.updated_at ?? null)} · Dados do uptime monitor interno.
        </footer>
      </main>
    </div>
  );
}
