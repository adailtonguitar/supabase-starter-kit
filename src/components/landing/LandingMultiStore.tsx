import { motion } from "framer-motion";
import { Building2, ArrowRightLeft, BarChart3, Shield, Network } from "lucide-react";

const multiStoreFeatures = [
  {
    icon: Building2,
    title: "Hierarquia de Filiais",
    desc: "Matriz e filiais organizadas com CNPJ independente, estoque próprio e PDV separado.",
  },
  {
    icon: ArrowRightLeft,
    title: "Transferência de Estoque",
    desc: "Movimente produtos entre filiais com rastreabilidade completa e atualização em tempo real.",
  },
  {
    icon: BarChart3,
    title: "Dashboard Consolidado",
    desc: "Visualize o faturamento, vendas e estoque de toda a rede em um único painel.",
  },
  {
    icon: Shield,
    title: "Permissões por Filial",
    desc: "Controle quem acessa o quê em cada unidade. Gestores veem só suas lojas.",
  },
];

export function LandingMultiStore() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-cyan-500/5 blur-[120px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Network className="w-8 h-8 text-cyan-500 mx-auto mb-3" />
            <span className="text-cyan-500 text-sm font-semibold uppercase tracking-wider">
              Multi-loja
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Gerencie toda sua rede em um só lugar
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
              De 2 a 50 lojas, o AnthoSystem escala com você. Cada filial opera independente mas você tem visão total.
            </p>
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
          {multiStoreFeatures.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl border border-border bg-card p-6 text-center hover:border-cyan-500/30 hover:shadow-lg transition-all group"
            >
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center mx-auto mb-4">
                <f.icon className="w-7 h-7 text-cyan-500" />
              </div>
              <h3 className="font-bold text-base mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-10 text-center"
        >
          <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-cyan-500/10 text-cyan-600 text-sm font-semibold">
            <Building2 className="w-4 h-4" />
            Exclusivo do Plano Pro
          </span>
        </motion.div>
      </div>
    </section>
  );
}
