import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTS_ACTIVE_OR_LEGACY_NULL } from "@/lib/product-active-filter";
import { fetchMyCompanyMemberships } from "@/lib/company-memberships";
import { useAuth } from "./useAuth";
import { format, startOfMonth, endOfMonth } from "date-fns";

export interface BranchSummary {
  companyId: string;
  companyName: string;
  totalSales: number;
  salesCount: number;
  totalProducts: number;
  totalClients: number;
}

export interface ConsolidatedReport {
  branches: BranchSummary[];
  totalSales: number;
  totalSalesCount: number;
  totalProducts: number;
  totalClients: number;
}

export function useConsolidatedReport(dateFrom?: Date, dateTo?: Date) {
  const { user } = useAuth();
  const from = dateFrom || startOfMonth(new Date());
  const to = dateTo || endOfMonth(new Date());

  return useQuery({
    queryKey: ["consolidated-report", user?.id, format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd")],
    queryFn: async (): Promise<ConsolidatedReport> => {
      if (!user) throw new Error("Não autenticado");

      type CompanyRow = { id: string; name: string };
      type SaleRow = { total: number | string | null };

      let memberships: Awaited<ReturnType<typeof fetchMyCompanyMemberships>>;
      try {
        memberships = await fetchMyCompanyMemberships(user.id);
      } catch {
        return { branches: [], totalSales: 0, totalSalesCount: 0, totalProducts: 0, totalClients: 0 };
      }
      const companyIds = memberships.filter((m) => m.is_active).map((m) => m.company_id);
      if (companyIds.length === 0) {
        return { branches: [], totalSales: 0, totalSalesCount: 0, totalProducts: 0, totalClients: 0 };
      }

      // Get company names
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name")
        .in("id", companyIds);

      const nameMap = new Map((companies || []).map((c: CompanyRow) => [c.id, c.name]));

      // Fetch data for all companies in parallel
      const branches: BranchSummary[] = await Promise.all(
        companyIds.map(async (cid: string) => {
          const [salesRes, productsRes, clientsRes] = await Promise.all([
            supabase
              .from("sales")
              .select("id, total")
              .eq("company_id", cid)
              .gte("created_at", from.toISOString())
              .lte("created_at", to.toISOString())
              .or("status.is.null,status.neq.cancelled"),
            supabase
              .from("products")
              .select("id", { count: "exact", head: true })
              .eq("company_id", cid)
              .or(PRODUCTS_ACTIVE_OR_LEGACY_NULL),
            supabase
              .from("clients")
              .select("id", { count: "exact", head: true })
              .eq("company_id", cid),
          ]);

          const sales = salesRes.data || [];
          const totalSales = sales.reduce((sum: number, s: SaleRow) => sum + Number(s.total ?? 0), 0);

          return {
            companyId: cid,
            companyName: nameMap.get(cid) || "Filial",
            totalSales,
            salesCount: sales.length,
            totalProducts: productsRes.count || 0,
            totalClients: clientsRes.count || 0,
          };
        })
      );

      return {
        branches,
        totalSales: branches.reduce((s, b) => s + b.totalSales, 0),
        totalSalesCount: branches.reduce((s, b) => s + b.salesCount, 0),
        totalProducts: branches.reduce((s, b) => s + b.totalProducts, 0),
        totalClients: branches.reduce((s, b) => s + b.totalClients, 0),
      };
    },
    enabled: !!user,
  });
}
