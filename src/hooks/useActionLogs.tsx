import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useState } from "react";

export interface ActionLog {
  id: string;
  action: string;
  module: string;
  details: string | null;
  user_name: string | null;
  created_at: string;
}

const PAGE_SIZE = 100;

export function useActionLogs() {
  const { companyId } = useCompany();
  const [page, setPage] = useState(0);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["action-logs", companyId, page],
    queryFn: async () => {
      if (!companyId) return [];
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data } = await supabase
        .from("action_logs")
        .select("id, action, module, details, created_at, user_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(from, to);
      return (data || []).map((d: any) => ({ ...d, user_name: null })) as ActionLog[];
    },
    enabled: !!companyId,
  });

  const hasMore = logs.length === PAGE_SIZE;
  const nextPage = () => setPage((p) => p + 1);
  const prevPage = () => setPage((p) => Math.max(0, p - 1));

  return { logs, isLoading, page, hasMore, nextPage, prevPage };
}
