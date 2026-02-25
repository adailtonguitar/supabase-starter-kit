import { formatCurrency } from "@/lib/mock-data";
import { TrendingUp, Crown } from "lucide-react";

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
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Top Produtos do Mês</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma venda registrada este mês</p>
      </div>
    );
  }

  const maxRevenue = products[0]?.revenue || 1;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 sm:p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-primary" />
        </div>
        <h3 className="text-sm font-bold text-foreground">Top Produtos do Mês</h3>
      </div>
      <div className="space-y-4">
        {products.map((p, i) => (
          <div key={p.name} className="flex items-center gap-3 group">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
              {i === 0 ? <Crown className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-foreground truncate">{p.name}</span>
                <span className="text-xs font-mono text-primary font-bold ml-2 shrink-0">
                  {formatCurrency(p.revenue)}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary/40 transition-all duration-700"
                  style={{ width: `${(p.revenue / maxRevenue) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 block">{p.quantity} un. vendidas</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
