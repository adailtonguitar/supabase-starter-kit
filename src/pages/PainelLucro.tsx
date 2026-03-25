import { useState } from "react";
import { useReadAudit } from "@/hooks/useReadAudit";
import { TrendingUp, TrendingDown, DollarSign, Calculator, BarChart3, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { useProfitAnalytics } from "@/hooks/useProfitAnalytics";
import { formatCurrency } from "@/lib/utils";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function PriceSimulator() {
  const [cost, setCost] = useState("");
  const [margin, setMargin] = useState("");
  const costNum = parseFloat(cost) || 0;
  const marginNum = parseFloat(margin) || 0;
  const idealPrice = costNum > 0 && marginNum > 0 ? costNum / (1 - marginNum / 100) : 0;
  const estimatedTax = idealPrice * 0.10;
  const estimatedProfit = idealPrice - costNum - estimatedTax;

  return (
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Calculator className="w-5 h-5 text-primary" />Simulador de Preço Ideal</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Custo do Produto (R$)</Label><Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" step="0.01" /></div>
          <div><Label>Margem Desejada (%)</Label><Input type="number" value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="30" step="1" /></div>
        </div>
        {costNum > 0 && marginNum > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-3 gap-3 pt-2">
            <div className="bg-primary/10 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Preço Ideal</p><p className="text-lg font-bold text-primary">{formatCurrency(idealPrice)}</p></div>
            <div className="bg-accent rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Lucro Estimado</p><p className="text-lg font-bold text-foreground">{formatCurrency(estimatedProfit)}</p></div>
            <div className="bg-destructive/10 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Impostos (~10%)</p><p className="text-lg font-bold text-destructive">{formatCurrency(estimatedTax)}</p></div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PainelLucro() {
  const [period, setPeriod] = useState<"current" | "last">("current");
  const dateFrom = period === "current" ? startOfMonth(new Date()) : startOfMonth(subMonths(new Date(), 1));
  const dateTo = period === "current" ? endOfMonth(new Date()) : endOfMonth(subMonths(new Date(), 1));
  const { data, isLoading } = useProfitAnalytics(dateFrom, dateTo);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground">Painel de Lucro Real</h1><p className="text-sm text-muted-foreground mt-1">Análise inteligente de rentabilidade</p></div>
        <div className="flex gap-2">
          <button onClick={() => setPeriod("current")} className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${period === "current" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Mês Atual</button>
          <button onClick={() => setPeriod("last")} className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${period === "last" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Mês Anterior</button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: "Receita Bruta", value: data.totalRevenue, icon: DollarSign, color: "text-primary" },
              { label: "Custos", value: data.totalCosts, icon: TrendingDown, color: "text-destructive" },
              { label: "Impostos Est.", value: data.estimatedTaxes, icon: BarChart3, color: "text-warning" },
              { label: "Desp. Operac.", value: data.operationalExpenses, icon: TrendingDown, color: "text-muted-foreground" },
              { label: "Lucro Líquido", value: data.netProfit, icon: TrendingUp, color: data.netProfit >= 0 ? "text-success" : "text-destructive" },
            ].map((card, i) => (
              <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl p-4 border border-border card-shadow">
                <div className="flex items-center gap-2 mb-2"><card.icon className={`w-4 h-4 ${card.color}`} /><span className="text-xs text-muted-foreground">{card.label}</span></div>
                <p className={`text-xl font-bold font-mono ${card.color}`}>{formatCurrency(card.value)}</p>
              </motion.div>
            ))}
          </div>

          <Card><CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium">Margem Líquida Real</span><span className={`text-lg font-bold ${data.netMargin >= 0 ? "text-success" : "text-destructive"}`}>{data.netMargin.toFixed(1)}%</span></div>
            <div className="h-3 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${data.netMargin >= 15 ? "bg-success" : data.netMargin >= 5 ? "bg-warning" : "bg-destructive"}`} style={{ width: `${Math.max(0, Math.min(100, data.netMargin))}%` }} /></div>
          </CardContent></Card>

          {data.sellingAtLoss.length > 0 && (
            <Card className="border-destructive/30"><CardHeader><CardTitle className="text-base flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" />Produtos Vendendo com Prejuízo ({data.sellingAtLoss.length})</CardTitle></CardHeader><CardContent>
              <div className="space-y-2">{data.sellingAtLoss.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0"><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.sku}</p></div><Badge variant="destructive">{formatCurrency(p.totalProfit)} prejuízo</Badge></div>
              ))}</div>
            </CardContent></Card>
          )}

          <Card><CardHeader><CardTitle className="text-base">Ranking de Rentabilidade</CardTitle></CardHeader><CardContent>
            {data.products.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma venda no período selecionado</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">#</th>
                <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Produto</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Un. Vendidas</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Receita</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Custo</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Margem</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Lucro</th>
              </tr></thead><tbody>
                {data.products.slice(0, 20).map((p, i) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="py-2 px-2 font-mono text-muted-foreground">{i + 1}</td>
                    <td className="py-2 px-2 font-medium">{p.name}</td>
                    <td className="py-2 px-2 text-right font-mono">{p.unitsSold}</td>
                    <td className="py-2 px-2 text-right font-mono">{formatCurrency(p.totalRevenue)}</td>
                    <td className="py-2 px-2 text-right font-mono">{formatCurrency(p.totalCost)}</td>
                    <td className="py-2 px-2 text-right"><Badge variant={p.margin >= 15 ? "default" : p.margin >= 0 ? "secondary" : "destructive"}>{p.margin.toFixed(1)}%</Badge></td>
                    <td className={`py-2 px-2 text-right font-mono font-semibold ${p.totalProfit >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(p.totalProfit)}</td>
                  </tr>
                ))}
              </tbody></table></div>
            )}
          </CardContent></Card>

          <PriceSimulator />
        </>
      ) : null}
    </div>
  );
}