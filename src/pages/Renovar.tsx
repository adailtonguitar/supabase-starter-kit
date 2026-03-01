import { useState } from "react";
import { motion } from "framer-motion";
import { CreditCard, Clock, Shield, CheckCircle, ArrowRight, Loader2, Zap, ArrowLeft, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS, useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Navigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Renovar() {
  const { user, signOut } = useAuth();
  const {
    subscribed, planKey, subscriptionEnd,
    trialActive, trialDaysLeft, wasSubscriber,
    gracePeriodActive, graceDaysLeft, subscriptionOverdue,
    loading: subLoading,
  } = useSubscription();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  if (!user) return <Navigate to="/auth" replace />;
  if (!subLoading && subscribed) return <Navigate to="/dashboard" replace />;

  const currentPlanKey = planKey || "starter";
  const currentPlan = PLANS[currentPlanKey as keyof typeof PLANS] || PLANS.starter;

  const handleRenew = async (key: string) => {
    try {
      setLoadingPlan(key);
      // Use dedicated subscription payment function (sets notification_url for webhook)
      const { data, error } = await supabase.functions.invoke("create-subscription-payment", {
        body: { planKey: key },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("URL de pagamento não retornada");
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err?.message || "Erro ao iniciar pagamento. Tente novamente.");
    } finally {
      setLoadingPlan(null);
    }
  };

  const plans = [
    {
      key: "emissor",
      name: "Emissor",
      price: "99,90",
      features: ["NF-e modelo 55 e 65", "Até 2 usuários", "Financeiro básico", "Ideal para MEI/ME"],
    },
    {
      key: "starter",
      name: "Starter",
      price: "149,90",
      features: ["3 sessões simultâneas", "Controle de estoque", "Financeiro básico", "Relatórios de vendas"],
    },
    {
      key: "business",
      name: "Business",
      price: "199,90",
      features: ["8 sessões simultâneas", "NFC-e", "IA integrada", "Multi-usuários"],
    },
    {
      key: "pro",
      name: "Pro",
      price: "349,90",
      features: ["Sessões ilimitadas", "Todos os módulos", "NF-e + NFC-e", "Suporte dedicado"],
      highlighted: true,
      recommended: true,
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8 sm:py-12 overflow-x-hidden">
      {/* Botão Voltar */}
      <div className="w-full max-w-4xl mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/dashboard">
            <ArrowLeft className="w-4 h-4" /> Voltar ao menu
          </Link>
        </Button>
      </div>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-xl mx-auto mb-10"
      >
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <CreditCard className="w-8 h-8 text-primary" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
          Renovar Assinatura
        </h1>

        {subscriptionEnd && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-muted border border-border mb-4">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {subscriptionOverdue ? "Expirou em " : gracePeriodActive ? "Venceu em " : "Válida até "}
              <strong className="text-foreground">
                {format(new Date(subscriptionEnd), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </strong>
            </span>
          </div>
        )}

        {gracePeriodActive && graceDaysLeft && (
          <p className="text-sm text-primary font-medium">
            ⚠️ Você tem {graceDaysLeft} dia{graceDaysLeft !== 1 ? "s" : ""} de carência restante
          </p>
        )}

        {subscriptionOverdue && (
          <p className="text-sm text-destructive font-medium mt-2">
            O período de carência terminou. Renove para restaurar o acesso.
          </p>
        )}
      </motion.div>

      {/* Plans */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl w-full mx-auto mb-8">
        {plans.map((plan, i) => (
          <motion.div
            key={plan.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`rounded-2xl border p-6 flex flex-col ${
              plan.highlighted
                ? "border-primary bg-primary/5 shadow-lg ring-1 ring-primary/20"
                : "border-border bg-card"
            }`}
          >
            {plan.highlighted && (
              <span className="text-xs font-bold text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                <Zap className="w-3 h-3" /> Mais popular
              </span>
            )}
            {(plan as any).recommended && (
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Star className="w-3 h-3" /> Recomendado
              </span>
            )}
            <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
            <div className="mt-3 mb-5">
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-muted-foreground">R$</span>
                <span className="text-3xl font-extrabold text-foreground">{plan.price}</span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
            </div>
            <ul className="space-y-2 flex-1 mb-5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              variant={plan.highlighted ? "default" : "outline"}
              className="w-full"
              disabled={!!loadingPlan}
              onClick={() => handleRenew(plan.key)}
            >
              {loadingPlan === plan.key ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Redirecionando...</>
              ) : (
                <><ArrowRight className="w-4 h-4 mr-2" />Renovar {plan.name}</>
              )}
            </Button>
          </motion.div>
        ))}
      </div>

      {/* Security badges */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Shield className="w-3.5 h-3.5" />
          Pagamento seguro
        </div>
        <span>•</span>
        <span>PIX, Cartão, Boleto</span>
        <span>•</span>
        <span>Liberação automática</span>
      </div>

      {/* Footer links */}
      <div className="mt-6 text-center space-x-4">
        {subscribed && (
          <button
            onClick={() => window.location.href = "/dashboard"}
            className="text-sm text-primary hover:text-primary/80 transition-colors underline"
          >
            Voltar ao sistema
          </button>
        )}
        <button
          onClick={signOut}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
}
