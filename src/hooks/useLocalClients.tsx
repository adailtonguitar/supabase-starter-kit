/**
 * useLocalClients — Offline-first client access.
 * Reads from Supabase when online, falls back to IndexedDB cache when offline.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { cacheSet, cacheGet } from "@/lib/offline-cache";

export interface LocalClient {
  id: string;
  company_id: string;
  name: string;
  cpf_cnpj: string | null;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  tipo_pessoa: string;
  trade_name: string | null;
  ie: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_ibge_code: string | null;
  credit_limit: number | null;
  credit_balance: number | null;
  loyalty_points: number;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export function useLocalClients() {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["local-clients", companyId],
    queryFn: async (): Promise<LocalClient[]> => {
      if (!companyId) return [];

      // Online: fetch from Supabase and update cache
      if (navigator.onLine) {
        try {
          const { data, error } = await supabase
            .from("clients")
            .select("*")
            .eq("company_id", companyId)
            .eq("is_active", true)
            .order("name");
          if (error) throw error;
          const clients = (data as LocalClient[]) || [];
          // Update IndexedDB cache in background
          cacheSet("clients", companyId, clients).catch(() => {});
          return clients;
        } catch (err) {
          console.warn("[useLocalClients] Online fetch failed, trying cache:", err);
        }
      }

      // Offline or fetch failed: read from IndexedDB
      const cached = await cacheGet<LocalClient[]>("clients", companyId);
      if (cached) {
        console.log(`[useLocalClients] Serving ${cached.data.length} clients from cache (stale: ${cached.stale})`);
        return cached.data;
      }

      return [];
    },
    enabled: !!companyId,
    staleTime: navigator.onLine ? 30_000 : Infinity,
    retry: navigator.onLine ? 1 : 0,
  });
}
