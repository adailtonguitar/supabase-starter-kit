import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface InventoryCount {
  id: string;
  company_id: string;
  name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  performed_by: string;
  notes: string | null;
  created_at: string;
}

export interface InventoryCountItem {
  id: string;
  inventory_id: string;
  company_id: string;
  product_id: string;
  system_quantity: number;
  counted_quantity: number | null;
  difference: number;
  notes: string | null;
  counted_at: string | null;
  products?: { name: string; sku: string; unit: string };
}

export function useInventoryCounts() {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["inventory_counts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("inventory_counts")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as InventoryCount[];
    },
    enabled: !!companyId,
  });
}

export function useInventoryItems(inventoryId?: string) {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["inventory_items", inventoryId],
    queryFn: async () => {
      if (!companyId || !inventoryId) return [];
      const { data, error } = await supabase
        .from("inventory_count_items")
        .select("*, products(name, sku, unit)")
        .eq("inventory_id", inventoryId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as InventoryCountItem[];
    },
    enabled: !!companyId && !!inventoryId,
  });
}

export function useCreateInventory() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: { name: string; notes?: string }) => {
      if (!companyId || !user) throw new Error("Sem permissão");

      const { data: inventory, error } = await supabase
        .from("inventory_counts")
        .insert({
          company_id: companyId,
          name: params.name,
          performed_by: user.id,
          notes: params.notes,
        })
        .select()
        .single();
      if (error) throw error;

      const { data: products, error: pErr } = await supabase
        .from("products")
        .select("id, stock_quantity")
        .eq("company_id", companyId)
        .eq("is_active", true);
      if (pErr) throw pErr;

      if (products && products.length > 0) {
        const items = products.map((p: any) => ({
          inventory_id: (inventory as any).id,
          company_id: companyId,
          product_id: p.id,
          system_quantity: Number(p.stock_quantity),
        }));
        const { error: iErr } = await supabase.from("inventory_count_items").insert(items);
        if (iErr) throw iErr;
      }

      return inventory;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_counts"] });
      toast.success("Inventário criado com todos os produtos");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateInventoryItem() {
  const qc = useQueryClient();
  const { companyId } = useCompany();

  return useMutation({
    mutationFn: async (params: { id: string; counted_quantity: number; notes?: string }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { error } = await supabase
        .from("inventory_count_items")
        .update({
          counted_quantity: params.counted_quantity,
          notes: params.notes,
          counted_at: new Date().toISOString(),
        })
        .eq("id", params.id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_items"] });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useFinishInventory() {
  const qc = useQueryClient();
  const { companyId } = useCompany();

  return useMutation({
    mutationFn: async (inventoryId: string) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { error } = await supabase
        .from("inventory_counts")
        .update({ status: "finalizado", finished_at: new Date().toISOString() })
        .eq("id", inventoryId)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_counts"] });
      toast.success("Inventário finalizado");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
