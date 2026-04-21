import { useEffect, useState, useCallback } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useCompany } from "@/hooks/useCompany";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  endImpersonation,
  readImpersonation,
  type ImpersonationSession,
} from "@/lib/impersonation";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const POLL_INTERVAL_MS = 4000;

export function ImpersonationBanner() {
  const { isSuperAdmin } = useAdminRole();
  const { companyId, companyName, switchCompany } = useCompany();
  const [session, setSession] = useState<ImpersonationSession | null>(() => readImpersonation());
  const [exiting, setExiting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const id = setInterval(() => {
      const next = readImpersonation();
      setSession((prev) => {
        if (!prev && !next) return prev;
        if (prev && next && prev.logId === next.logId) return prev;
        return next;
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const exit = useCallback(async () => {
    if (!session) return;
    setExiting(true);
    try {
      const prev = session.previousCompanyId ?? null;
      await endImpersonation();
      setSession(null);
      if (prev) {
        switchCompany(prev);
      }
      toast.success("Você saiu do modo impersonation.");
      navigate("/admin");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao encerrar impersonation";
      toast.error(msg);
    }
    setExiting(false);
  }, [session, switchCompany, navigate]);

  if (!session) return null;
  if (!isSuperAdmin) return null;

  // Show label using the impersonated company's name; falls back to session metadata.
  const label = session.companyId === companyId
    ? (companyName || session.companyName || "esta empresa")
    : (session.companyName || "empresa alvo");

  return (
    <div className="sticky top-0 z-50 bg-destructive text-destructive-foreground">
      <div className="mx-auto max-w-screen-2xl px-3 sm:px-4 py-1.5 flex items-center gap-2 flex-wrap text-xs sm:text-sm">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span className="font-semibold">IMPERSONATION ATIVO:</span>
        <span className="truncate">
          Você está operando como <strong>{label}</strong>. Ações são auditadas.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 bg-background text-foreground hover:bg-background/90 border-transparent"
            onClick={exit}
            disabled={exiting}
          >
            <LogOut className="h-3.5 w-3.5 mr-1" />
            Sair do modo impersonation
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ImpersonationBanner;
