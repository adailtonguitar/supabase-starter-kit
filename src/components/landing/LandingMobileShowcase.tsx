import { motion } from "framer-motion";
import { Smartphone, TrendingUp, DollarSign, BarChart3, AlertTriangle } from "lucide-react";

const mobileFeatures = [
  { icon: BarChart3, label: "Painel financeiro", value: "R$ 45.200", color: "bg-primary/10 text-primary" },
  { icon: TrendingUp, label: "Vendas em tempo real", value: "+12% hoje", color: "bg-emerald-500/10 text-emerald-600" },
  { icon: DollarSign, label: "Lucro diário", value: "R$ 3.890", color: "bg-blue-500/10 text-blue-600" },
  { icon: AlertTriangle, label: "Alertas de estoque", value: "3 produtos", color: "bg-amber-500/10 text-amber-600" },
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
            <div className="relative">
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="w-64 sm:w-72 bg-card border-2 border-border rounded-[2.5rem] p-5 shadow-2xl shadow-primary/10"
              >
                {/* Phone notch */}
                <div className="w-20 h-1.5 bg-muted rounded-full mx-auto mb-4" />
                
                {/* Dashboard header */}
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground">Bem-vindo de volta 👋</p>
                  <p className="text-sm font-bold text-foreground">Dashboard</p>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {mobileFeatures.map((f) => (
                    <div key={f.label} className={`rounded-xl p-3 ${f.color.split(" ")[0]}`}>
                      <f.icon className={`w-4 h-4 mb-1 ${f.color.split(" ")[1]}`} />
                      <p className="text-[10px] text-muted-foreground">{f.label}</p>
                      <p className="text-xs font-bold text-foreground">{f.value}</p>
                    </div>
                  ))}
                </div>

                {/* Mini chart */}
                <div className="rounded-xl border border-border p-3 mb-3">
                  <p className="text-[10px] font-semibold text-foreground mb-2">Vendas da semana</p>
                  <div className="flex items-end gap-1 h-12">
                    {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-sm bg-primary/20"
                        style={{ height: `${h}%` }}
                      >
                        <div
                          className="w-full rounded-sm bg-primary transition-all"
                          style={{ height: `${h}%` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Insight */}
                <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 p-3">
                  <p className="text-[10px] font-semibold text-purple-600 mb-1">💡 Insight da IA</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Arroz 5kg está com estoque para apenas 3 dias. Sugiro reposição imediata.
                  </p>
                </div>

                {/* Phone bottom bar */}
                <div className="w-12 h-1 bg-muted rounded-full mx-auto mt-4" />
              </motion.div>
            </div>
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

            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
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
