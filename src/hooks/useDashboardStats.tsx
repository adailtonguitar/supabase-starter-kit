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

      const [salesResult, monthResult, recentResult] = await Promise.all([
        supabase.from("sales").select("total_value").eq("company_id", companyId).gte("created_at", today + "T00:00:00"),
        supabase.from("sales").select("total_value").eq("company_id", companyId).gte("created_at", monthStart + "T00:00:00"),
        supabase.from("sales").select("id, number, payment_method, total_value, status").eq("company_id", companyId).order("created_at", { ascending: false }).limit(5),
      ]);

      const todaySales = salesResult.data || [];
      const monthSales = monthResult.data || [];

      const salesToday = todaySales.reduce((sum, s) => sum + Number(s.total_value || 0), 0);
      const salesCountToday = todaySales.length;
      const ticketMedio = salesCountToday > 0 ? salesToday / salesCountToday : 0;
      const monthRevenue = monthSales.reduce((sum, s) => sum + Number(s.total_value || 0), 0);

      return {
        salesToday,
        salesCountToday,
        ticketMedio,
        monthRevenue,
        monthProfit: monthRevenue * 0.3,
        productsAtRisk: 0,
        activeAlerts: 0,
        healthScore: 75,
        fiscalProtected: true,
        recentSales: (recentResult.data || []) as any,
      };
    },
    enabled: !!companyId,
  });
}
