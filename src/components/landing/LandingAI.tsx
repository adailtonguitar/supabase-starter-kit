import { motion } from "framer-motion";
import { Brain, Sparkles, Stethoscope, TrendingUp, Zap } from "lucide-react";

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
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-purple-500 text-sm font-semibold uppercase tracking-wider">
              Inteligência Artificial
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              IA que trabalha para você
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
              Enquanto você cuida do seu supermercado, nossa IA analisa seus dados e entrega insights prontos para decisão.
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

        {/* Visual highlight */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="mt-12 max-w-3xl mx-auto rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-pink-500/5 p-8 text-center"
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-purple-500" />
            <span className="font-bold text-lg">Exemplo de insight real</span>
          </div>
          <p className="text-muted-foreground text-sm italic leading-relaxed">
            "Seu produto <strong>Leite Integral 1L</strong> teve queda de 18% nas vendas esta semana.
            Considere uma promoção relâmpago ou reposicionar na gôndola principal para recuperar volume."
          </p>
        </motion.div>
      </div>
    </section>
  );
}
