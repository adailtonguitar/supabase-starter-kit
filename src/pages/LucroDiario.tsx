import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { format, subDays, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, DollarSign, TrendingUp, TrendingDown, ShoppingCart, CreditCard } from "lucide-react";
import { motion } from "framer-motion";

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito", pix: "PIX", voucher: "Voucher", outros: "Outros",
};

export default function LucroDiario() {
  const { companyId } = useCompany();
  const [date, setDate] = useState(new Date());
  const dateStr = format(date, "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["daily-profit", companyId, dateStr],
    queryFn: async () => {
      if (!companyId) return null;

      const dayStart = `${dateStr}T00:00:00.000Z`;
      const dayEnd = `${dateStr}T23:59:59.999Z`;

      // Fetch sales for the day
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("id, total, payments")
        .eq("company_id", companyId)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd);
      if (salesError) { console.error("[LucroDiario] sales error:", salesError); return null; }
      if (!salesData || salesData.length === 0) return null;

      const saleIds = salesData.map((s: any) => s.id);

      // Fetch sale_items for cost calculation
      const { data: itemsData } = await supabase
        .from("sale_items")
        .select("product_id, quantity, unit_price")
        .in("sale_id", saleIds);

      // Fetch product costs
      const productIds = [...new Set((itemsData || []).map((i: any) => i.product_id).filter(Boolean))];
      let costMap: Record<string, number> = {};
      if (productIds.length > 0) {
        const { data: productsData } = await supabase
          .from("products")
          .select("id, cost_price")
          .in("id", productIds);
        (productsData || []).forEach((p: any) => { costMap[p.id] = Number(p.cost_price || 0); });
      }

      // Calculate totals
      const totalRevenue = salesData.reduce((s: number, sale: any) => s + Number(sale.total || 0), 0);
      let totalCost = 0;
      let itemsRevenue = 0;
      (itemsData || []).forEach((item: any) => {
        itemsRevenue += Number(item.quantity) * Number(item.unit_price);
        totalCost += Number(item.quantity) * (costMap[item.product_id] || 0);
      });

      const profit = totalRevenue - totalCost;
      const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

      // Payment breakdown
      const byPayment: Record<string, number> = {};
      salesData.forEach((sale: any) => {
        const payments = sale.payments;
        if (Array.isArray(payments)) {
          payments.forEach((p: any) => {
            const method = p.method || "outros";
            byPayment[method] = (byPayment[method] || 0) + Number(p.amount || 0);
          });
        } else if (payments && typeof payments === "object") {
          Object.entries(payments).forEach(([method, amount]) => {
            byPayment[method] = (byPayment[method] || 0) + Number(amount || 0);
          });
        }
      });

      return {
        total_sales: salesData.length,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        profit,
        margin,
        by_payment: byPayment,
      };
    },
    enabled: !!companyId,
  });

  const isToday = format(new Date(), "yyyy-MM-dd") === dateStr;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Lucro Diário</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setDate(d => subDays(d, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium min-w-[140px] text-center">{format(date, "dd 'de' MMMM, yyyy", { locale: ptBR })}</span>
          <Button variant="outline" size="icon" onClick={() => setDate(d => addDays(d, 1))} disabled={isToday}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : !data || Number(data.total_sales) === 0 ? (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Nenhuma venda registrada neste dia.</p></CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Receita", value: Number(data.total_revenue), icon: DollarSign, color: "text-primary" },
              { label: "Custos", value: Number(data.total_cost), icon: TrendingDown, color: "text-destructive" },
              { label: "Lucro", value: Number(data.profit), icon: TrendingUp, color: Number(data.profit) >= 0 ? "text-success" : "text-destructive" },
              { label: "Vendas", value: Number(data.total_sales), icon: ShoppingCart, color: "text-primary", isCurrency: false },
            ].map((card, i) => (
              <motion.div key={card.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card><CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1"><card.icon className={`w-4 h-4 ${card.color}`} /><span className="text-xs text-muted-foreground">{card.label}</span></div>
                  <p className={`text-lg font-bold font-mono ${card.color}`}>{(card as any).isCurrency === false ? card.value : formatCurrency(card.value)}</p>
                </CardContent></Card>
              </motion.div>
            ))}
          </div>

          <Card><CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium">Margem</span><Badge variant={Number(data.margin) >= 15 ? "default" : Number(data.margin) >= 0 ? "secondary" : "destructive"}>{Number(data.margin).toFixed(1)}%</Badge></div>
            <div className="h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${Number(data.margin) >= 15 ? "bg-success" : Number(data.margin) >= 5 ? "bg-warning" : "bg-destructive"}`} style={{ width: `${Math.max(0, Math.min(100, Number(data.margin)))}%` }} /></div>
          </CardContent></Card>

          {data.by_payment && Object.keys(data.by_payment as Record<string, number>).length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" />Por Forma de Pagamento</CardTitle></CardHeader><CardContent>
              <div className="space-y-2">{Object.entries(data.by_payment as Record<string, number>).map(([method, value]) => (
                <div key={method} className="flex items-center justify-between py-1.5 border-b border-border last:border-0"><span className="text-sm">{PAYMENT_LABELS[method] || method}</span><span className="text-sm font-mono font-medium">{formatCurrency(Number(value))}</span></div>
              ))}</div>
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}