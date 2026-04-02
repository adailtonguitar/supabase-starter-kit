import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTS_ACTIVE_OR_LEGACY_NULL } from "@/lib/product-active-filter";
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

      type SaleRow = { id: string; total: number | null };
      type ProductRow = {
        id: string;
        name: string;
        sku: string;
        price: number | null;
        cost_price: number | null;
      };
      type SaleItemRow = {
        product_id: string;
        product_name: string | null;
        quantity: number | null;
        unit_price: number | null;
        subtotal: number | null;
      };

      // Fetch sales and products in parallel
      const [salesRes, productsRes] = await Promise.all([
        supabase
          .from("sales")
          .select("id, total")
          .eq("company_id", companyId)
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString())
          .or("status.is.null,status.neq.cancelled"),
        supabase
          .from("products")
          .select("id, name, sku, price, cost_price, ncm")
          .eq("company_id", companyId)
          .or(PRODUCTS_ACTIVE_OR_LEGACY_NULL),
      ]);

      const sales = (salesRes.data || []) as SaleRow[];
      const productsMap = new Map<string, ProductRow>(
        (productsRes.data || []).map((p) => [p.id, p as ProductRow]),
      );

      // Fetch sale_items for all sales (batched)
      const saleIds = sales.map((s) => s.id);
      let allItems: SaleItemRow[] = [];
      const BATCH = 15;
      for (let i = 0; i < saleIds.length; i += BATCH) {
        const batch = saleIds.slice(i, i + BATCH);
        const { data: itemsData } = await supabase
          .from("sale_items")
          .select("sale_id, product_id, product_name, quantity, unit_price, subtotal, discount_percent")
          .in("sale_id", batch);
        if (itemsData) allItems.push(...(itemsData as SaleItemRow[]));
      }

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

      if (allItems.length > 0) {
        // Use sale_items for detailed breakdown
        for (const item of allItems) {
          const productId = item.product_id;
          const prod = productsMap.get(productId);
          const qty = Number(item.quantity ?? 1);
          // Use subtotal (already includes discounts/promos) when available,
          // otherwise fall back to unit_price * qty
          const revenue = item.subtotal != null
            ? Number(item.subtotal)
            : Number(item.unit_price ?? 0) * qty;
          const cost = (prod?.cost_price || 0) * qty;

          const existing = productStats.get(productId) || {
            revenue: 0, cost: 0, units: 0,
            name: item.product_name || prod?.name || "Produto",
            sku: prod?.sku || "",
            price: Number(item.unit_price ?? prod?.price ?? 0),
            cost_price: prod?.cost_price || 0,
          };

          existing.revenue += revenue;
          existing.cost += cost;
          existing.units += qty;
          totalCosts += cost;
          totalRevenue += revenue;
          productStats.set(productId, existing);
        }
      } else {
        // Fallback: use sale totals when no items available
        totalRevenue = sales.reduce((s: number, sale: SaleRow) => s + Number(sale.total ?? 0), 0);
      }

      const estimatedTaxes = Math.round(totalRevenue * 0.10 * 100) / 100;
      const operationalExpenses = Math.round(totalRevenue * 0.05 * 100) / 100;
      const netProfit = Math.round((totalRevenue - totalCosts - estimatedTaxes - operationalExpenses) * 100) / 100;
      const netMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;

      const products: ProductProfit[] = Array.from(productStats.entries()).map(([id, stats]) => {
        const margin = stats.revenue > 0 ? Math.round(((stats.revenue - stats.cost) / stats.revenue) * 1000) / 10 : 0;
        const estimatedTax = Math.round(stats.revenue * 0.10 * 100) / 100;
        const totalProfit = Math.round((stats.revenue - stats.cost - estimatedTax) * 100) / 100;
        return {
          id, name: stats.name, sku: stats.sku, price: stats.price,
          cost_price: stats.cost_price, margin,
          totalRevenue: Math.round(stats.revenue * 100) / 100,
          totalCost: Math.round(stats.cost * 100) / 100,
          totalProfit, unitsSold: stats.units, estimatedTax,
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