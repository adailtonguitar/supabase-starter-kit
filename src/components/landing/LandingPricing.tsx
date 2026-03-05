import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Star, Zap, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS, useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const plans = [
  {
    name: "Starter",
    price: "149,90",
    desc: "Para pequenos comércios e mercearias",
    icon: Zap,
    features: [
      "3 sessões simultâneas",
      "Controle de estoque e validade",
      "Financeiro básico",
      "Insight IA no Dashboard",
      "Funciona offline",
      "Suporte por e-mail",
    ],
    highlighted: false,
    planKey: PLANS.starter.key,
  },
  {
    name: "Business",
    price: "199,90",
    desc: "Para negócios em crescimento",
    icon: Star,
    features: [
      "8 sessões simultâneas",
      "Emissão de NFC-e",
      "Insight IA no Dashboard",
      "Multi-usuários e permissões",
      "Programa de fidelidade",
      "Curva ABC e painel de lucro",
      "Suporte prioritário WhatsApp",
    ],
    highlighted: true,
    planKey: PLANS.business.key,
  },
  {
    name: "Pro",
    price: "449,90",
    desc: "Para redes e operações avançadas",
    icon: Star,
    features: [
      "Sessões ilimitadas",
      "Todos os módulos inclusos",
      "Gestão de Filiais",
      "📸 Cadastro de Produto por Foto (IA)",
      "Diagnóstico Financeiro com IA",
      "Relatórios avançados com IA",
      "Relatório de Ruptura de Estoque",
      "Sugestão de Compra com IA",
      "Consulta DF-e (notas recebidas)",
      "NF-e + NFC-e ilimitadas",
      "Suporte dedicado",
    ],
    highlighted: false,
    planKey: PLANS.pro.key,
  },
];

export function LandingPricing() {
  const { user } = useAuth();
  const { createCheckout } = useSubscription();
  const navigate = useNavigate();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handlePlanClick = async (plan: (typeof plans)[0]) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    try {
      setLoadingPlan(plan.name);
      await createCheckout(plan.planKey);
    } catch {
      toast.error("Erro ao iniciar checkout. Tente novamente.");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <section id="planos" className="py-24 bg-card/40">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">Planos</span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
              Planos que cabem no seu negócio
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Teste grátis por 15 dias. Sem cartão de crédito.
            </p>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start relative z-10" style={{ touchAction: "auto" }}>
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`relative rounded-2xl border p-7 flex flex-col ${
                plan.highlighted
                  ? "border-primary bg-gradient-to-b from-primary/8 to-card shadow-2xl shadow-primary/20 ring-2 ring-primary/30 scale-[1.03]"
                  : "border-border bg-card hover:border-primary/20 hover:shadow-lg transition-all"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider shadow-md">
                    Mais popular
                  </span>
                </div>
              )}

              <h3 className="text-xl font-bold">{plan.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{plan.desc}</p>

              <div className="mt-6 mb-6">
                {plan.price === "Sob consulta" ? (
                  <span className="text-2xl font-bold">Sob consulta</span>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-muted-foreground font-medium">R$</span>
                    <span className="text-4xl font-black tracking-tight">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                  </div>
                )}
              </div>

              <ul className="space-y-3 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-foreground/80">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="mt-7 w-full h-11 font-semibold"
                variant={plan.highlighted ? "default" : "outline"}
                disabled={loadingPlan === plan.name}
                onClick={() => handlePlanClick(plan)}
              >
                {loadingPlan === plan.name
                  ? "Redirecionando..."
                  : plan.price === "Sob consulta"
                    ? "Falar com vendas"
                    : "Começar grátis"}
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Emissor NF-e standalone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-12 max-w-3xl mx-auto"
        >
          <div className="relative rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/5 via-card to-cyan-500/5 p-7 flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-cyan-500" />
                <h3 className="text-lg font-bold">Emissor NF-e</h3>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 text-xs font-bold">
                  Novo
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Só precisa emitir notas fiscais? Plano exclusivo com emissão ilimitada de NF-e + Consulta DF-e por apenas
              </p>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-sm text-muted-foreground font-medium">R$</span>
                <span className="text-3xl font-black tracking-tight text-cyan-600">99,90</span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
            </div>
            <Button asChild size="lg" className="bg-cyan-600 hover:bg-cyan-700 text-white font-semibold shadow-lg whitespace-nowrap">
              <Link to="/emissor">Conhecer Emissor →</Link>
            </Button>
          </div>
        </motion.div>

        {/* Formas de pagamento */}
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Pagamento via Pix, cartão de crédito/débito ou boleto.
        </p>
      </div>
    </section>
  );
}
