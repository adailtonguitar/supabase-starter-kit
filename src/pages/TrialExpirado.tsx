import { motion } from "framer-motion";
import { Clock, ArrowRight, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS, useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";

const plans = [
  {
    name: "Starter",
    price: "149,90",
    desc: "Para pequenos comércios",
    features: [
      "3 sessões simultâneas",
      "Controle de estoque",
      "Financeiro básico",
      "Relatórios de vendas",
      "Suporte por e-mail",
    ],
    highlighted: false,
    planKey: "starter",
  },
  {
    name: "Business",
    price: "199,90",
    desc: "Para negócios em crescimento",
    features: [
      "8 sessões simultâneas",
      "Emissão de NFC-e",
      "Análise Inteligente com IA",
      "Multi-usuários e permissões",
      "Programa de fidelidade",
      "Curva ABC e painel de lucro",
      "Suporte prioritário",
    ],
    highlighted: true,
    planKey: "business",
  },
  {
    name: "Pro",
    price: "349,90",
    desc: "Para redes e operações avançadas",
    features: [
      "Sessões ilimitadas",
      "Todos os módulos inclusos",
      "NF-e + NFC-e ilimitadas",
      "Relatórios avançados com IA",
      "Controle de lotes e validade",
      "Suporte dedicado",
    ],
    highlighted: false,
    planKey: "pro",
  },
];

export default function TrialExpirado() {
  const { user, signOut } = useAuth();
  const { subscribed, createCheckout, wasSubscriber, gracePeriodActive, graceDaysLeft, subscriptionOverdue, blocked, blockReason, loading: subLoading } = useSubscription();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  // If user has active subscription, redirect to dashboard
  if (!subLoading && subscribed) {
    return <Navigate to="/dashboard" replace />;
  }

  const handlePlanClick = async (plan: typeof plans[0]) => {
    if (!user) {
      toast.error("Você precisa estar logado para assinar um plano.");
      return;
    }
    try {
      setLoadingPlan(plan.name);
      await createCheckout(plan.planKey);
    } catch (err: any) {
      console.error("Checkout error:", err);
      toast.error(err?.message || "Erro ao iniciar checkout. Tente novamente.");
    } finally {
      setLoadingPlan(null);
    }
  };

  const isOverdue = wasSubscriber && (subscriptionOverdue || gracePeriodActive);

  // Kill switch — show blocked message
  if (blocked) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background flex flex-col items-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-lg mx-auto"
        >
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-3">Acesso Bloqueado</h1>
          <p className="text-muted-foreground text-lg mb-6">
            {blockReason || "O acesso ao sistema foi bloqueado pelo administrador. Entre em contato com o suporte."}
          </p>
          <button
            onClick={signOut}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Sair da conta
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background flex flex-col items-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-2xl mx-auto mb-12"
      >
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
          isOverdue ? "bg-primary/10" : "bg-destructive/10"
        }`}>
          {isOverdue ? (
            <AlertTriangle className="w-8 h-8 text-primary" />
          ) : (
            <Clock className="w-8 h-8 text-destructive" />
          )}
        </div>

        {isOverdue ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight mb-3">
              {subscriptionOverdue ? "Acesso bloqueado por inadimplência" : "Sua assinatura venceu"}
            </h1>
            <p className="text-muted-foreground text-lg">
              {gracePeriodActive ? (
                <>
                  Sua assinatura expirou. Você tem <span className="font-bold text-primary">{graceDaysLeft} dia{graceDaysLeft !== 1 ? "s" : ""}</span> de carência para renovar sem perder acesso.
                </>
              ) : (
                "O período de carência terminou. Renove sua assinatura para voltar a usar o sistema. Seus dados estão seguros e serão mantidos."
              )}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight mb-3">
              Seu período de teste expirou
            </h1>
            <p className="text-muted-foreground text-lg">
              Seus 8 dias de teste gratuito terminaram. Escolha um plano para continuar usando o sistema.
            </p>
          </>
        )}
      </motion.div>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl w-full mx-auto">
        {plans.map((plan, i) => (
          <motion.div
            key={plan.name}
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
              <span className="text-xs font-bold text-primary uppercase tracking-wider mb-3">Mais popular</span>
            )}
            <h3 className="text-xl font-bold">{plan.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{plan.desc}</p>
            <div className="mt-5 mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-muted-foreground">R$</span>
                <span className="text-4xl font-extrabold">{plan.price}</span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
            </div>
            <ul className="space-y-3 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              className="mt-6 w-full"
              variant={plan.highlighted ? "default" : "outline"}
              disabled={loadingPlan === plan.name}
              onClick={() => handlePlanClick(plan)}
            >
              {loadingPlan === plan.name ? "Redirecionando..." : isOverdue ? "Renovar agora" : "Assinar agora"}
            </Button>
          </motion.div>
        ))}
      </div>

      <p className="mt-6 text-sm text-muted-foreground text-center">
        Pagamento seguro via Mercado Pago • PIX, cartão de crédito, boleto ou saldo MP
      </p>

      <div className="mt-4 text-center space-x-4">
        <button
          onClick={() => window.location.href = "/dashboard"}
          className="text-sm text-primary hover:text-primary/80 transition-colors underline"
        >
          Voltar ao sistema
        </button>
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
