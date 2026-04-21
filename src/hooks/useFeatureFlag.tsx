import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";

/**
 * Hook para checar se uma feature flag está ativa.
 *
 * - Cache de 30s (staleTime) — flags mudam raramente.
 * - Fail-open: em caso de erro/timeout, retorna `true` para não derrubar o recurso.
 * - Filtra automaticamente pelo `companyId` corrente (respeita disabled_companies).
 *
 * @example
 *   const { isEnabled, isLoading } = useFeatureFlag("emit_nfce");
 *   if (!isEnabled) return <Alert>Emissão temporariamente desligada pela equipe AnthoSystem.</Alert>;
 */
export function useFeatureFlag(key: string) {
  const { companyId } = useCompany();

  const query = useQuery({
    queryKey: ["feature-flag", key, companyId ?? "no-company"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_feature_enabled", {
        p_key: key,
        p_company_id: companyId ?? null,
      });
      if (error) {
        console.warn(`[useFeatureFlag] Erro checando "${key}":`, error.message);
        return true; // fail-open
      }
      return Boolean(data);
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
    // Mesmo sem companyId queremos checar (flags globais como maintenance_mode).
    enabled: true,
    // Fail-open: se a query travar, assumimos habilitado.
    placeholderData: true,
  });

  return {
    isEnabled: query.data ?? true,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Variação que checa múltiplas flags de uma vez, em paralelo.
 * Útil para telas que condicionam muitos botões.
 */
export function useFeatureFlags<K extends string>(keys: readonly K[]): {
  flags: Record<K, boolean>;
  isLoading: boolean;
} {
  const { companyId } = useCompany();

  const query = useQuery({
    queryKey: ["feature-flags-batch", [...keys].sort().join(","), companyId ?? "no-company"],
    queryFn: async () => {
      const results = await Promise.all(
        keys.map(async (k) => {
          const { data, error } = await supabase.rpc("is_feature_enabled", {
            p_key: k,
            p_company_id: companyId ?? null,
          });
          if (error) return [k, true] as const;
          return [k, Boolean(data)] as const;
        }),
      );
      return Object.fromEntries(results) as Record<K, boolean>;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const defaults = Object.fromEntries(keys.map((k) => [k, true])) as Record<K, boolean>;

  return {
    flags: query.data ?? defaults,
    isLoading: query.isLoading,
  };
}
