import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { startOfMonth, endOfMonth, format } from "date-fns";

export interface ProductProfit {
  id: string;
  name: string;
  sku: string;
  price: number;
  cost_price: number;
  margin: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  unitsSold: number;
  estimatedTax: number;
}

export interface ProfitSummary {
  totalRevenue: number;
  totalCosts: number;
  estimatedTaxes: number;
  operationalExpenses: number;
  netProfit: number;
  netMargin: number;
  products: ProductProfit[];
  mostProfitable: ProductProfit | null;
  leastProfitable: ProductProfit | null;
  sellingAtLoss: ProductProfit[];
}

export function useProfitAnalytics(dateFrom?: Date, dateTo?: Date) {
  const { companyId } = useCompany();
  const from = dateFrom || startOfMonth(new Date());
  const to = dateTo || endOfMonth(new Date());

  return useQuery({
    queryKey: ["profit-analytics", companyId, format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd")],
    queryFn: async (): Promise<ProfitSummary> => {
      if (!companyId) throw new Error("No company");

      const [salesRes, productsRes] = await Promise.all([
        supabase
          .from("fiscal_documents")
          .select("total_value, items_json, payment_method")
          .eq("company_id", companyId)
          .eq("doc_type", "nfce")
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString()),
        supabase
          .from("products")
          .select("id, name, sku, price, cost_price, ncm")
          .eq("company_id", companyId)
          .eq("is_active", true),
      ]);

      const sales = salesRes.data || [];
      const productsMap = new Map((productsRes.data || []).map(p => [p.id, p]));

      const productStats = new Map<string, {
        revenue: number;
        cost: number;
        units: number;
        name: string;
        sku: string;
        price: number;
        cost_price: number;
      }>();

      let totalRevenue = 0;
      let totalCosts = 0;

      for (const sale of sales) {
        totalRevenue += Number(sale.total_value);
        const items = sale.items_json as any[];
        if (!items || !Array.isArray(items)) continue;

        for (const item of items) {
          const productId = item.product_id;
          const prod = productsMap.get(productId);
          const qty = item.quantity || 1;
          const revenue = (item.price || item.unit_price || 0) * qty;
          const cost = (item.cost_price || prod?.cost_price || 0) * qty;

          const existing = productStats.get(productId) || {
            revenue: 0, cost: 0, units: 0,
            name: item.name || prod?.name || "Produto",
            sku: item.sku || prod?.sku || "",
            price: item.price || prod?.price || 0,
            cost_price: item.cost_price || prod?.cost_price || 0,
          };

          existing.revenue += revenue;
          existing.cost += cost;
          existing.units += qty;
          totalCosts += cost;
          productStats.set(productId, existing);
        }
      }

      const estimatedTaxes = totalRevenue * 0.10;
      const operationalExpenses = totalRevenue * 0.05;
      const netProfit = totalRevenue - totalCosts - estimatedTaxes - operationalExpenses;
      const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      const products: ProductProfit[] = Array.from(productStats.entries()).map(([id, stats]) => {
        const margin = stats.revenue > 0 ? ((stats.revenue - stats.cost) / stats.revenue) * 100 : 0;
        const estimatedTax = stats.revenue * 0.10;
        return {
          id, name: stats.name, sku: stats.sku, price: stats.price,
          cost_price: stats.cost_price, margin,
          totalRevenue: stats.revenue, totalCost: stats.cost,
          totalProfit: stats.revenue - stats.cost - estimatedTax,
          unitsSold: stats.units, estimatedTax,
        };
      }).sort((a, b) => b.totalProfit - a.totalProfit);

      const sellingAtLoss = products.filter(p => p.totalProfit < 0);

      return {
        totalRevenue, totalCosts, estimatedTaxes, operationalExpenses,
        netProfit, netMargin, products,
        mostProfitable: products[0] || null,
        leastProfitable: products[products.length - 1] || null,
        sellingAtLoss,
      };
    },
    enabled: !!companyId,
  });
}