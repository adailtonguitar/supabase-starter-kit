import { useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEMO_STORAGE_LIMIT_MB = 10; // 10MB total per demo account
const DEMO_FILE_SIZE_LIMIT_MB = 2; // 2MB per file

export function useDemoGuard() {
  const { companyId } = useCompany();

  const { data: isDemo = false } = useQuery({
    queryKey: ["is-demo-company", companyId],
    queryFn: async () => {
      if (!companyId) return false;
      const { data } = await supabase
        .from("companies")
        .select("is_demo")
        .eq("id", companyId)
        .maybeSingle();
      return data?.is_demo === true;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const guardAction = (actionName: string): boolean => {
    if (!isDemo) return true; // allowed
    toast.error(`${actionName} não disponível em contas de demonstração.`, {
      description: "Crie uma conta real e assine um plano para utilizar este recurso.",
    });
    return false; // blocked
  };

  const guardFileUpload = (file: File): boolean => {
    if (!isDemo) return true;
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > DEMO_FILE_SIZE_LIMIT_MB) {
      toast.error(`Arquivo muito grande para conta demo.`, {
        description: `Limite: ${DEMO_FILE_SIZE_LIMIT_MB}MB por arquivo. Seu arquivo: ${sizeMB.toFixed(1)}MB`,
      });
      return false;
    }
    return true;
  };

  return {
    isDemo,
    guardAction,
    guardFileUpload,
    DEMO_STORAGE_LIMIT_MB,
    DEMO_FILE_SIZE_LIMIT_MB,
  };
}
