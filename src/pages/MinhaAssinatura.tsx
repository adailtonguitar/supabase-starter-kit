import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription, PLANS } from "@/hooks/useSubscription";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CreditCard,
  History,
  Loader2,
  Receipt,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SubscriptionCancelWizard } from "@/components/subscription/SubscriptionCancelWizard";

interface DunningState {
  has_subscription: boolean;
  subscription_id?: string;
  company_id?: string | null;
  plan_key?: string;
  status?: string;
  subscription_end?: string;
  grace_stage?: "warning" | "readonly" | "blocked" | null;
  days_until_due?: number | null;
  days_overdue?: number | null;
  payment_failed_at?: string | null;
  payment_retry_count?: number;
  next_retry_at?: string | null;
  last_payment_error?: string | null;
  last_payment?: {
    mp_payment_id: string | null;
    amount: number | null;
    status: string | null;
    created_at: string | null;
    plan_key: string | null;
  } | null;
  recent_events?: Array<{
    event_type: string;
    previous_stage: string | null;
    new_stage: string | null;
    meta: Record<string, unknown>;
    created_at: string;
  }>;
}

const EVENT_LABELS: Record<string, string> = {
  stage_changed: "Mudança de estágio",
  reminder_sent_pre_due: "Lembrete (antes do vencimento)",
  reminder_sent_warning: "Aviso (até 3 dias vencido)",
  reminder_sent_readonly: "Aviso (somente-leitura)",
  reminder_sent_blocked: "Aviso (bloqueado)",
  payment_failed: "Pagamento recusado",
  retry_scheduled: "Nova tentativa agendada",
  retry_ok: "Tentativa bem-sucedida",
  manual_note: "Nota manual",
};

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), withTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}

export default function MinhaAssinatura() {
  const { user, loading: authLoading } = useAuth();
  const { companyId } = useCompany();
  const { createCheckout } = useSubscription();
  const [state, setState] = useState<DunningState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.rpc("get_subscription_dunning_state", {
        p_company_id: companyId ?? null,
      });
      if (error) throw error;
      setState(data as unknown as DunningState);
    } catch (err) {
      toast.error("Erro ao carregar assinatura: " + (err instanceof Error ? err.message : "?"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, companyId]);

  const plan = useMemo(() => {
    if (!state?.plan_key) return null;
    return PLANS[state.plan_key as keyof typeof PLANS] ?? null;
  }, [state?.plan_key]);

  const handleRenew = async () => {
    if (!state?.plan_key) {
      toast.error("Plano não identificado.");
      return;
    }
    setRenewing(true);
    try {
      await createCheckout(state.plan_key);
    } catch (err) {
      toast.error("Erro ao abrir checkout: " + (err instanceof Error ? err.message : "?"));
    } finally {
      setRenewing(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Faça login para ver sua assinatura.</p>
      </div>
    );
  }

  if (!state?.has_subscription) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <Link to="/dashboard" className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-4 hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </Link>
          <Card>
            <CardHeader>
              <CardTitle>Sua assinatura</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Você ainda não tem uma assinatura ativa. Escolha um plano para liberar todos os recursos.
              </p>
              <Button asChild>
                <Link to="/renovar">Escolher plano</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const stage = state.grace_stage ?? null;
  const daysUntil = state.days_until_due ?? null;
  const daysOverdue = state.days_overdue ?? null;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <Link to="/dashboard" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold">Minha assinatura</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o status da sua assinatura, próximos vencimentos e histórico de pagamentos.
          </p>
        </div>

        {stage === "warning" && (
          <Alert className="border-amber-400/60 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-300">Pagamento em atraso</AlertTitle>
            <AlertDescription className="text-sm">
              Sua assinatura venceu há {daysOverdue} dia(s). Você ainda tem acesso total, mas em{" "}
              <strong>{Math.max(0, 4 - (daysOverdue ?? 0))} dia(s)</strong> o sistema entrará em modo somente-leitura.
            </AlertDescription>
          </Alert>
        )}

        {stage === "readonly" && (
          <Alert className="border-orange-500/60 bg-orange-50 dark:bg-orange-950/20">
            <ShieldAlert className="h-4 w-4 text-orange-600" />
            <AlertTitle className="text-orange-800 dark:text-orange-300">Modo somente-leitura</AlertTitle>
            <AlertDescription className="text-sm">
              Plano vencido há {daysOverdue} dia(s). Seus dados estão preservados e acessíveis, mas
              emissão de NF-e, fechamento de caixa e cadastros estão suspensos. Em{" "}
              <strong>{Math.max(0, 15 - (daysOverdue ?? 0))} dia(s)</strong> o acesso será totalmente bloqueado.
            </AlertDescription>
          </Alert>
        )}

        {stage === "blocked" && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Conta bloqueada</AlertTitle>
            <AlertDescription className="text-sm">
              Sua assinatura está vencida há {daysOverdue} dias e o acesso foi suspenso. Renove abaixo
              para reativar imediatamente — nenhum dado foi perdido.
            </AlertDescription>
          </Alert>
        )}

        {stage === null && daysUntil != null && daysUntil <= 7 && daysUntil >= 0 && (
          <Alert className="border-blue-400/60 bg-blue-50 dark:bg-blue-950/20">
            <Calendar className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800 dark:text-blue-300">Renovação próxima</AlertTitle>
            <AlertDescription className="text-sm">
              Seu plano vence em {daysUntil} dia(s) ({formatDate(state.subscription_end)}).
              Renove antes para evitar qualquer interrupção.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CreditCard className="w-4 h-4" /> Plano atual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Plano</div>
                <div className="font-semibold capitalize">
                  {plan?.name ?? state.plan_key}
                  {plan && (
                    <span className="ml-2 text-muted-foreground font-normal">
                      ({formatCurrency(plan.price)}/mês)
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <div>
                  {stage === null && state.status === "active" ? (
                    <Badge className="bg-green-600 hover:bg-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Ativa
                    </Badge>
                  ) : stage === "warning" ? (
                    <Badge className="bg-amber-500 hover:bg-amber-500">Atrasada</Badge>
                  ) : stage === "readonly" ? (
                    <Badge className="bg-orange-600 hover:bg-orange-600">Somente-leitura</Badge>
                  ) : stage === "blocked" ? (
                    <Badge variant="destructive">Bloqueada</Badge>
                  ) : state.status === "canceled" ? (
                    <Badge variant="secondary">Cancelada</Badge>
                  ) : (
                    <Badge variant="outline">{state.status}</Badge>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Próximo vencimento</div>
                <div className="font-medium">{formatDate(state.subscription_end)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {daysOverdue && daysOverdue > 0 ? "Dias em atraso" : "Dias restantes"}
                </div>
                <div className="font-medium">
                  {daysOverdue && daysOverdue > 0 ? `${daysOverdue} dia(s)` : daysUntil != null ? `${daysUntil} dia(s)` : "—"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button
                onClick={handleRenew}
                disabled={renewing}
                className="gap-2"
                variant={stage ? "default" : "secondary"}
              >
                {renewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                {stage ? "Renovar agora" : "Renovar / Trocar plano"}
              </Button>
              {state.status !== "canceled" && stage !== "blocked" && (
                <Button variant="outline" onClick={() => setCancelOpen(true)}>
                  Cancelar assinatura
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {state.last_payment && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Receipt className="w-4 h-4" /> Último pagamento
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor</span>
                <span className="font-medium">{formatCurrency(state.last_payment.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Data</span>
                <span>{formatDate(state.last_payment.created_at, true)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={state.last_payment.status === "approved" ? "default" : "outline"}>
                  {state.last_payment.status ?? "—"}
                </Badge>
              </div>
              {state.last_payment.mp_payment_id && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID Mercado Pago</span>
                  <code className="text-[11px]">{state.last_payment.mp_payment_id}</code>
                </div>
              )}
              {state.last_payment_error && (
                <div className="text-xs text-destructive pt-1">
                  Último erro: {state.last_payment_error}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {state.recent_events && state.recent_events.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <History className="w-4 h-4" /> Histórico de cobrança
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {state.recent_events.map((ev, i) => (
                  <li key={i} className="flex items-start gap-3 border-l-2 border-muted pl-3 py-1">
                    <div className="text-[11px] text-muted-foreground w-20 shrink-0">
                      {formatDate(ev.created_at, true)}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-xs">
                        {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                      </div>
                      {ev.previous_stage !== ev.new_stage && (
                        <div className="text-[11px] text-muted-foreground">
                          {ev.previous_stage ?? "—"} → {ev.new_stage ?? "—"}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        <p className="text-[11px] text-muted-foreground text-center pt-2">
          Pagamentos processados via Mercado Pago. Dúvidas? suporte@anthosystem.com.br
        </p>
      </div>

      {cancelOpen && (
        <SubscriptionCancelWizard
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          onCanceled={() => {
            setCancelOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
