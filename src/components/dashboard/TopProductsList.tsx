import { formatCurrency } from "@/lib/mock-data";
import { TrendingUp } from "lucide-react";

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
      <div className="bg-card rounded-xl border border-border card-shadow p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Top Produtos do Mês
        </h3>
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma venda registrada este mês</p>
      </div>
    );
  }

  const maxRevenue = products[0]?.revenue || 1;

  return (
    <div className="bg-card rounded-xl border border-border card-shadow p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        Top Produtos do Mês
      </h3>
      <div className="space-y-3">
        {products.map((p, i) => (
          <div key={p.name} className="flex items-center gap-3">
            <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                <span className="text-xs font-mono text-primary font-semibold ml-2 shrink-0">
                  {formatCurrency(p.revenue)}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{ width: `${(p.revenue / maxRevenue) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{p.quantity} un. vendidas</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
