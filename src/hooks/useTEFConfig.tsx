import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";

export interface TEFConfig {
  provider?: string;
  api_key?: string;
  terminal_id?: string;
}

export function useTEFConfig() {
  const { companyId } = useCompany();
  const { data: config } = useQuery({
    queryKey: ["tef-config", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("tef_config")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      return data as TEFConfig | null;
    },
    enabled: !!companyId,
  });
  return { config };
}
