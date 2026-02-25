import { Link } from "react-router-dom";
import { Package, DollarSign, Receipt, BarChart3, ShoppingCart, Users } from "lucide-react";

const cards = [
  { title: "PDV", desc: "Abrir caixa", icon: ShoppingCart, to: "/pdv", accent: "text-primary", bg: "bg-primary/10", hoverBorder: "hover:border-primary/40" },
  { title: "Produtos", desc: "Estoque", icon: Package, to: "/produtos", accent: "text-blue-500", bg: "bg-blue-500/10", hoverBorder: "hover:border-blue-500/40" },
  { title: "Vendas", desc: "Histórico", icon: DollarSign, to: "/vendas", accent: "text-success", bg: "bg-success/10", hoverBorder: "hover:border-success/40" },
  { title: "Financeiro", desc: "Contas", icon: Receipt, to: "/financeiro", accent: "text-warning", bg: "bg-warning/10", hoverBorder: "hover:border-warning/40" },
  { title: "Clientes", desc: "Cadastro", icon: Users, to: "/clientes", accent: "text-purple-500", bg: "bg-purple-500/10", hoverBorder: "hover:border-purple-500/40" },
  { title: "Relatórios", desc: "Análises", icon: BarChart3, to: "/relatorio-vendas", accent: "text-rose-500", bg: "bg-rose-500/10", hoverBorder: "hover:border-rose-500/40" },
];

export function QuickAccessCards() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3">
      {cards.map((card) => (
        <Link
          key={card.title}
          to={card.to}
          className={`group relative bg-card rounded-2xl p-3 sm:p-4 border border-border ${card.hoverBorder} transition-all duration-300 hover:scale-[1.03] hover:shadow-lg flex flex-col items-center text-center gap-2.5 overflow-hidden`}
        >
          {/* Glow effect on hover */}
          <div className={`absolute inset-0 ${card.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
          
          <div className={`relative w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
            <card.icon className={`w-5 h-5 ${card.accent} transition-transform duration-300`} />
          </div>
          <div className="relative">
            <p className="text-xs sm:text-sm font-bold text-foreground">{card.title}</p>
            <p className="text-[10px] text-muted-foreground hidden sm:block mt-0.5">{card.desc}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
