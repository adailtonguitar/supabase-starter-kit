import { Link } from "react-router-dom";
import { Package, DollarSign, Receipt, BarChart3, ShoppingCart, Users } from "lucide-react";

interface QuickAccessCardsProps {
  productsAtRisk?: number;
  activeAlerts?: number;
}

const cards = [
  { title: "PDV", desc: "Abrir caixa", icon: ShoppingCart, to: "/pdv", accent: "text-primary", bg: "bg-primary/10", hoverBorder: "hover:border-primary/40", badgeKey: null },
  { title: "Produtos", desc: "Estoque", icon: Package, to: "/produtos", accent: "text-accent-foreground", bg: "bg-accent", hoverBorder: "hover:border-accent/40", badgeKey: "productsAtRisk" as const },
  { title: "Vendas", desc: "Histórico", icon: DollarSign, to: "/vendas", accent: "text-success", bg: "bg-success/10", hoverBorder: "hover:border-success/40", badgeKey: null },
  { title: "Financeiro", desc: "Contas", icon: Receipt, to: "/financeiro", accent: "text-warning", bg: "bg-warning/10", hoverBorder: "hover:border-warning/40", badgeKey: "activeAlerts" as const },
  { title: "Clientes", desc: "Cadastro", icon: Users, to: "/clientes", accent: "text-primary", bg: "bg-primary/10", hoverBorder: "hover:border-primary/40", badgeKey: null },
  { title: "Relatórios", desc: "Análises", icon: BarChart3, to: "/relatorio-vendas", accent: "text-destructive", bg: "bg-destructive/10", hoverBorder: "hover:border-destructive/40", badgeKey: null },
];

export function QuickAccessCards({ productsAtRisk = 0, activeAlerts = 0 }: QuickAccessCardsProps) {
  const badgeCounts: Record<string, number> = { productsAtRisk, activeAlerts };

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3">
      {cards.map((card) => {
        const badgeCount = card.badgeKey ? badgeCounts[card.badgeKey] || 0 : 0;
        return (
          <Link
            key={card.title}
            to={card.to}
            className={`group relative bg-card rounded-2xl p-3 sm:p-4 border border-border ${card.hoverBorder} transition-all duration-300 hover:scale-[1.03] hover:shadow-lg flex flex-col items-center text-center gap-2.5 overflow-hidden`}
          >
            {/* Glow effect on hover */}
            <div className={`absolute inset-0 ${card.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

            <div className={`relative w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
              <card.icon className={`w-5 h-5 ${card.accent} transition-transform duration-300`} />
              {!!badgeCount && badgeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shadow-sm">
                  {badgeCount}
                </span>
              )}
            </div>
            <div className="relative">
              <p className="text-xs sm:text-sm font-bold text-foreground">{card.title}</p>
              <p className="text-[10px] text-muted-foreground hidden sm:block mt-0.5">{card.desc}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
