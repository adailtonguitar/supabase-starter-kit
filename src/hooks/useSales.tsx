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
  ncm?: string;
  cfop?: string;
  csosn?: string;
  cst_icms?: string;
  unit?: string;
}

export interface Sale {
  id: string;
  number?: number;
  payment_method?: string;
  total_value: number;
  status: string;
  created_at: string;
  items: SaleItem[];
  items_json?: unknown;
  customer_name?: string;
  customer_doc?: string;
  access_key?: string;
  company_id: string;
}

function parseRawSaleItems(raw: unknown): SaleItem[] {
  try {
    const parsed = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? JSON.parse(raw)
        : raw && typeof raw === "object" && "items" in (raw as Record<string, unknown>)
          ? (raw as Record<string, unknown>).items
          : [];

    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        product_id: String(row.product_id ?? row.id ?? ""),
        product_name: String(row.product_name ?? row.name ?? "Produto"),
        quantity: Number(row.quantity ?? row.qty ?? 1),
        unit_price: Number(row.unit_price ?? row.price ?? 0),
        subtotal: Number(row.subtotal ?? ((Number(row.quantity ?? row.qty ?? 1) * Number(row.unit_price ?? row.price ?? 0)))),
        discount_percent: Number(row.discount_percent ?? 0),
        ncm: typeof row.ncm === "string" ? row.ncm : undefined,
        cfop: typeof row.cfop === "string" ? row.cfop : undefined,
        csosn: typeof row.csosn === "string" ? row.csosn : undefined,
        cst_icms: typeof row.cst_icms === "string" ? row.cst_icms : typeof row.cst === "string" ? row.cst : undefined,
        unit: typeof row.unit === "string" ? row.unit : undefined,
      };
    });
  } catch {
    return [];
  }
}

export function useSales(limit = 50) {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["sales", companyId, limit],
    queryFn: async () => {
      if (!companyId) return [];

      // Use * here because the sales schema has evolved and older explicit selects
      // can fail when optional fields differ between environments.
      const { data: salesData, error } = await supabase
        .from("sales")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      if (!salesData?.length) return [];

      type SaleDbRow = {
        id: string;
        sale_number?: number | null;
        number?: number | null;
        items?: unknown;
        payment_method?: string | null;
        payments?: unknown;
        total?: number | null;
        total_value?: number | null;
        status?: string | null;
        created_at: string;
        client_name?: string | null;
        customer_name?: string | null;
        customer_doc?: string | null;
        customer_cpf?: string | null;
        counterpart?: string | null;
        access_key?: string | null;
        company_id: string;
      };

      const sales = salesData as SaleDbRow[];
      const saleIds = sales.map((s) => s.id).filter(Boolean);
      const BATCH = 20;
      type SaleItemDbRow = {
        sale_id: string;
        product_id: string;
        product_name: string;
        quantity: number | string;
        unit_price: number | string;
        subtotal: number | string;
        discount_percent?: number | string | null;
      };

      let allItems: SaleItemDbRow[] = [];

      for (let i = 0; i < saleIds.length; i += BATCH) {
        const batch = saleIds.slice(i, i + BATCH);
        const { data: items, error: itemsError } = await supabase
          .from("sale_items")
          .select("sale_id, product_id, product_name, quantity, unit_price, subtotal, discount_percent")
          .in("sale_id", batch);

        if (itemsError) throw itemsError;
        if (items) allItems.push(...(items as SaleItemDbRow[]));
      }

      const itemsBySale: Record<string, SaleItem[]> = {};
      allItems.forEach((item) => {
        if (!itemsBySale[item.sale_id]) itemsBySale[item.sale_id] = [];
        itemsBySale[item.sale_id].push({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          subtotal: Number(item.subtotal),
          discount_percent: Number(item.discount_percent ?? 0),
        });
      });

      return sales.map((row) => ({
        const rawItems = parseRawSaleItems(row.items);
        id: row.id,
        number: row.sale_number ?? row.number ?? undefined,
        payment_method: row.payment_method || extractPaymentMethod(row.payments),
        total_value: Number(row.total ?? row.total_value ?? 0),
        status: row.status || "completed",
        created_at: row.created_at,
        items: rawItems.length > 0 ? rawItems : (itemsBySale[row.id] || []),
        items_json: row.items,
        customer_name: row.client_name ?? row.customer_name ?? row.counterpart ?? undefined,
        customer_doc: row.customer_doc ?? row.customer_cpf ?? undefined,
        access_key: row.access_key ?? undefined,
        company_id: row.company_id,
      })) as Sale[];
    },
    enabled: !!companyId,
  });
}

function extractPaymentMethod(payments: unknown): string {
  try {
    const arr: unknown[] =
      Array.isArray(payments) ? payments
      : typeof payments === "string"
        ? JSON.parse(payments)
        : [];

    if (!Array.isArray(arr) || arr.length === 0) return "";
    const first = arr[0] as Record<string, unknown>;
    return typeof first?.method === "string" ? first.method : "";
  } catch {
    return "";
  }
}
