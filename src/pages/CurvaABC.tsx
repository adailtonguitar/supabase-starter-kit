import { useMemo } from "react";
import { useProducts } from "@/hooks/useProducts";
import { formatCurrency } from "@/lib/mock-data";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";

export default function CurvaABC() {
  const { data: rawProducts = [], isLoading } = useProducts();
  const products = rawProducts;

  const abcData = useMemo(() => {
    if (products.length === 0) return [];

    const withValue = products.map((p) => ({
      ...p,
      stock_value: p.price * p.stock_quantity,
    }));

    withValue.sort((a, b) => b.stock_value - a.stock_value);

    const totalValue = withValue.reduce((sum, p) => sum + p.stock_value, 0);
    if (totalValue === 0) return withValue.map((p) => ({ ...p, cumulative_pct: 0, class: "C" as const }));

    let cumulative = 0;
    return withValue.map((p) => {
      cumulative += p.stock_value;
      const pct = (cumulative / totalValue) * 100;
      let cls: "A" | "B" | "C";
      if (pct <= 80) cls = "A";
      else if (pct <= 95) cls = "B";
      else cls = "C";
      return { ...p, cumulative_pct: pct, class: cls };
    });
  }, [products]);

  const classColors = { A: "destructive", B: "default", C: "secondary" } as const;
  const classSummary = useMemo(() => {
    const summary = { A: { count: 0, value: 0 }, B: { count: 0, value: 0 }, C: { count: 0, value: 0 } };
    abcData.forEach((p) => {
      summary[p.class].count++;
      summary[p.class].value += p.stock_value;
    });
    return summary;
  }, [abcData]);

  const totalValue = abcData.reduce((s, p) => s + p.stock_value, 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          Curva ABC
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Classificação de produtos por valor em estoque (Pareto)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["A", "B", "C"] as const).map((cls) => (
          <motion.div key={cls} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-5 border border-border card-shadow">
            <div className="flex items-center justify-between mb-2">
              <Badge variant={classColors[cls]}>Classe {cls}</Badge>
              <span className="text-xs text-muted-foreground">{classSummary[cls].count} produtos</span>
            </div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(classSummary[cls].value)}</p>
            <p className="text-xs text-muted-foreground">
              {totalValue > 0 ? ((classSummary[cls].value / totalValue) * 100).toFixed(1) : 0}% do total
            </p>
          </motion.div>
        ))}
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : abcData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Nenhum produto cadastrado.</div>
        ) : (
          abcData.map((p, idx) => (
            <div key={p.id} className="bg-card rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground text-sm truncate mr-2">{idx + 1}. {p.name}</span>
                <Badge variant={classColors[p.class]}>{p.class}</Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-mono">{p.sku}</span>
                <span>Estoque: <strong className="text-foreground">{p.stock_quantity}</strong></span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Valor: <strong className="font-mono text-foreground">{formatCurrency(p.stock_value)}</strong></span>
                <span className="font-mono text-muted-foreground">{p.cumulative_pct.toFixed(1)}%</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden sm:block bg-card rounded-xl card-shadow border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">#</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Produto</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">SKU</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Preço</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Estoque</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Valor Estoque</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">% Acumulado</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Classe</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-5 py-3" colSpan={8}><Skeleton className="h-8 w-full" /></td>
                  </tr>
                ))
              ) : abcData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                    Nenhum produto cadastrado.
                  </td>
                </tr>
              ) : (
                abcData.map((p, idx) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-5 py-3 text-muted-foreground">{idx + 1}</td>
                    <td className="px-5 py-3 font-medium text-foreground">{p.name}</td>
                    <td className="px-5 py-3 font-mono text-muted-foreground text-xs">{p.sku}</td>
                    <td className="px-5 py-3 text-right font-mono text-primary">{formatCurrency(p.price)}</td>
                    <td className="px-5 py-3 text-right font-mono">{p.stock_quantity}</td>
                    <td className="px-5 py-3 text-right font-mono font-semibold">{formatCurrency(p.stock_value)}</td>
                    <td className="px-5 py-3 text-right font-mono text-muted-foreground">{p.cumulative_pct.toFixed(1)}%</td>
                    <td className="px-5 py-3 text-center">
                      <Badge variant={classColors[p.class]}>{p.class}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
