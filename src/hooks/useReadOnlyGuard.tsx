import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSubscription } from "./useSubscription";

/**
 * Guard para mutações críticas quando a assinatura está em modo somente-leitura
 * (grace_stage === "readonly", 4–14 dias pós-vencimento).
 *
 * Uso:
 *   const guard = useReadOnlyGuard();
 *   const onSave = () => {
 *     if (!guard("emitir nota fiscal")) return;
 *     // ... prossegue ...
 *   };
 */
export function useReadOnlyGuard() {
  const { readOnly, graceStage } = useSubscription();
  const navigate = useNavigate();

  return useCallback(
    (actionLabel = "essa ação"): boolean => {
      if (!readOnly && graceStage !== "readonly") return true;
      toast.error(
        `Não é possível ${actionLabel} enquanto sua assinatura estiver vencida. Renove para liberar.`,
        {
          action: { label: "Renovar", onClick: () => navigate("/minha-assinatura") },
          duration: 6000,
        },
      );
      return false;
    },
    [readOnly, graceStage, navigate],
  );
}
