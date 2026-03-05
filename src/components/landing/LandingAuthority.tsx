import { motion } from "framer-motion";
import { Shield, Monitor, Zap, Users, BarChart3, Clock } from "lucide-react";

const stats = [
  { value: "100%", label: "Funciona offline", icon: Zap },
  { value: "24/7", label: "Sistema disponível", icon: Clock },
  { value: "<2h", label: "Tempo de resposta", icon: Users },
  { value: "15 dias", label: "Teste grátis", icon: BarChart3 },
];

const proofs = [
  {
    icon: Monitor,
    title: "Sistema completo e real",
    desc: "PDV, estoque, fiscal, financeiro e IA — tudo funcionando em produção, usado por comércios reais todos os dias.",
  },
  {
    icon: Shield,
    title: "Segurança e estabilidade",
    desc: "Dados criptografados, backup automático e funcionamento mesmo sem internet. Seu negócio nunca para.",
  },
  {
    icon: Zap,
    title: "Implantação em minutos",
    desc: "Cadastre-se, configure seu negócio e comece a vender. Sem instalação complexa, sem técnico no local.",
  },
];

export function LandingAuthority() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-card/50 via-transparent to-card/50 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">
              Confiança comprovada
            </span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
              Um sistema construído para a realidade
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
              O AnthoSystem foi desenvolvido para resolver os problemas reais do comércio e varejo. Do caixa ao financeiro, cada funcionalidade foi testada em operação real.
            </p>
          </motion.div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl border border-border bg-card p-6 text-center hover:border-primary/30 hover:shadow-lg transition-all"
            >
              <s.icon className="w-6 h-6 text-primary mx-auto mb-3" />
              <p className="text-3xl font-black text-foreground">{s.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Proof cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {proofs.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="rounded-2xl border border-border bg-card p-7 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                <p.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-bold text-lg mb-2">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
