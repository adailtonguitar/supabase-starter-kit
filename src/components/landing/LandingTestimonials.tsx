import { motion } from "framer-motion";

const highlights = [
  {
    title: "Controle de validade que funciona",
    text: "Produtos perto do vencimento geram alertas automáticos. Você decide se faz promoção ou retira da prateleira — sem surpresas.",
    icon: "📦",
  },
  {
    title: "PDV que não trava na hora do rush",
    text: "Interface otimizada para velocidade: atalhos de teclado, leitor de código de barras e pesagem integrada. Atendimento rápido mesmo no pico.",
    icon: "⚡",
  },
  {
    title: "Funciona mesmo sem internet",
    text: "A internet caiu? O caixa continua operando normalmente. Quando reconectar, tudo sincroniza automaticamente.",
    icon: "📡",
  },
  {
    title: "Financeiro sem planilha",
    text: "Contas a pagar, receber, fluxo de caixa e DRE gerados automaticamente a partir das vendas e compras. Sem digitar nada duas vezes.",
    icon: "📊",
  },
];

export function LandingTestimonials() {
  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/3 to-transparent pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">Diferenciais</span>
             <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
              Feito para quem vive o dia a dia do comércio
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
              Cada funcionalidade resolve um problema real que donos de comércios enfrentam todos os dias.
            </p>
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {highlights.map((h, i) => (
            <motion.div
              key={h.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl border border-border bg-card p-6 flex flex-col hover:border-primary/30 hover:shadow-lg transition-all"
            >
              <div className="text-3xl mb-4">{h.icon}</div>
              <h3 className="font-bold text-base mb-2">{h.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                {h.text}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
