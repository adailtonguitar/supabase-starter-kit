import { motion } from "framer-motion";
import { BarChart3, TrendingUp, PieChart, DollarSign, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const analyticsFeatures = [
  {
    icon: PieChart,
    title: "Curva ABC de Produtos",
    desc: "Descubra quais produtos são responsáveis por 80% do seu faturamento. Identifique itens A, B e C para decisões estratégicas de compra, precificação e posicionamento em gôndola.",
    highlights: ["Classificação automática A/B/C", "Análise por faturamento e quantidade", "Relatório visual interativo"],
    color: "from-blue-600 to-cyan-500",
    iconBg: "bg-blue-500/15 text-blue-500",
  },
  {
    icon: TrendingUp,
    title: "Painel de Lucro Diário",
    desc: "Acompanhe em tempo real o lucro bruto de cada venda, margem por produto e rentabilidade por categoria. Tome decisões baseadas em dados, não em achismo.",
    highlights: ["Lucro bruto por venda", "Margem por produto e categoria", "Comparativo diário/semanal"],
    color: "from-emerald-600 to-teal-500",
    iconBg: "bg-emerald-500/15 text-emerald-500",
  },
  {
    icon: BarChart3,
    title: "DRE Simplificado",
    desc: "Demonstrativo de Resultado do Exercício automático. Visualize receitas, custos, despesas e o resultado final do seu negócio mês a mês.",
    highlights: ["Gerado automaticamente", "Receitas vs despesas", "Resultado líquido mensal"],
    color: "from-violet-600 to-purple-500",
    iconBg: "bg-violet-500/15 text-violet-500",
  },
  {
    icon: DollarSign,
    title: "Fluxo de Caixa Projetado",
    desc: "Saiba quanto vai entrar e sair nos próximos dias. Antecipe problemas de caixa e planeje compras com segurança.",
    highlights: ["Projeção a 30/60/90 dias", "Contas a pagar e receber", "Alertas de saldo negativo"],
    color: "from-amber-600 to-orange-500",
    iconBg: "bg-amber-500/15 text-amber-500",
  },
];

export function LandingAnalytics() {
  return (
    <section id="analytics" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">
              Inteligência de Negócio
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Dados que transformam seu supermercado
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
              Curva ABC, painel de lucros, DRE e fluxo de caixa — tudo automático e visual para você tomar as melhores decisões.
            </p>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {analyticsFeatures.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="group relative rounded-2xl border border-border bg-card p-7 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all overflow-hidden"
            >
              {/* Gradient accent bar */}
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${f.color} opacity-60 group-hover:opacity-100 transition-opacity`} />

              <div className="flex items-start gap-5">
                <div className={`w-14 h-14 rounded-2xl ${f.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <f.icon className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">{f.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {f.highlights.map((h) => (
                      <span
                        key={h}
                        className="inline-flex items-center px-3 py-1 rounded-full bg-muted text-xs font-medium text-foreground/80"
                      >
                        ✓ {h}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-12 text-center"
        >
          <Button asChild size="lg" className="text-base px-8 h-13 shadow-lg shadow-primary/20 font-semibold">
            <Link to="/auth">
              Começar grátis e ver seus dados
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
