import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";

export interface ProductKit {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  progressive_discount: boolean;
  is_active: boolean;
  created_at: string;
  items?: ProductKitItem[];
}

export interface ProductKitItem {
  id: string;
  kit_id: string;
  product_id: string;
  quantity: number;
  sort_order: number;
  product?: { name: string; price: number; image_url?: string };
}

export function useProductKits() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["product_kits", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await (supabase as any)
        .from("product_kits")
        .select("*, product_kit_items(*, products(name, price, image_url))")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []).map((kit: any) => ({
        ...kit,
        items: (kit.product_kit_items || []).map((item: any) => ({
          ...item,
          product: item.products,
        })),
      })) as ProductKit[];
    },
    enabled: !!companyId,
  });
}

export function useCreateKit() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return useMutation({
    mutationFn: async (kit: Omit<Partial<ProductKit>, 'items'> & { items: { product_id: string; quantity: number }[] }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { items, ...kitData } = kit;
      const { data, error } = await (supabase as any)
        .from("product_kits")
        .insert({ ...kitData, company_id: companyId })
        .select()
        .single();
      if (error) throw error;
      if (items?.length) {
        const kitItems = items.map((item, i) => ({ kit_id: data.id, product_id: item.product_id, quantity: item.quantity, sort_order: i }));
        await (supabase as any).from("product_kit_items").insert(kitItems);
      }
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["product_kits"] }); toast.success("Kit criado com sucesso"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("product_kits").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["product_kits"] }); toast.success("Kit removido"); },
  });
}
