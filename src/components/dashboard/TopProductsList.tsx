import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Crown } from "lucide-react";
import { motion } from "framer-motion";

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

interface Props {
  products: TopProduct[];
}

export function TopProductsList({ products }: Props) {
  if (products.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border p-5 sm:p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Top Produtos do Mês</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma venda registrada este mês</p>
      </div>
    );
  }

  const maxRevenue = products[0]?.revenue || 1;
  const medalColors = [
    "bg-warning/15 text-warning ring-warning/20",
    "bg-muted text-muted-foreground ring-border",
    "bg-primary/10 text-primary ring-primary/20",
  ];

  return (
    <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 hover:border-primary/15 transition-colors duration-300">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
          <TrendingUp className="w-4 h-4 text-primary" />
        </div>
        <h3 className="text-sm font-bold text-foreground">Top Produtos do Mês</h3>
      </div>
      <div className="space-y-3.5">
        {products.map((p, i) => (
          <motion.div
            key={p.name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 + 0.3, duration: 0.35 }}
            className="flex items-center gap-3 group"
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ring-1 ${i < 3 ? medalColors[i] : "bg-muted text-muted-foreground ring-border"}`}>
              {i === 0 ? <Crown className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-foreground truncate">{p.name}</span>
                <span className="text-xs font-mono text-primary font-bold ml-2 shrink-0">
                  {formatCurrency(p.revenue)}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(p.revenue / maxRevenue) * 100}%` }}
                  transition={{ delay: i * 0.1 + 0.5, duration: 0.7, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary/50"
                />
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 block font-medium">{p.quantity} un. vendidas</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
