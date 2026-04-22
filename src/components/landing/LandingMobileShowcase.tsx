import { motion } from "framer-motion";
import { Smartphone, TrendingUp, DollarSign, BarChart3, AlertTriangle } from "lucide-react";
import mobileMockup from "@/assets/mobile-mockup.webp";

const mobileFeatures = [
  { icon: BarChart3, label: "Painel financeiro", value: "R$ 45.200", color: "bg-primary/10 text-primary" },
  { icon: TrendingUp, label: "Vendas em tempo real", value: "+12% hoje", color: "bg-success/10 text-success" },
  { icon: DollarSign, label: "Lucro diário", value: "R$ 3.890", color: "bg-info/10 text-info" },
  { icon: AlertTriangle, label: "Alertas de estoque", value: "3 produtos", color: "bg-warning/10 text-warning" },
];

export function LandingMobileShowcase() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Phone mockup */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex justify-center"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              <img
                src={mobileMockup}
                alt="AnthoSystem no celular — dashboard mobile com vendas, lucro e alertas"
                className="w-64 sm:w-72 rounded-3xl shadow-2xl shadow-primary/10"
                loading="lazy"
              />
            </motion.div>
          </motion.div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-semibold uppercase tracking-wider mb-6">
              <Smartphone className="w-3.5 h-3.5" />
              Mobile
            </div>

            <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
              Sua gestão na palma da mão
            </h2>

            <p className="mt-4 text-muted-foreground text-lg leading-relaxed max-w-lg">
              Acompanhe vendas, estoque, financeiro e insights da IA direto do seu celular, em tempo real.
            </p>

            <div className="mt-8 space-y-4">
              {mobileFeatures.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-4 p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-lg ${f.color.split(" ")[0]} flex items-center justify-center`}>
                    <f.icon className={`w-5 h-5 ${f.color.split(" ")[1]}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{f.label}</p>
                    <p className="text-xs text-muted-foreground">Dados atualizados em tempo real</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
