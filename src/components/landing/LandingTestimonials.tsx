import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Carlos Silva",
    role: "Dono — Mercado Bom Preço",
    city: "São Luís, MA",
    text: "Antes eu perdia muito produto por vencimento. Com o controle de lotes e validade do AnthoSystem, reduzi as perdas em mais de 40%. O sistema se paga no primeiro mês.",
    stars: 5,
  },
  {
    name: "Maria Oliveira",
    role: "Gerente — SuperMarket Express",
    city: "Imperatriz, MA",
    text: "O PDV é muito rápido! Minhas caixas atendem o dobro de clientes na hora do rush. E quando a internet cai, continuo vendendo normalmente.",
    stars: 5,
  },
  {
    name: "João Santos",
    role: "Proprietário — Mercearia Santos",
    city: "Teresina, PI",
    text: "A emissão fiscal automática me economiza horas por semana. Antes eu fazia tudo manual. Agora é tudo integrado e sem erro.",
    stars: 5,
  },
  {
    name: "Ana Costa",
    role: "Financeiro — Supermercado Família",
    city: "Bacabal, MA",
    text: "O painel financeiro e o DRE automático transformaram minha gestão. Agora sei exatamente quanto lucro em cada categoria de produto.",
    stars: 5,
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
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">Depoimentos</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              O que nossos clientes dizem
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
              Supermercados de todo o Brasil confiam no AnthoSystem para crescer.
            </p>
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl border border-border bg-card p-6 flex flex-col hover:border-primary/30 hover:shadow-lg transition-all"
            >
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: t.stars }).map((_, s) => (
                  <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1 italic">
                "{t.text}"
              </p>
              <div className="mt-5 pt-4 border-t border-border">
                <p className="font-bold text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
                <p className="text-xs text-muted-foreground">{t.city}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
