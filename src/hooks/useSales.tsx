import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";

export interface SaleItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount_percent?: number;
}

export interface Sale {
  id: string;
  number?: number;
  payment_method?: string;
  total_value: number;
  status: string;
  created_at: string;
  items: SaleItem[];
  customer_name?: string;
  access_key?: string;
  company_id: string;
}

export function useSales(limit = 50) {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["sales", companyId, limit],
    queryFn: async () => {
      if (!companyId) return [];

      // Fetch sales
      const { data: salesData, error } = await supabase
        .from("sales")
        .select("id, sale_number, total, status, created_at, payments, client_name, access_key, company_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      if (!salesData?.length) return [];

      // Fetch sale_items for all sales in batches
      const saleIds = salesData.map((s: any) => s.id);
      const BATCH = 20;
      let allItems: any[] = [];
      for (let i = 0; i < saleIds.length; i += BATCH) {
        const batch = saleIds.slice(i, i + BATCH);
        const { data: items } = await supabase
          .from("sale_items")
          .select("sale_id, product_id, product_name, quantity, unit_price, subtotal, discount_percent")
          .in("sale_id", batch);
        if (items) allItems.push(...items);
      }

      // Group items by sale_id
      const itemsBySale: Record<string, SaleItem[]> = {};
      allItems.forEach((item: any) => {
        if (!itemsBySale[item.sale_id]) itemsBySale[item.sale_id] = [];
        itemsBySale[item.sale_id].push({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          subtotal: Number(item.subtotal),
          discount_percent: Number(item.discount_percent || 0),
        });
      });

      return salesData.map((row: any) => ({
        id: row.id,
        number: row.sale_number,
        payment_method: extractPaymentMethod(row.payments),
        total_value: row.total ?? 0,
        status: row.status || "completed",
        created_at: row.created_at,
        items: itemsBySale[row.id] || [],
        customer_name: row.client_name,
        access_key: row.access_key,
        company_id: row.company_id,
      })) as Sale[];
    },
    enabled: !!companyId,
  });
}

function extractPaymentMethod(payments: any): string {
  try {
    const arr = Array.isArray(payments) ? payments : typeof payments === "string" ? JSON.parse(payments) : [];
    if (arr.length > 0) return arr[0].method || "";
  } catch {}
  return "";
}
