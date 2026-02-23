import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface ActionLog {
  id: string;
  action: string;
  module: string;
  details: string | null;
  user_name: string | null;
  created_at: string;
}

export function useActionLogs() {
  const { companyId } = useCompany();
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["action-logs", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("action_logs")
        .select("id, action, module, details, created_at, user_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data || []).map((d: any) => ({ ...d, user_name: null })) as ActionLog[];
    },
    enabled: !!companyId,
  });
  return { logs, isLoading };
}
