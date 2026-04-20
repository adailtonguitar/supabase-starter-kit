import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowRight, Check, Loader2, ShieldCheck, X } from "lucide-react";
import { PLANS } from "@/hooks/useSubscription";

const REFUND_WINDOW_DAYS = 7;

type Step = "retention" | "reason" | "refund" | "confirm" | "done";

const REASONS: Array<{ value: string; label: string }> = [
  { value: "price_too_high", label: "O preço está alto demais" },
  { value: "low_usage", label: "Não uso o suficiente" },
  { value: "missing_features", label: "Faltam funcionalidades que preciso" },
  { value: "bugs_issues", label: "Problemas técnicos / bugs" },
  { value: "poor_support", label: "Suporte insuficiente" },
  { value: "switched_provider", label: "Mudei para outro sistema" },
  { value: "business_closed", label: "Encerrei meu negócio" },
  { value: "other", label: "Outro motivo" },
];

const DOWNGRADE_MAP: Record<string, string | null> = {
  pro: "business",
  business: "starter",
  starter: null,
  emissor: null,
};

interface SubscriptionData {
  id: string;
  plan_key: string | null;
  status: string;
  subscription_end: string | null;
  created_at: string;
}

interface LastPayment {
  amount: number;
  created_at: string;
  approved_at: string | null;
}

interface SubscriptionCancelWizardProps {
  open: boolean;
  onClose: () => void;
  onCanceled?: () => void;
  /** Função que inicia o checkout de um plano (ex: para downgrade) */
  onDowngrade?: (planKey: string) => Promise<void> | void;
}

export function SubscriptionCancelWizard({
  open,
  onClose,
  onCanceled,
  onDowngrade,
}: SubscriptionCancelWizardProps) {
  const [step, setStep] = useState<Step>("retention");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [lastPayment, setLastPayment] = useState<LastPayment | null>(null);

  const [reason, setReason] = useState<string>("");
  const [reasonDetails, setReasonDetails] = useState("");
  const [requestRefund, setRequestRefund] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("retention");
    setReason("");
    setReasonDetails("");
    setRequestRefund(false);
    loadData();
  }, [open]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sessão expirada. Faça login novamente.");
        onClose();
        return;
      }

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, plan_key, status, subscription_end, created_at")
        .eq("user_id", user.id)
        .in("status", ["active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setSubscription(sub as SubscriptionData | null);

      const { data: pay } = await supabase
        .from("payments")
        .select("amount, created_at, approved_at")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setLastPayment(pay as LastPayment | null);
    } catch (err) {
      console.error("[CancelWizard] Error loading data:", err);
      toast.error("Erro ao carregar dados da assinatura.");
    } finally {
      setLoading(false);
    }
  };

  const daysSincePayment = useMemo(() => {
    if (!lastPayment) return null;
    const paymentDate = new Date(lastPayment.approved_at || lastPayment.created_at);
    return Math.floor((Date.now() - paymentDate.getTime()) / (24 * 60 * 60 * 1000));
  }, [lastPayment]);

  const refundEligible =
    daysSincePayment !== null &&
    daysSincePayment <= REFUND_WINDOW_DAYS &&
    !!lastPayment?.amount;

  const refundAmount = lastPayment?.amount ?? null;

  const currentPlanKey = subscription?.plan_key ?? null;
  const planInfo = currentPlanKey
    ? (PLANS as Record<string, { name: string; price: number } | undefined>)[currentPlanKey]
    : null;
  const downgradeTarget = currentPlanKey ? DOWNGRADE_MAP[currentPlanKey] : null;
  const downgradePlan = downgradeTarget
    ? (PLANS as Record<string, { name: string; price: number } | undefined>)[downgradeTarget]
    : null;

  const handleDowngrade = async () => {
    if (!downgradeTarget || !onDowngrade) return;
    try {
      await onDowngrade(downgradeTarget);
      onClose();
    } catch (err) {
      console.error("[CancelWizard] Downgrade error:", err);
      toast.error("Erro ao iniciar downgrade.");
    }
  };

  const canAdvanceFromReason =
    !!reason && (reason !== "other" || reasonDetails.trim().length >= 5);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-subscription", {
        body: {
          reason,
          reason_details: reasonDetails.trim() || null,
          request_refund: requestRefund,
        },
      });

      if (error) {
        let message = error.message || "Erro ao cancelar assinatura";
        try {
          const ctx = (error as unknown as { context?: { json?: () => Promise<Record<string, unknown>> } }).context;
          if (ctx?.json) {
            const body = await ctx.json();
            if (body?.error) message = String(body.error);
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      if (data?.error) throw new Error(String(data.error));

      setStep("done");
      toast.success("Cancelamento registrado.");
      onCanceled?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao cancelar assinatura";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!subscription) {
      return (
        <div className="py-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Não encontramos uma assinatura ativa para cancelar.
          </p>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      );
    }

    switch (step) {
      case "retention":
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Antes de cancelar, talvez uma dessas opções resolva o que você precisa:
            </p>

            {downgradePlan && downgradeTarget && onDowngrade && (
              <button
                type="button"
                onClick={handleDowngrade}
                className="w-full text-left p-4 border border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <ArrowDown className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-foreground">
                      Mudar para o {downgradePlan.name} (R$ {downgradePlan.price.toFixed(2).replace(".", ",")}/mês)
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Você economiza R$ {(
                        (planInfo?.price ?? 0) - downgradePlan.price
                      ).toFixed(2).replace(".", ",")} por mês e mantém o acesso essencial.
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground self-center" />
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={() => setStep("reason")}
              className="w-full text-left p-4 border border-destructive/30 rounded-xl hover:border-destructive hover:bg-destructive/5 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <X className="w-5 h-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-foreground">Cancelar assinatura mesmo assim</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Você manterá acesso até o fim do período já pago e não será mais cobrado.
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground self-center" />
              </div>
            </button>
          </div>
        );

      case "reason":
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Nos ajude a entender: <span className="font-medium text-foreground">por que você está cancelando?</span>
            </p>

            <RadioGroup value={reason} onValueChange={setReason}>
              <div className="space-y-2">
                {REASONS.map((r) => (
                  <label
                    key={r.value}
                    htmlFor={`reason-${r.value}`}
                    className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/40 cursor-pointer"
                  >
                    <RadioGroupItem id={`reason-${r.value}`} value={r.value} />
                    <span className="text-sm text-foreground">{r.label}</span>
                  </label>
                ))}
              </div>
            </RadioGroup>

            <div className="space-y-2">
              <Label htmlFor="reason-details">
                Detalhes {reason === "other" ? <span className="text-destructive">*</span> : <span className="text-muted-foreground text-xs">(opcional)</span>}
              </Label>
              <Textarea
                id="reason-details"
                value={reasonDetails}
                onChange={(e) => setReasonDetails(e.target.value)}
                placeholder={reason === "other" ? "Conte o motivo com mais detalhes (mínimo 5 caracteres)" : "Algum comentário adicional?"}
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">{reasonDetails.length}/500</p>
            </div>
          </div>
        );

      case "refund":
        return (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border bg-muted/20">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-sm space-y-2">
                  <p className="font-semibold text-foreground">Direito de Arrependimento (CDC art. 49)</p>
                  <p className="text-muted-foreground">
                    Você tem <strong>{REFUND_WINDOW_DAYS} dias</strong> a partir do pagamento para solicitar
                    reembolso integral da sua compra.
                  </p>
                </div>
              </div>
            </div>

            {refundEligible ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-success/10 border border-success/30">
                  <p className="text-sm text-foreground">
                    <strong>Você está dentro do prazo.</strong> Seu último pagamento foi há{" "}
                    {daysSincePayment} {daysSincePayment === 1 ? "dia" : "dias"} e você tem
                    direito ao reembolso integral de{" "}
                    <strong>R$ {refundAmount?.toFixed(2).replace(".", ",")}</strong>.
                  </p>
                </div>

                <RadioGroup
                  value={requestRefund ? "yes" : "no"}
                  onValueChange={(v) => setRequestRefund(v === "yes")}
                >
                  <label
                    htmlFor="refund-yes"
                    className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-muted/40 cursor-pointer"
                  >
                    <RadioGroupItem id="refund-yes" value="yes" className="mt-1" />
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Sim, quero solicitar reembolso de R$ {refundAmount?.toFixed(2).replace(".", ",")}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Processaremos o estorno no Mercado Pago em até 5 dias úteis. O acesso será
                        encerrado imediatamente após o processamento.
                      </p>
                    </div>
                  </label>
                  <label
                    htmlFor="refund-no"
                    className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-muted/40 cursor-pointer"
                  >
                    <RadioGroupItem id="refund-no" value="no" className="mt-1" />
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Não quero reembolso, só cancelar a renovação
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Você mantém acesso até o fim do período pago (
                        {subscription.subscription_end
                          ? new Date(subscription.subscription_end).toLocaleDateString("pt-BR")
                          : "—"}
                        ).
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-muted/30 border border-border">
                <p className="text-sm text-foreground">
                  {daysSincePayment === null ? (
                    <>Não encontramos pagamento recente elegível a reembolso.</>
                  ) : (
                    <>
                      Seu último pagamento foi há <strong>{daysSincePayment} dias</strong>, fora do
                      prazo de arrependimento de {REFUND_WINDOW_DAYS} dias.
                    </>
                  )}
                  {" "}
                  Você pode cancelar a renovação, mas <strong>não haverá reembolso</strong> do
                  período já pago. Você mantém acesso até{" "}
                  <strong>
                    {subscription.subscription_end
                      ? new Date(subscription.subscription_end).toLocaleDateString("pt-BR")
                      : "—"}
                  </strong>
                  .
                </p>
              </div>
            )}
          </div>
        );

      case "confirm":
        return (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-3">
              <p className="font-semibold text-foreground">Confirme o cancelamento</p>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plano</span>
                  <span className="font-medium text-foreground">
                    {planInfo?.name ?? currentPlanKey}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Motivo</span>
                  <span className="font-medium text-foreground">
                    {REASONS.find((r) => r.value === reason)?.label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Acesso até</span>
                  <span className="font-medium text-foreground">
                    {subscription.subscription_end
                      ? new Date(subscription.subscription_end).toLocaleDateString("pt-BR")
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reembolso</span>
                  <span className="font-medium text-foreground">
                    {requestRefund
                      ? `Sim — R$ ${refundAmount?.toFixed(2).replace(".", ",")}`
                      : "Não"}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Ao confirmar, sua assinatura será agendada para cancelamento. Você pode reverter essa
              decisão a qualquer momento antes da data de encerramento clicando em "Reativar assinatura".
            </p>
          </div>
        );

      case "done":
        return (
          <div className="space-y-4 py-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-success/10 flex items-center justify-center">
              <Check className="w-7 h-7 text-success" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">Cancelamento registrado</p>
              <p className="text-sm text-muted-foreground">
                {requestRefund
                  ? "Seu reembolso será processado em até 5 dias úteis."
                  : subscription.subscription_end
                    ? `Você mantém acesso até ${new Date(subscription.subscription_end).toLocaleDateString("pt-BR")}.`
                    : "Você mantém acesso até o fim do período já pago."}
              </p>
            </div>
            <Button onClick={onClose} className="w-full">Fechar</Button>
          </div>
        );
    }
  };

  const stepIndex: Record<Step, number> = {
    retention: 1,
    reason: 2,
    refund: 3,
    confirm: 4,
    done: 5,
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "done" ? "Cancelamento registrado" : "Cancelar assinatura"}
          </DialogTitle>
          {step !== "done" && (
            <DialogDescription>
              Passo {stepIndex[step]} de 4
            </DialogDescription>
          )}
        </DialogHeader>

        {renderStep()}

        {step !== "done" && !loading && subscription && (
          <div className="flex items-center justify-between gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (step === "retention") {
                  onClose();
                } else if (step === "reason") {
                  setStep("retention");
                } else if (step === "refund") {
                  setStep("reason");
                } else if (step === "confirm") {
                  setStep("refund");
                }
              }}
              disabled={submitting}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              {step === "retention" ? "Fechar" : "Voltar"}
            </Button>

            {step === "reason" && (
              <Button
                type="button"
                onClick={() => setStep("refund")}
                disabled={!canAdvanceFromReason}
              >
                Continuar
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}

            {step === "refund" && (
              <Button
                type="button"
                onClick={() => setStep("confirm")}
              >
                Continuar
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}

            {step === "confirm" && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Confirmar cancelamento
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
