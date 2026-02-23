import { motion } from "framer-motion";
import { TrendingDown, Zap, Smartphone, Headphones } from "lucide-react";

const advantages = [
  {
    icon: TrendingDown,
    title: "Reduza perdas em até 30%",
    desc: "Controle de validade e lotes evita que produtos vençam na prateleira sem que você perceba.",
    stat: "30%",
    statLabel: "menos perdas",
  },
  {
    icon: Zap,
    title: "Caixa 2x mais rápido",
    desc: "PDV otimizado para supermercados com atalhos, leitor e pesagem. Menos fila, mais vendas.",
    stat: "2x",
    statLabel: "mais velocidade",
  },
  {
    icon: Smartphone,
    title: "Acesse de qualquer lugar",
    desc: "Acompanhe vendas, estoque e financeiro pelo celular ou computador em tempo real.",
    stat: "24/7",
    statLabel: "disponível",
  },
  {
    icon: Headphones,
    title: "Suporte especializado",
    desc: "Equipe que entende a rotina de supermercado. Atendimento rápido por WhatsApp.",
    stat: "<2h",
    statLabel: "tempo de resposta",
  },
];

export function LandingAdvantages() {
  return (
    <section id="vantagens" className="py-24 bg-card/40">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">Vantagens</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Por que supermercados escolhem o AnthoSystem?
            </h2>
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {advantages.map((a, i) => (
            <motion.div
              key={a.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="relative rounded-2xl border border-border bg-card p-6 text-center group hover:border-primary/30 hover:shadow-lg transition-all"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <a.icon className="w-7 h-7 text-primary" />
              </div>
              <div className="text-3xl font-black text-primary mb-1">{a.stat}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-4">{a.statLabel}</div>
              <h3 className="font-bold text-base">{a.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{a.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
