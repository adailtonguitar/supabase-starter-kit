import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTS_ACTIVE_OR_LEGACY_NULL } from "@/lib/product-active-filter";
import { useCompany } from "./useCompany";
import { differenceInDays } from "date-fns";

export type AlertSeverity = "low" | "medium" | "high";

export interface FinancialAlert {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  suggestion: string;
  productId?: string;
  productName?: string;
  value?: number;
}

export function useFinancialAlerts(minMarginPercent = 10) {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["financial-alerts", companyId, minMarginPercent],
    queryFn: async (): Promise<FinancialAlert[]> => {
      if (!companyId) return [];

      const [productsRes, movementsRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, sku, price, cost_price, stock_quantity, min_stock, ncm, fiscal_category_id, updated_at")
          .eq("company_id", companyId)
          .or(PRODUCTS_ACTIVE_OR_LEGACY_NULL),
        supabase
          .from("stock_movements")
          .select("product_id, type, created_at")
          .eq("company_id", companyId)
          .eq("type", "venda")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      const products = productsRes.data || [];
      const movements = movementsRes.data || [];
      const alerts: FinancialAlert[] = [];

      const lastSaleMap = new Map<string, string>();
      for (const m of movements) {
        if (!lastSaleMap.has(m.product_id)) {
          lastSaleMap.set(m.product_id, m.created_at);
        }
      }

      for (const p of products) {
        const cost = Number(p.cost_price || 0);
        const price = Number(p.price);
        const stock = Number(p.stock_quantity);

        if (cost > 0 && price <= cost) {
          alerts.push({
            id: `loss-${p.id}`, type: "selling_below_cost",
            title: "Vendendo com prejuízo",
            description: `${p.name} tem preço de venda (R$ ${price.toFixed(2)}) menor ou igual ao custo (R$ ${cost.toFixed(2)})`,
            severity: "high",
            suggestion: `Ajustar preço para pelo menos R$ ${(cost * 1.15).toFixed(2)} (margem 15%)`,
            productId: p.id, productName: p.name, value: price - cost,
          });
        }

        if (cost > 0 && price > cost) {
          const margin = ((price - cost) / price) * 100;
          if (margin < minMarginPercent) {
            alerts.push({
              id: `margin-${p.id}`, type: "low_margin",
              title: "Margem muito baixa",
              description: `${p.name} tem margem de apenas ${margin.toFixed(1)}% (mínimo: ${minMarginPercent}%)`,
              severity: margin < 5 ? "high" : "medium",
              suggestion: `Considerar reajuste de preço ou renegociar custo com fornecedor`,
              productId: p.id, productName: p.name, value: margin,
            });
          }
        }

        const lastSale = lastSaleMap.get(p.id);
        if (stock > 0 && (!lastSale || differenceInDays(new Date(), new Date(lastSale)) > 30)) {
          const daysSince = lastSale ? differenceInDays(new Date(), new Date(lastSale)) : 999;
          alerts.push({
            id: `stale-${p.id}`, type: "stale_stock",
            title: "Estoque parado",
            description: `${p.name} sem vendas há ${daysSince > 900 ? "muito tempo" : `${daysSince} dias`} (${stock} un. em estoque)`,
            severity: daysSince > 60 ? "high" : "medium",
            suggestion: "Considerar promoção ou campanha para girar o estoque",
            productId: p.id, productName: p.name, value: stock * price,
          });
        }

        if (!p.ncm || !p.fiscal_category_id) {
          alerts.push({
            id: `fiscal-${p.id}`, type: "missing_fiscal",
            title: "Risco fiscal",
            description: `${p.name} sem ${!p.ncm ? "NCM" : "categoria fiscal"} configurado`,
            severity: "high",
            suggestion: "Preencher dados fiscais para evitar bloqueio na emissão de NF",
            productId: p.id, productName: p.name,
          });
        }

        if (Number(p.min_stock || 0) > 0 && stock <= Number(p.min_stock)) {
          alerts.push({
            id: `lowstock-${p.id}`, type: "low_stock",
            title: "Estoque baixo",
            description: `${p.name} com apenas ${stock} un. (mínimo: ${p.min_stock})`,
            severity: stock === 0 ? "high" : "low",
            suggestion: "Realizar pedido de reposição ao fornecedor",
            productId: p.id, productName: p.name, value: stock,
          });
        }
      }

      const severityOrder: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 };
      alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      return alerts;
    },
    enabled: !!companyId,
    refetchInterval: 120000,
  });
}