import { Link } from "react-router-dom";
import { Package, DollarSign, Receipt, BarChart3, ShoppingCart, Users } from "lucide-react";

const cards = [
  { title: "PDV", desc: "Abrir caixa", icon: ShoppingCart, to: "/pdv", gradient: "from-primary/20 to-primary/5", iconColor: "text-primary" },
  { title: "Produtos", desc: "Estoque", icon: Package, to: "/produtos", gradient: "from-blue-500/20 to-blue-500/5", iconColor: "text-blue-500" },
  { title: "Vendas", desc: "Histórico", icon: DollarSign, to: "/vendas", gradient: "from-success/20 to-success/5", iconColor: "text-success" },
  { title: "Financeiro", desc: "Contas", icon: Receipt, to: "/financeiro", gradient: "from-warning/20 to-warning/5", iconColor: "text-warning" },
  { title: "Clientes", desc: "Cadastro", icon: Users, to: "/clientes", gradient: "from-purple-500/20 to-purple-500/5", iconColor: "text-purple-500" },
  { title: "Relatórios", desc: "Análises", icon: BarChart3, to: "/relatorio-vendas", gradient: "from-rose-500/20 to-rose-500/5", iconColor: "text-rose-500" },
];

export function QuickAccessCards() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
      {cards.map((card) => (
        <Link
          key={card.title}
          to={card.to}
          className={`group relative bg-gradient-to-br ${card.gradient} rounded-xl p-3 sm:p-4 border border-border/50 hover:border-primary/30 transition-all hover:scale-[1.02] hover:shadow-md flex flex-col items-center text-center gap-2`}
        >
          <div className="w-10 h-10 rounded-lg bg-card/80 flex items-center justify-center border border-border/50 group-hover:border-primary/20 transition-colors">
            <card.icon className={`w-5 h-5 ${card.iconColor}`} />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-semibold text-foreground">{card.title}</p>
            <p className="text-[10px] text-muted-foreground hidden sm:block">{card.desc}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
