import { AlertTriangle, Crown, X, Loader2 } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAdminRole } from "@/hooks/useAdminRole";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function SubscriptionBanner() {
  const { gracePeriodActive, graceDaysLeft, trialActive, trialDaysLeft, createCheckout, loading: subLoading } = useSubscription();
  const { isSuperAdmin, loading: adminLoading } = useAdminRole();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem("sub_banner_dismissed") === "1"; } catch { return false; }
  });
  const [renewing, setRenewing] = useState(false);
  const navigate = useNavigate();

  const handleRenew = async (plan?: string) => {
    try {
      if (!plan) {
        navigate("/renovar");
        return;
      }
      setRenewing(true);
      await createCheckout(plan);
    } catch {
      toast.error("Erro ao abrir checkout. Tente novamente.");
    } finally {
      setRenewing(false);
    }
  };


  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem("sub_banner_dismissed", "1"); } catch { /* */ }
  };

  const bannerType = useMemo(() => {
    if (adminLoading || subLoading) return null;
    if (isSuperAdmin) return null;
    if (gracePeriodActive && graceDaysLeft !== null) return "grace";
    if (trialActive && trialDaysLeft !== null && trialDaysLeft <= 5) return "trial";
    return null;
  }, [adminLoading, subLoading, isSuperAdmin, gracePeriodActive, graceDaysLeft, trialActive, trialDaysLeft]);

  const [visibleBannerType, setVisibleBannerType] = useState<string | null>(null);
  const [hasSettled, setHasSettled] = useState(false);
  const settledOnceRef = useRef(false);

  // Once subscription data settles the first time, never reset — prevents flash on navigation
  useEffect(() => {
    if (settledOnceRef.current) return;

    if (adminLoading || subLoading) {
      setVisibleBannerType(null);
      return;
    }

    const settleTimer = window.setTimeout(() => {
      setHasSettled(true);
      settledOnceRef.current = true;
    }, 1200);

    return () => window.clearTimeout(settleTimer);
  }, [adminLoading, subLoading]);

  useEffect(() => {
    if (!hasSettled) return;

    if (!bannerType) {
      setVisibleBannerType(null);
      return;
    }

    setVisibleBannerType(bannerType);
  }, [bannerType, hasSettled]);

  if (dismissed || !visibleBannerType) return null;

  if (visibleBannerType === "grace") {
    return (
      <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-destructive font-medium">
            Assinatura vencida! Restam {graceDaysLeft} dia{graceDaysLeft !== 1 ? "s" : ""} de carência.{" "}
            <button onClick={() => handleRenew()} disabled={renewing} className="underline font-bold inline-flex items-center gap-1">
              {renewing && <Loader2 className="w-3 h-3 animate-spin" />}
              Renovar agora
            </button>
          </span>
        </div>
      </div>
    );
  }

  if (visibleBannerType === "trial") {
    return (
      <div className="bg-gradient-to-r from-primary/10 to-warning/10 border-b border-primary/20 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Crown className="w-4 h-4 text-primary shrink-0" />
          <span className="text-foreground font-medium">
            🚀 Você está usando o <strong>plano Pro completo</strong> por mais {trialDaysLeft} dia{trialDaysLeft !== 1 ? "s" : ""}.{" "}
            <button onClick={() => navigate("/renovar")} className="underline font-bold text-primary">
              Assinar agora e não perder acesso
            </button>
          </span>
        </div>
        <button onClick={dismiss} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return null;
}
