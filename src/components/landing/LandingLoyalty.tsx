import { motion } from "framer-motion";
import { Gift, Tag, CreditCard, Heart, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const loyaltyFeatures = [
  {
    icon: Gift,
    title: "Programa de Fidelidade",
    desc: "Clientes acumulam pontos a cada compra e trocam por descontos ou produtos. Retenção automática sem esforço.",
    color: "from-pink-600 to-rose-500",
    iconBg: "bg-pink-500/15 text-pink-500",
  },
  {
    icon: Tag,
    title: "Promoções Automáticas",
    desc: "Crie promoções por período, categoria ou produto. Desconto aplicado automaticamente no PDV sem erros manuais.",
    color: "from-orange-600 to-amber-500",
    iconBg: "bg-orange-500/15 text-orange-500",
  },
  {
    icon: CreditCard,
    title: "Sistema de Fiado",
    desc: "Controle de crédito por cliente com limite, parcelas e cobrança. Ideal para mercearias e comércios de bairro.",
    color: "from-blue-600 to-cyan-500",
    iconBg: "bg-blue-500/15 text-blue-500",
  },
];

export function LandingLoyalty() {
  return (
    <section className="py-24 bg-card/40">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Heart className="w-8 h-8 text-pink-500 mx-auto mb-3" />
            <span className="text-pink-500 text-sm font-semibold uppercase tracking-wider">
              Fidelização
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Fidelize seus clientes e venda mais
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
              Promoções, fidelidade e fiado — tudo integrado ao PDV para que seus clientes voltem sempre.
            </p>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {loyaltyFeatures.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group relative rounded-2xl border border-border bg-card p-7 hover:border-pink-500/30 hover:shadow-xl hover:shadow-pink-500/5 transition-all overflow-hidden"
            >
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${f.color} opacity-50 group-hover:opacity-100 transition-opacity`} />

              <div className={`w-14 h-14 rounded-2xl ${f.iconBg} flex items-center justify-center mb-5`}>
                <f.icon className="w-7 h-7" />
              </div>

              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-12 text-center"
        >
          <Button asChild size="lg" variant="outline" className="text-base px-8 h-13 font-semibold border-pink-500/30 text-pink-600 hover:bg-pink-500/5">
            <Link to="/auth">
              Experimentar grátis
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
