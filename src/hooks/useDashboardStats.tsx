import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";

interface DashboardStats {
  salesToday: number;
  salesCountToday: number;
  ticketMedio: number;
  monthRevenue: number;
  monthProfit: number;
  productsAtRisk: number;
  activeAlerts: number;
  healthScore: number;
  fiscalProtected: boolean;
  recentSales: Array<{
    id: string;
    number: number | null;
    payment_method: string | null;
    total_value: string;
    status: string;
  }>;
}

export function useDashboardStats() {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["dashboard-stats", companyId],
    queryFn: async (): Promise<DashboardStats> => {
      if (!companyId) throw new Error("No company");

      const today = new Date().toISOString().split("T")[0];
      const monthStart = today.slice(0, 7) + "-01";

      const [salesResult, monthResult, recentResult, productsResult, alertsResult, fiscalResult, financialResult] = await Promise.all([
        supabase.from("sales").select("total_value").eq("company_id", companyId).gte("created_at", today + "T00:00:00"),
        supabase.from("sales").select("total_value").eq("company_id", companyId).gte("created_at", monthStart + "T00:00:00"),
        supabase.from("sales").select("id, number, payment_method, total_value, status").eq("company_id", companyId).order("created_at", { ascending: false }).limit(5),
        // Products at risk: stock <= min_stock
        supabase.from("products").select("id, stock, min_stock").eq("company_id", companyId),
        // Active financial alerts
        supabase.from("financial_entries").select("id").eq("company_id", companyId).eq("status", "pendente").lte("due_date", today),
        // Fiscal config check
        supabase.from("fiscal_configs").select("id").eq("company_id", companyId).eq("is_active", true).limit(1),
        // Financial entries for real profit calc (month)
        supabase.from("financial_entries").select("type, amount").eq("company_id", companyId).eq("status", "pago").gte("due_date", monthStart),
      ]);

      const todaySales = salesResult.data || [];
      const monthSales = monthResult.data || [];

      const salesToday = todaySales.reduce((sum, s) => sum + Number(s.total_value || 0), 0);
      const salesCountToday = todaySales.length;
      const ticketMedio = salesCountToday > 0 ? salesToday / salesCountToday : 0;
      const monthRevenue = monthSales.reduce((sum, s) => sum + Number(s.total_value || 0), 0);

      // Products at risk (stock <= min_stock and min_stock > 0)
      const products = productsResult.data || [];
      const productsAtRisk = products.filter((p: any) => p.min_stock > 0 && (p.stock ?? 0) <= p.min_stock).length;

      // Overdue financial entries
      const activeAlerts = (alertsResult.data || []).length;

      // Fiscal protection
      const fiscalProtected = (fiscalResult.data || []).length > 0;

      // Real profit: receitas - despesas from financial_entries
      const financialEntries = financialResult.data || [];
      const receitas = financialEntries.filter((e: any) => e.type === "receita").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
      const despesas = financialEntries.filter((e: any) => e.type === "despesa").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
      const monthProfit = receitas > 0 || despesas > 0 ? receitas - despesas : monthRevenue * 0.3;

      // Health score based on real data
      let healthScore = 50;
      if (monthRevenue > 0) healthScore += 15;
      if (productsAtRisk === 0) healthScore += 15;
      if (activeAlerts === 0) healthScore += 10;
      if (fiscalProtected) healthScore += 10;
      healthScore = Math.min(100, healthScore);

      return {
        salesToday,
        salesCountToday,
        ticketMedio,
        monthRevenue,
        monthProfit,
        productsAtRisk,
        activeAlerts,
        healthScore,
        fiscalProtected,
        recentSales: (recentResult.data || []) as any,
      };
    },
    enabled: !!companyId,
  });
}
