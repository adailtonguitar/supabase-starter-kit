/** Stub: useLocalClients — falls back to Supabase query */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";

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
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      return (data as LocalClient[]) || [];
    },
    enabled: !!companyId,
  });
}
