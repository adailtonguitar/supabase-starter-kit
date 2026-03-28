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
  pendingReceivables: number;
  pendingReceivablesCount: number;
}

function extractPaymentMethod(payments: unknown): string {
  try {
    const arr: unknown[] =
      Array.isArray(payments) ? payments : typeof payments === "string" ? JSON.parse(payments) : [];

    if (!Array.isArray(arr) || arr.length === 0) return "";
    const first = arr[0] as Record<string, unknown>;
    return typeof first?.method === "string" ? first.method : "";
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

      // Merge sales queries: fetch all month sales once (covers today, yesterday, last7, prevPeriod)
      const [
        monthAllSalesResult, recentResult, productsResult, 
        fiscalResult, financialAllResult, saleItemsResult,
        totalProductsResult, totalClientsResult, fiadoResult,
      ] = await Promise.all([
        // Single query: all sales from 14 days ago (covers today, yesterday, 7d, prev period, month)
        supabase.from("sales").select("total, created_at, status").eq("company_id", companyId).gte("created_at", fourteenDaysAgo + "T00:00:00").in("status", ["completed", "finalizada"]).order("created_at", { ascending: true }),
        supabase.from("sales").select("id, sale_number, payments, total, status").eq("company_id", companyId).order("created_at", { ascending: false }).limit(5),
        supabase.from("products").select("id, stock_quantity, min_stock").eq("company_id", companyId).eq("is_active", true),
        supabase.from("fiscal_configs").select("id").eq("company_id", companyId).eq("is_active", true).limit(1),
        // Single query: all financial entries (covers alerts, bills, overdue, receivables)
        supabase.from("financial_entries").select("type, amount, status, due_date").eq("company_id", companyId).gte("due_date", (() => { const d = new Date(); d.setDate(d.getDate() - 180); return d.toISOString().split("T")[0]; })()),
        supabase.from("sale_items").select("product_name, quantity, unit_price, sale_id, created_at:sales(created_at)").eq("company_id", companyId).gte("sales.created_at", monthStart + "T00:00:00").limit(500),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("is_active", true),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("clients").select("credit_balance").eq("company_id", companyId).gt("credit_balance", 0),
      ]);

      // Partition sales by date ranges client-side
      type MonthAllSaleRow = {
        created_at?: string | null;
        total?: number | null;
        status?: string | null;
      };
      const allSales = (monthAllSalesResult.data ?? []) as MonthAllSaleRow[];

      // Debug: log today's sales to identify duplicates/test data
      const todayPrefix = today;
      const todaySales = allSales.filter((s) => (s.created_at || "").startsWith(todayPrefix));
      console.log(`[Dashboard] Vendas hoje: ${todaySales.length} registros, total: R$ ${todaySales.reduce((s, v) => s + Number(v.total ?? 0), 0).toFixed(2)}`, todaySales.map(s => ({ total: s.total, status: s.status, created_at: s.created_at })));
      const yesterdayPrefix = yesterday;
      const yesterdaySales = allSales.filter((s) => {
        const d = (s.created_at || "").split("T")[0];
        return d === yesterdayPrefix;
      });
      const monthSales = allSales.filter((s) => (s.created_at || "") >= monthStart + "T00:00:00");
      const last7Data = allSales.filter((s) => (s.created_at || "") >= sevenDaysAgo + "T00:00:00");
      const prevPeriodData = allSales.filter((s) => {
        const ca = s.created_at || "";
        return ca >= fourteenDaysAgo + "T00:00:00" && ca < sevenDaysAgo + "T00:00:00";
      });

      // Partition financial entries client-side
      type FinancialEntryRow = {
        status: string;
        due_date: string;
        type: "pagar" | "receber" | string;
        amount?: number | null;
      };
      const allFinancial = (financialAllResult.data ?? []) as FinancialEntryRow[];
      const alertsData = allFinancial.filter((e) => e.status === "pendente" && e.due_date <= today);
      const financialPaidMonth = allFinancial.filter((e) => e.status === "pago" && e.due_date >= monthStart);
      const billsDueData = allFinancial.filter((e) => e.status === "pendente" && e.type === "pagar" && e.due_date === today);
      const overdueData = allFinancial.filter(
        (e) => (e.status === "pendente" || e.status === "vencido") && e.type === "pagar" && e.due_date < today
      );
      const receivablesData = allFinancial.filter((e) => (e.status === "pendente" || e.status === "vencido") && e.type === "receber");

      const salesToday = todaySales.reduce((sum: number, s) => sum + Number(s.total ?? 0), 0);
      const salesCountToday = todaySales.length;
      const ticketMedio = salesCountToday > 0 ? salesToday / salesCountToday : 0;
      const monthRevenue = monthSales.reduce((sum: number, s) => sum + Number(s.total ?? 0), 0);

      // Yesterday
      const salesYesterday = yesterdaySales.reduce((sum: number, s) => sum + Number(s.total ?? 0), 0);
      const salesCountYesterday = yesterdaySales.length;

      // Fiado — from clients with outstanding balance
      type FiadoClientRow = { credit_balance?: number | null };
      const fiadoData = (fiadoResult.data ?? []) as FiadoClientRow[];
      const fiadoTotal = fiadoData.reduce((sum: number, c) => sum + Number(c.credit_balance ?? 0), 0);
      const fiadoCount = fiadoData.length;

      // Bills
      const billsDueToday = billsDueData.reduce((sum: number, e) => sum + Number(e.amount ?? 0), 0);
      const billsDueTodayCount = billsDueData.length;

      const overdueBills = overdueData.reduce((sum: number, e) => sum + Number(e.amount ?? 0), 0);
      const overdueBillsCount = overdueData.length;

      const pendingReceivables = receivablesData.reduce((sum: number, e) => sum + Number(e.amount ?? 0), 0);
      const pendingReceivablesCount = receivablesData.length;

      type ProductRiskRow = { min_stock: number; stock_quantity?: number | null };
      const products = (productsResult.data ?? []) as ProductRiskRow[];
      const productsAtRisk = products.filter((p) => p.min_stock > 0 && (p.stock_quantity ?? 0) <= p.min_stock).length;
      const activeAlerts = alertsData.length;
      const fiscalProtected = (fiscalResult.data || []).length > 0;

      const receitas = financialPaidMonth
        .filter((e) => e.type === "receber")
        .reduce((s: number, e) => s + Number(e.amount ?? 0), 0);
      const despesas = financialPaidMonth
        .filter((e) => e.type === "pagar")
        .reduce((s: number, e) => s + Number(e.amount ?? 0), 0);
      // Use real financial data when available; otherwise show 0 instead of fabricated estimate
      const monthProfit = receitas > 0 || despesas > 0 ? receitas - despesas : 0;

      let healthScore = 50;
      if (monthRevenue > 0) healthScore += 15;
      if (productsAtRisk === 0) healthScore += 15;
      if (activeAlerts === 0) healthScore += 10;
      if (fiscalProtected) healthScore += 10;
      healthScore = Math.min(100, healthScore);

      // Last 7 days aggregation
      const dayMap: Record<string, { total: number; count: number }> = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const key = d.toISOString().split("T")[0];
        dayMap[key] = { total: 0, count: 0 };
      }
      last7Data.forEach((s) => {
        const key = (s.created_at || "").split("T")[0];
        if (dayMap[key]) {
          dayMap[key].total += Number(s.total ?? 0);
          dayMap[key].count += 1;
        }
      });
      const last7Days: DailySales[] = Object.entries(dayMap).map(([date, v]) => ({
        date,
        total: v.total,
        count: v.count,
      }));

      // Sales growth
      const currentPeriodTotal = last7Data.reduce((s: number, r) => s + Number(r.total ?? 0), 0);
      const prevPeriodTotal = prevPeriodData.reduce((s: number, r) => s + Number(r.total ?? 0), 0);
      const salesGrowth = prevPeriodTotal > 0 ? ((currentPeriodTotal - prevPeriodTotal) / prevPeriodTotal) * 100 : 0;

      // Top products
      const productMap: Record<string, { quantity: number; revenue: number }> = {};
      type SaleItemRow = { product_name?: string | null; quantity?: number | string | null; unit_price?: number | string | null };
      const saleItems = (saleItemsResult.data ?? []) as SaleItemRow[];
      saleItems.forEach((item) => {
        const name = item.product_name || "Sem nome";
        if (!productMap[name]) productMap[name] = { quantity: 0, revenue: 0 };
        productMap[name].quantity += Number(item.quantity ?? 0);
        productMap[name].revenue += Number(item.quantity ?? 0) * Number(item.unit_price ?? 0);
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
        pendingReceivables,
        pendingReceivablesCount,
        recentSales: (() => {
          type RecentSaleRow = {
            id: string;
            sale_number?: number | null;
            number?: number | null;
            payments?: unknown;
            total?: number | null;
            status?: string | null;
          };
          const rows = (recentResult.data ?? []) as RecentSaleRow[];
          return rows.map((row) => ({
            id: row.id,
            number: row.sale_number ?? row.number ?? null,
            payment_method: extractPaymentMethod(row.payments),
            total_value: row.total ?? 0,
            status: row.status || "completed",
          }));
        })(),
      };
    },
    enabled: !!companyId,
  });
}
