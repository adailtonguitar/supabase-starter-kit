import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";
import { useAuth } from "@/hooks/useAuth";

export interface LoyaltyTransaction {
  id: string;
  client_id: string;
  type: string;
  points: number;
  balance_after: number;
  description: string;
  created_at: string;
}

export function useLoyalty() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["loyalty-config", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("loyalty_config")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!companyId,
  });

  const { data: topClients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["loyalty-clients", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("clients")
        .select("id, name, phone, cpf_cnpj, loyalty_points")
        .eq("company_id", companyId)
        .gt("loyalty_points", 0)
        .order("loyalty_points", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: recentTransactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ["loyalty-transactions", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("loyalty_transactions")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data || []) as LoyaltyTransaction[];
    },
    enabled: !!companyId,
  });

  const isActive = config?.is_active ?? false;

  const saveConfig = async (form: any) => {
    if (!companyId) return;
    const payload = { ...form, company_id: companyId };
    if (config?.id) {
      await supabase.from("loyalty_config").update(payload).eq("id", config.id).eq("company_id", companyId);
    } else {
      await supabase.from("loyalty_config").insert(payload);
    }
    toast.success("Configuração salva!");
    qc.invalidateQueries({ queryKey: ["loyalty-config"] });
  };

  const earnPoints = async (_clientId: string, _total: number, _docId?: string) => 0;

  return {
    config,
    configLoading,
    topClients,
    clientsLoading,
    recentTransactions,
    transactionsLoading,
    isActive,
    saveConfig,
    earnPoints,
  };
}
