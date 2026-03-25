import { useState, type ComponentType } from "react";
import { useReadAudit } from "@/hooks/useReadAudit";
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
  useReadAudit({ module: "financeiro", resource: "Lucro Diário" });
  const [date, setDate] = useState(new Date());
  const dateStr = format(date, "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["daily-profit", companyId, dateStr],
    queryFn: async (): Promise<{
      total_sales: number;
      total_revenue: number;
      total_cost: number;
      profit: number;
      margin: number;
      by_payment: Record<string, number>;
    } | null> => {
      if (!companyId) return null;

      const dayStart = `${dateStr}T00:00:00.000Z`;
      const dayEnd = `${dateStr}T23:59:59.999Z`;

      // Fetch sales for the day
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("id, total, payments")
        .eq("company_id", companyId)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .or("status.is.null,status.neq.cancelled");
      if (salesError) { console.error("[LucroDiario] sales error:", salesError); return null; }
      if (!salesData || salesData.length === 0) return null;

      type SaleRow = { id: string; total: number | null; payments: unknown };
      type SaleItemRow = { product_id: string; quantity: number | null };
      type ProductRow = { id: string; cost_price: number | null };

      const sales = salesData as SaleRow[];
      const saleIds = sales.map((s) => s.id);
      const BATCH = 15;

      // Fetch sale_items for cost calculation (batched)
      let itemsData: SaleItemRow[] = [];
      for (let i = 0; i < saleIds.length; i += BATCH) {
        const batch = saleIds.slice(i, i + BATCH);
        const { data } = await supabase
          .from("sale_items")
          .select("product_id, quantity, unit_price, subtotal")
          .in("sale_id", batch);
        if (data) itemsData.push(...(data as SaleItemRow[]));
      }

      // Fetch product costs (batched)
      const productIds = [...new Set(itemsData.map((i) => i.product_id).filter(Boolean))];
      let costMap: Record<string, number> = {};
      for (let i = 0; i < productIds.length; i += BATCH) {
        const batch = productIds.slice(i, i + BATCH);
        const { data: productsData } = await supabase
          .from("products")
          .select("id, cost_price")
          .in("id", batch);
        (productsData || []).forEach((p: ProductRow) => { costMap[p.id] = Number(p.cost_price ?? 0); });
      }

      // Calculate totals — revenue from sales.total (authoritative), cost from items
      const totalRevenue = sales.reduce((s: number, sale) => s + Number(sale.total ?? 0), 0);
      const totalCost = itemsData.reduce(
        (acc, item) => acc + Number(item.quantity ?? 0) * (costMap[item.product_id] ?? 0),
        0,
      );

      const profit = Math.round((totalRevenue - totalCost) * 100) / 100;
      const margin = totalRevenue > 0 ? Math.round(((profit / totalRevenue) * 100) * 10) / 10 : 0;

      // Payment breakdown
      const byPayment: Record<string, number> = {};
      const accumulatePayments = (payments: unknown) => {
        if (Array.isArray(payments)) {
          for (const p of payments) {
            if (!p || typeof p !== "object") continue;
            const obj = p as Record<string, unknown>;
            const method = typeof obj.method === "string" && obj.method.trim().length > 0 ? obj.method : "outros";
            const amount = typeof obj.amount === "number" ? obj.amount : Number(obj.amount ?? 0);
            if (!Number.isFinite(amount)) continue;
            byPayment[method] = (byPayment[method] ?? 0) + amount;
          }
          return;
        }

        if (payments && typeof payments === "object") {
          for (const [method, amount] of Object.entries(payments as Record<string, unknown>)) {
            const num = typeof amount === "number" ? amount : Number(amount ?? 0);
            if (!Number.isFinite(num)) continue;
            byPayment[method] = (byPayment[method] ?? 0) + num;
          }
        }
      };

      for (const sale of sales) accumulatePayments(sale.payments);

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
              { label: "Receita", value: Number(data.total_revenue), icon: DollarSign, color: "text-primary", isCurrency: true },
              { label: "Custos", value: Number(data.total_cost), icon: TrendingDown, color: "text-destructive", isCurrency: true },
              { label: "Lucro", value: Number(data.profit), icon: TrendingUp, color: Number(data.profit) >= 0 ? "text-success" : "text-destructive", isCurrency: true },
              { label: "Vendas", value: Number(data.total_sales), icon: ShoppingCart, color: "text-primary", isCurrency: false },
            ].map((card, i) => (
              <motion.div key={card.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card><CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1"><card.icon className={`w-4 h-4 ${card.color}`} /><span className="text-xs text-muted-foreground">{card.label}</span></div>
                  <p className={`text-lg font-bold font-mono ${card.color}`}>{card.isCurrency === false ? card.value : formatCurrency(card.value)}</p>
                </CardContent></Card>
              </motion.div>
            ))}
          </div>

          <Card><CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium">Margem</span><Badge variant={Number(data.margin) >= 15 ? "default" : Number(data.margin) >= 0 ? "secondary" : "destructive"}>{Number(data.margin).toFixed(1)}%</Badge></div>
            <div className="h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${Number(data.margin) >= 15 ? "bg-success" : Number(data.margin) >= 5 ? "bg-warning" : "bg-destructive"}`} style={{ width: `${Math.max(0, Math.min(100, Number(data.margin)))}%` }} /></div>
          </CardContent></Card>

          {Object.keys(data.by_payment).length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" />Por Forma de Pagamento</CardTitle></CardHeader><CardContent>
              <div className="space-y-2">{Object.entries(data.by_payment).map(([method, value]) => (
                <div key={method} className="flex items-center justify-between py-1.5 border-b border-border last:border-0"><span className="text-sm">{PAYMENT_LABELS[method] || method}</span><span className="text-sm font-mono font-medium">{formatCurrency(Number(value))}</span></div>
              ))}</div>
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}