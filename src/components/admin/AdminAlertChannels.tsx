import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Radio,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  MinusCircle,
  MessageSquare,
  Hash,
  Bot,
} from "lucide-react";

type ChannelStatus = "ok" | "skipped" | "error";

interface TestResult {
  success: boolean;
  configured: {
    discord: boolean;
    slack: boolean;
    telegram: boolean;
  };
  result: {
    discord: ChannelStatus;
    slack: ChannelStatus;
    telegram: ChannelStatus;
    errors: string[];
  };
}

const channelMeta = {
  discord: { label: "Discord", icon: Hash, envKey: "ALERT_DISCORD_WEBHOOK_URL" },
  slack: { label: "Slack", icon: MessageSquare, envKey: "ALERT_SLACK_WEBHOOK_URL" },
  telegram: { label: "Telegram", icon: Bot, envKey: "ALERT_TELEGRAM_BOT_TOKEN + ALERT_TELEGRAM_CHAT_ID" },
} as const;

type ChannelKey = keyof typeof channelMeta;

function StatusBadge({ status, configured }: { status: ChannelStatus; configured: boolean }) {
  if (!configured) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <MinusCircle className="w-3 h-3" /> Não configurado
      </Badge>
    );
  }
  if (status === "ok") {
    return (
      <Badge variant="outline" className="gap-1 border-green-500 text-green-600 dark:text-green-400">
        <CheckCircle2 className="w-3 h-3" /> Entregue
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive text-destructive">
        <XCircle className="w-3 h-3" /> Falhou
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <MinusCircle className="w-3 h-3" /> Pulado
    </Badge>
  );
}

export function AdminAlertChannels() {
  const [sending, setSending] = useState(false);
  const [severity, setSeverity] = useState<"info" | "warning" | "critical">("warning");
  const [message, setMessage] = useState("");
  const [lastResult, setLastResult] = useState<TestResult | null>(null);

  const handleTest = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-action", {
        body: {
          action: "test_alert_channels",
          severity,
          message: message.trim() || undefined,
        },
      });

      if (error) throw error;
      if (!data) throw new Error("Resposta vazia");

      const result = data as TestResult;
      setLastResult(result);

      const delivered = (["discord", "slack", "telegram"] as ChannelKey[])
        .filter((k) => result.result[k] === "ok").length;
      const configured = (["discord", "slack", "telegram"] as ChannelKey[])
        .filter((k) => result.configured[k]).length;

      if (configured === 0) {
        toast.warning("Nenhum canal externo configurado. Defina as variáveis de ambiente no Supabase.");
      } else if (delivered === 0) {
        toast.error("Nenhum canal entregou a mensagem. Veja os detalhes abaixo.");
      } else if (delivered < configured) {
        toast.warning(`${delivered} de ${configured} canais entregaram.`);
      } else {
        toast.success(`Teste enviado com sucesso para ${delivered} canal(is)!`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error("Erro ao testar: " + msg);
    } finally {
      setSending(false);
    }
  };

  const channels: ChannelKey[] = ["discord", "slack", "telegram"];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Radio className="h-4 w-4 text-primary" />
            Canais de Alerta Externo
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-4">
          <Alert>
            <AlertTitle>Como funciona</AlertTitle>
            <AlertDescription className="text-sm space-y-2">
              <p>
                Erros críticos são enviados automaticamente para os canais configurados via{" "}
                <code>notify-critical-errors</code>. Use este painel para disparar um alerta de
                teste e confirmar que cada canal está recebendo.
              </p>
              <p className="text-muted-foreground">
                Canais não configurados são silenciosamente pulados — nunca derrubam o sistema.
                Configure as chaves em <strong>Supabase → Project Settings → Edge Functions → Secrets</strong>.
              </p>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Severidade do teste</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">ℹ️ Info</SelectItem>
                  <SelectItem value="warning">⚠️ Warning</SelectItem>
                  <SelectItem value="critical">🚨 Critical</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Se estiver abaixo de <code>ALERT_MIN_SEVERITY</code>, o alerta é filtrado.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mensagem personalizada (opcional)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Deixe em branco para usar uma mensagem padrão de teste."
              maxLength={500}
              rows={3}
            />
          </div>

          <Button onClick={handleTest} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Disparar alerta de teste
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Status dos canais</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <div className="space-y-3">
            {channels.map((key) => {
              const meta = channelMeta[key];
              const Icon = meta.icon;
              const configured = lastResult?.configured[key] ?? false;
              const status = lastResult?.result[key] ?? "skipped";
              return (
                <div
                  key={key}
                  className="flex items-start sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border flex-col sm:flex-row"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-md bg-background shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{meta.label}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        env: <code>{meta.envKey}</code>
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={status} configured={configured} />
                </div>
              );
            })}
          </div>

          {lastResult?.result.errors && lastResult.result.errors.length > 0 && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Erros na última tentativa</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside text-xs space-y-1 mt-2">
                  {lastResult.result.errors.map((e, i) => (
                    <li key={i} className="break-all">
                      {e}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {!lastResult && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Clique em "Disparar alerta de teste" para ver o status dos canais.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
