import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface RupturaItem {
  id: string;
  name: string;
  barcode: string | null;
  stock_quantity: number;
  min_stock: number;
  category: string | null;
  supplier_name: string | null;
  total_sold_30d: number;
  avg_daily_sales: number;
  days_without_stock: number;
  revenue_lost_estimate: number;
}

export function useRupturaReport() {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["ruptura-report", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<RupturaItem[]> => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get products with low/zero stock
      const { data: products, error: pErr } = await supabase
        .from("products")
        .select("id, name, barcode, stock_quantity, min_stock, category, cost_price, sale_price")
        .eq("company_id", companyId!)
        .or("is_active.is.null,is_active.eq.true")
        .lte("stock_quantity", 5); // threshold

      if (pErr) throw pErr;
      if (!products || products.length === 0) return [];

      const productIds = products.map((p) => p.id);

      // Get sales for these products in last 30 days
      const { data: saleItems, error: sErr } = await supabase
        .from("sale_items")
        .select("product_id, quantity, total, created_at")
        .in("product_id", productIds)
        .gte("created_at", thirtyDaysAgo.toISOString());

      if (sErr) throw sErr;

      // Aggregate sales per product
      const salesMap: Record<string, { totalQty: number; totalRevenue: number }> = {};
      (saleItems || []).forEach((si: any) => {
        if (!salesMap[si.product_id]) salesMap[si.product_id] = { totalQty: 0, totalRevenue: 0 };
        salesMap[si.product_id].totalQty += si.quantity || 0;
        salesMap[si.product_id].totalRevenue += si.total || 0;
      });

      // Build ruptura list: products that sold but have critical stock
      const result: RupturaItem[] = products
        .filter((p) => {
          const sales = salesMap[p.id];
          return sales && sales.totalQty > 0; // only products that actually sell
        })
        .map((p) => {
          const sales = salesMap[p.id];
          const avgDaily = sales.totalQty / 30;
          const daysWithout = p.stock_quantity <= 0 ? Math.ceil(Math.abs(p.stock_quantity) / Math.max(avgDaily, 0.1)) : 0;
          const revenueLost = daysWithout * avgDaily * (p.sale_price || 0);

          return {
            id: p.id,
            name: p.name,
            barcode: p.barcode,
            stock_quantity: p.stock_quantity || 0,
            min_stock: p.min_stock || 0,
            category: p.category,
            supplier_name: null,
            total_sold_30d: sales.totalQty,
            avg_daily_sales: Math.round(avgDaily * 10) / 10,
            days_without_stock: daysWithout,
            revenue_lost_estimate: Math.round(revenueLost * 100) / 100,
          };
        })
        .sort((a, b) => b.total_sold_30d - a.total_sold_30d);

      return result;
    },
  });
}
