import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";

interface FlagRow {
  description: string | null;
  enabled: boolean;
}

/**
 * Banner global de manutenção. Lido diretamente da tabela feature_flags
 * (key = "maintenance_mode"). Só renderiza quando a flag está habilitada.
 *
 * - Acessível para anônimos (policy SELECT anon permite).
 * - Cache de 30s para não spammar o banco.
 * - Fail-safe: em caso de erro, não mostra nada.
 */
export function MaintenanceBanner() {
  const { data } = useQuery({
    queryKey: ["maintenance-mode"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags" as never)
        .select("description, enabled")
        .eq("key", "maintenance_mode")
        .maybeSingle();
      if (error) return null;
      return data as FlagRow | null;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    retry: 0,
  });

  if (!data?.enabled) return null;

  const message =
    data.description?.trim() ||
    "Estamos realizando uma manutenção programada. Algumas funcionalidades podem ficar temporariamente indisponíveis.";

  return (
    <div
      role="alert"
      aria-live="polite"
      className="w-full bg-amber-500/95 text-amber-950 dark:bg-amber-600 dark:text-amber-50 border-b border-amber-700/40 shadow-sm"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center gap-2 text-xs sm:text-sm">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="font-medium">Modo manutenção:</span>
        <span className="truncate">{message}</span>
      </div>
    </div>
  );
}
