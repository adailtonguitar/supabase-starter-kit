import { Link } from "react-router-dom";
import { Package, DollarSign, Receipt, BarChart3 } from "lucide-react";

export function QuickAccessCards() {
  const cards = [
    { title: "Produtos", icon: Package, to: "/produtos", color: "text-primary" },
    { title: "Vendas", icon: DollarSign, to: "/vendas", color: "text-success" },
    { title: "Financeiro", icon: Receipt, to: "/financeiro", color: "text-warning" },
    { title: "Relatórios", icon: BarChart3, to: "/relatorio-vendas", color: "text-accent-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((card) => (
        <Link key={card.title} to={card.to} className="bg-card rounded-xl p-4 border border-border card-shadow hover:card-shadow-hover transition-shadow flex items-center gap-3">
          <card.icon className={`w-5 h-5 ${card.color}`} />
          <span className="text-sm font-medium text-foreground">{card.title}</span>
        </Link>
      ))}
    </div>
  );
}
