import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";

interface DailySales {
  date: string;
  total: number;
  count: number;
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

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
  totalProducts: number;
  totalClients: number;
  salesGrowth: number;
  last7Days: DailySales[];
  topProducts: TopProduct[];
  recentSales: Array<{
    id: string;
    number: number | null;
    payment_method: string | null;
    total_value: number;
    status: string;
  }>;
  // New owner panel fields
  salesYesterday: number;
  salesCountYesterday: number;
  fiadoTotal: number;
  fiadoCount: number;
  billsDueToday: number;
  billsDueTodayCount: number;
  overdueBills: number;
  overdueBillsCount: number;
}

function extractPaymentMethod(payments: any): string {
  try {
    const arr = Array.isArray(payments) ? payments : typeof payments === "string" ? JSON.parse(payments) : [];
    if (arr.length > 0) return arr[0].method || "";
  } catch {}
  return "";
}

export function useDashboardStats() {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["dashboard-stats", companyId],
    queryFn: async (): Promise<DashboardStats> => {
      if (!companyId) throw new Error("No company");

      const today = new Date().toISOString().split("T")[0];
      const monthStart = today.slice(0, 7) + "-01";

      // Yesterday
      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      const yesterday = yest.toISOString().split("T")[0];

      // Last 7 days range
      const d7 = new Date();
      d7.setDate(d7.getDate() - 6);
      const sevenDaysAgo = d7.toISOString().split("T")[0];

      // Previous period for growth calc
      const d14 = new Date();
      d14.setDate(d14.getDate() - 13);
      const fourteenDaysAgo = d14.toISOString().split("T")[0];

      const [
        salesResult, monthResult, recentResult, productsResult, alertsResult,
        fiscalResult, financialResult, last7Result, prevPeriodResult,
        totalProductsResult, totalClientsResult, saleItemsResult,
        yesterdayResult, fiadoResult, billsDueResult, overdueBillsResult,
      ] = await Promise.all([
        supabase.from("sales").select("total").eq("company_id", companyId).gte("created_at", today + "T00:00:00").or("status.is.null,status.neq.cancelled"),
        supabase.from("sales").select("total").eq("company_id", companyId).gte("created_at", monthStart + "T00:00:00").or("status.is.null,status.neq.cancelled"),
        supabase.from("sales").select("id, sale_number, payments, total, status").eq("company_id", companyId).order("created_at", { ascending: false }).limit(5),
        supabase.from("products").select("id, stock_quantity, min_stock").eq("company_id", companyId),
        supabase.from("financial_entries").select("id").eq("company_id", companyId).eq("status", "pendente").lte("due_date", today),
        supabase.from("fiscal_configs").select("id").eq("company_id", companyId).eq("is_active", true).limit(1),
        supabase.from("financial_entries").select("type, amount").eq("company_id", companyId).eq("status", "pago").gte("due_date", monthStart),
        supabase.from("sales").select("total, created_at").eq("company_id", companyId).gte("created_at", sevenDaysAgo + "T00:00:00").or("status.is.null,status.neq.cancelled").order("created_at", { ascending: true }),
        supabase.from("sales").select("total").eq("company_id", companyId).gte("created_at", fourteenDaysAgo + "T00:00:00").lt("created_at", sevenDaysAgo + "T00:00:00").or("status.is.null,status.neq.cancelled"),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("sale_items").select("product_name, quantity, unit_price, sale_id, sales!inner(company_id, created_at)").eq("sales.company_id", companyId).gte("sales.created_at", monthStart + "T00:00:00").limit(500),
        // Yesterday sales
        supabase.from("sales").select("total").eq("company_id", companyId).gte("created_at", yesterday + "T00:00:00").lt("created_at", today + "T00:00:00").or("status.is.null,status.neq.cancelled"),
        // Fiado — use clients with actual outstanding credit_balance
        supabase.from("clients").select("credit_balance").eq("company_id", companyId).gt("credit_balance", 0),
        // Bills due today (contas a pagar)
        supabase.from("financial_entries").select("amount").eq("company_id", companyId).eq("status", "pendente").eq("type", "pagar").eq("due_date", today),
        // Overdue bills (contas a pagar vencidas — last 180 days only)
        supabase.from("financial_entries").select("amount").eq("company_id", companyId).eq("status", "pendente").eq("type", "pagar").lt("due_date", today).gte("due_date", (() => { const d = new Date(); d.setDate(d.getDate() - 180); return d.toISOString().split("T")[0]; })()),
      ]);

      const todaySales = salesResult.data || [];
      const monthSales = monthResult.data || [];

      const salesToday = todaySales.reduce((sum, s: any) => sum + Number(s.total || 0), 0);
      const salesCountToday = todaySales.length;
      const ticketMedio = salesCountToday > 0 ? salesToday / salesCountToday : 0;
      const monthRevenue = monthSales.reduce((sum, s: any) => sum + Number(s.total || 0), 0);

      // Yesterday
      const yesterdaySales = yesterdayResult.data || [];
      const salesYesterday = yesterdaySales.reduce((sum, s: any) => sum + Number(s.total || 0), 0);
      const salesCountYesterday = yesterdaySales.length;

      // Fiado
      const fiadoData = fiadoResult.data || [];
      const fiadoTotal = fiadoData.reduce((sum, s: any) => sum + Number(s.total || 0), 0);
      const fiadoCount = fiadoData.length;

      // Bills
      const billsDueData = billsDueResult.data || [];
      const billsDueToday = billsDueData.reduce((sum, e: any) => sum + Number(e.amount || 0), 0);
      const billsDueTodayCount = billsDueData.length;

      const overdueData = overdueBillsResult.data || [];
      const overdueBills = overdueData.reduce((sum, e: any) => sum + Number(e.amount || 0), 0);
      const overdueBillsCount = overdueData.length;

      const products = productsResult.data || [];
      const productsAtRisk = products.filter((p: any) => p.min_stock > 0 && (p.stock_quantity ?? 0) <= p.min_stock).length;
      const activeAlerts = (alertsResult.data || []).length;
      const fiscalProtected = (fiscalResult.data || []).length > 0;

      const financialEntries = financialResult.data || [];
      const receitas = financialEntries.filter((e: any) => e.type === "receber").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
      const despesas = financialEntries.filter((e: any) => e.type === "pagar").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
      const monthProfit = receitas > 0 || despesas > 0 ? receitas - despesas : monthRevenue * 0.3;

      let healthScore = 50;
      if (monthRevenue > 0) healthScore += 15;
      if (productsAtRisk === 0) healthScore += 15;
      if (activeAlerts === 0) healthScore += 10;
      if (fiscalProtected) healthScore += 10;
      healthScore = Math.min(100, healthScore);

      // Last 7 days aggregation
      const last7Data = last7Result.data || [];
      const dayMap: Record<string, { total: number; count: number }> = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const key = d.toISOString().split("T")[0];
        dayMap[key] = { total: 0, count: 0 };
      }
      last7Data.forEach((s: any) => {
        const key = (s.created_at || "").split("T")[0];
        if (dayMap[key]) {
          dayMap[key].total += Number(s.total || 0);
          dayMap[key].count += 1;
        }
      });
      const last7Days: DailySales[] = Object.entries(dayMap).map(([date, v]) => ({
        date,
        total: v.total,
        count: v.count,
      }));

      // Sales growth
      const currentPeriodTotal = last7Data.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const prevPeriodTotal = (prevPeriodResult.data || []).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      const salesGrowth = prevPeriodTotal > 0 ? ((currentPeriodTotal - prevPeriodTotal) / prevPeriodTotal) * 100 : 0;

      // Top products
      const productMap: Record<string, { quantity: number; revenue: number }> = {};
      (saleItemsResult.data || []).forEach((item: any) => {
        const name = item.product_name || "Sem nome";
        if (!productMap[name]) productMap[name] = { quantity: 0, revenue: 0 };
        productMap[name].quantity += Number(item.quantity || 0);
        productMap[name].revenue += Number(item.quantity || 0) * Number(item.unit_price || 0);
      });
      const topProducts: TopProduct[] = Object.entries(productMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

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
        totalProducts: totalProductsResult.count || 0,
        totalClients: totalClientsResult.count || 0,
        salesGrowth,
        last7Days,
        topProducts,
        salesYesterday,
        salesCountYesterday,
        fiadoTotal,
        fiadoCount,
        billsDueToday,
        billsDueTodayCount,
        overdueBills,
        overdueBillsCount,
        recentSales: (recentResult.data || []).map((row: any) => ({
          id: row.id,
          number: row.sale_number || row.number,
          payment_method: extractPaymentMethod(row.payments),
          total_value: row.total ?? 0,
          status: row.status || "completed",
        })),
      };
    },
    enabled: !!companyId,
  });
}
