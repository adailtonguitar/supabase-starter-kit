import { Link } from "react-router-dom";
import { Package, DollarSign, Receipt, BarChart3, ShoppingCart, Users } from "lucide-react";
import { motion } from "framer-motion";

interface QuickAccessCardsProps {
  productsAtRisk?: number;
  activeAlerts?: number;
}

const cards = [
  { title: "PDV", desc: "Abrir caixa", icon: ShoppingCart, to: "/pdv", accent: "text-primary", bg: "bg-primary/10", ringColor: "ring-primary/15", badgeKey: null },
  { title: "Produtos", desc: "Estoque", icon: Package, to: "/produtos", accent: "text-accent-foreground", bg: "bg-accent", ringColor: "ring-accent-foreground/10", badgeKey: "productsAtRisk" as const },
  { title: "Vendas", desc: "Histórico", icon: DollarSign, to: "/vendas", accent: "text-success", bg: "bg-success/10", ringColor: "ring-success/15", badgeKey: null },
  { title: "Financeiro", desc: "Contas", icon: Receipt, to: "/financeiro", accent: "text-warning", bg: "bg-warning/10", ringColor: "ring-warning/15", badgeKey: "activeAlerts" as const },
  { title: "Clientes", desc: "Cadastro", icon: Users, to: "/cadastro/clientes", accent: "text-primary", bg: "bg-primary/10", ringColor: "ring-primary/15", badgeKey: null },
  { title: "Relatórios", desc: "Análises", icon: BarChart3, to: "/relatorio-vendas", accent: "text-destructive", bg: "bg-destructive/10", ringColor: "ring-destructive/15", badgeKey: null },
];

const cardVariant = {
  initial: { opacity: 0, y: 12, scale: 0.95 },
  animate: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.04, duration: 0.35, ease: "easeOut" as const },
  }),
};

export function QuickAccessCards({ productsAtRisk = 0, activeAlerts = 0 }: QuickAccessCardsProps) {
  const badgeCounts: Record<string, number> = { productsAtRisk, activeAlerts };

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3">
      {cards.map((card, i) => {
        const badgeCount = card.badgeKey ? badgeCounts[card.badgeKey] || 0 : 0;
        return (
          <motion.div
            key={card.title}
            variants={cardVariant}
            initial="initial"
            animate="animate"
            custom={i}
            whileHover={{ y: -3, scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            <Link
              to={card.to}
              className={`group relative bg-card rounded-2xl p-3 sm:p-4 border border-border hover:border-primary/25 transition-all duration-300 hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.12)] flex flex-col items-center text-center gap-2.5 overflow-hidden`}
            >
              {/* Subtle glow on hover */}
              <div className={`absolute inset-0 ${card.bg} opacity-0 group-hover:opacity-60 transition-opacity duration-500 rounded-2xl`} />

              <div className={`relative w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center ring-1 ${card.ringColor} transition-all duration-300 group-hover:ring-2 group-hover:shadow-md`}>
                <card.icon className={`w-5 h-5 ${card.accent} transition-transform duration-300 group-hover:scale-110`} />
                {!!badgeCount && badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shadow-sm ring-2 ring-card">
                    {badgeCount}
                  </span>
                )}
              </div>
              <div className="relative">
                <p className="text-xs sm:text-sm font-bold text-foreground">{card.title}</p>
                <p className="text-[10px] text-muted-foreground hidden sm:block mt-0.5">{card.desc}</p>
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
