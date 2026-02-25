import { motion } from "framer-motion";
import { UserPlus, Settings, ShoppingCart } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    step: "01",
    title: "Crie sua conta",
    desc: "Cadastro rápido em menos de 1 minuto. Sem burocracia, sem cartão de crédito.",
  },
  {
    icon: Settings,
    step: "02",
    title: "Configure seu negócio",
    desc: "Importe seus produtos, configure o fiscal e personalize o PDV do seu jeito.",
  },
  {
    icon: ShoppingCart,
    step: "03",
    title: "Comece a vender",
    desc: "Pronto! Abra o caixa e venda com emissão fiscal, controle de estoque e tudo integrado.",
  },
];

export function LandingHowItWorks() {
  return (
    <section className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">Como funciona</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Comece em 3 passos simples
            </h2>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connector line */}
          <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20" />

          {steps.map((s, i) => (
            <motion.div
              key={s.step}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="relative text-center"
            >
              <div className="relative mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border-2 border-primary/20">
                <s.icon className="w-9 h-9 text-primary" />
                <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-black flex items-center justify-center shadow-md">
                  {s.step}
                </span>
              </div>
              <h3 className="text-lg font-bold mb-2">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
