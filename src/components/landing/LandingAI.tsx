import { motion } from "framer-motion";
import { Brain, Sparkles, Stethoscope, TrendingUp, Zap } from "lucide-react";
import financeiroGestor from "@/assets/financeiro-gestor.png";

const aiFeatures = [
  {
    icon: Sparkles,
    title: "Insight IA no Dashboard",
    desc: "A cada acesso, a IA analisa suas vendas, estoque e finanças e entrega um resumo inteligente com recomendações práticas.",
    badge: "Todos os planos",
    badgeClass: "bg-emerald-500/15 text-emerald-600",
  },
  {
    icon: Stethoscope,
    title: "Diagnóstico Financeiro",
    desc: "Relatório completo gerado por IA com pontos positivos, riscos, recomendações e tendência para o próximo mês.",
    badge: "Plano Pro",
    badgeClass: "bg-primary/15 text-primary",
  },
  {
    icon: Brain,
    title: "Relatórios Inteligentes",
    desc: "Análises profundas sobre padrões de venda, sazonalidade e oportunidades que você não enxergaria em planilhas.",
    badge: "Business+",
    badgeClass: "bg-blue-500/15 text-blue-600",
  },
];

export function LandingAI() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-purple-500/8 blur-[120px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Impact text before AI section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <p className="text-lg sm:text-xl font-semibold text-foreground max-w-3xl mx-auto leading-relaxed">
            "Enquanto outros sistemas apenas registram dados, o AnthoSystem{" "}
            <span className="text-purple-500">analisa e entrega decisões prontas</span>{" "}
            para você lucrar mais."
          </p>
        </motion.div>

        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-purple-500 text-sm font-semibold uppercase tracking-wider">
              Inteligência Artificial
            </span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
              IA que trabalha para você
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
              Enquanto você cuida do seu negócio, nossa IA analisa seus dados e entrega insights prontos para decisão.
            </p>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {aiFeatures.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="relative rounded-2xl border border-border bg-card p-7 hover:border-purple-500/30 hover:shadow-xl hover:shadow-purple-500/5 transition-all group"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-600 to-pink-500 opacity-40 group-hover:opacity-100 transition-opacity rounded-t-2xl" />

              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-5">
                <f.icon className="w-7 h-7 text-purple-500" />
              </div>

              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold mb-3 ${f.badgeClass}`}>
                {f.badge}
              </span>

              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Contextual image */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto mt-10 mb-10 rounded-2xl overflow-hidden border border-border shadow-lg"
        >
          <img src={financeiroGestor} alt="Gestora analisando dashboard financeiro do AnthoSystem" className="w-full h-auto object-cover" loading="lazy" />
        </motion.div>

        {/* Visual highlight */}
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto mt-8">
          {/* Insight rápido */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-pink-500/5 p-7"
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <span className="font-bold text-base">Insight IA — Dashboard</span>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 font-semibold">Todos os planos</span>
            </div>
            <div className="bg-background/60 rounded-xl p-4 border border-border">
              <p className="text-sm text-muted-foreground italic leading-relaxed">
                "Seu produto <strong className="text-foreground">Leite Integral 1L</strong> teve queda de 18% nas vendas esta semana.
                Considere uma promoção relâmpago ou reposicionar na gôndola principal para recuperar volume."
              </p>
            </div>
          </motion.div>

          {/* Diagnóstico profundo */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 p-7"
          >
            <div className="flex items-center gap-2 mb-4">
              <Stethoscope className="w-5 h-5 text-purple-500" />
              <span className="font-bold text-base">Diagnóstico Financeiro — IA</span>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">Plano Pro</span>
            </div>
            <div className="bg-background/60 rounded-xl p-4 border border-border space-y-3 text-sm">
              <div>
                <span className="font-semibold text-foreground">1. Resumo Executivo</span>
                <p className="text-muted-foreground text-xs mt-1">Lucro de R$ 17.000 com margem de 37,7%. Base de 42 clientes ativos demonstra estabilidade, mas concentração de 22% em um único cliente é risco.</p>
              </div>
              <div>
                <span className="font-semibold text-foreground">2. Pontos de Atenção</span>
                <p className="text-muted-foreground text-xs mt-1">Inadimplência de 8,5% requer plano de cobrança. Cliente top representa 22,3% da receita — diversificar urgente.</p>
              </div>
              <div>
                <span className="font-semibold text-foreground">3. Recomendações</span>
                <p className="text-muted-foreground text-xs mt-1">Implementar desconto para pagamento antecipado. Criar campanha para captar 10 novos clientes recorrentes no próximo mês.</p>
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-[11px] text-muted-foreground italic">+ Riscos, Tendências e mais 3 seções no relatório completo...</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
