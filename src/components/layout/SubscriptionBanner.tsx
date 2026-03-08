import { AlertTriangle, Clock, Crown, X, Loader2 } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAdminRole } from "@/hooks/useAdminRole";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function SubscriptionBanner() {
  const { subscribed, planKey, daysUntilExpiry, gracePeriodActive, graceDaysLeft, trialActive, trialDaysLeft, createCheckout, loading: subLoading } = useSubscription();
  const { isSuperAdmin, loading: adminLoading } = useAdminRole();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem("sub_banner_dismissed") === "1"; } catch { return false; }
  });
  const [renewing, setRenewing] = useState(false);
  const navigate = useNavigate();

  const handleRenew = async (plan?: string) => {
    try {
      setRenewing(true);
      await createCheckout(plan || planKey || "essencial");
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
    if (subscribed && daysUntilExpiry !== null && daysUntilExpiry <= 5) return "expiry";
    if (gracePeriodActive && graceDaysLeft !== null) return "grace";
    if (trialActive && trialDaysLeft !== null && trialDaysLeft <= 5) return "trial";
    if (subscribed && planKey === "essencial") return "upgrade";
    return null;
  }, [adminLoading, subLoading, isSuperAdmin, subscribed, daysUntilExpiry, gracePeriodActive, graceDaysLeft, trialActive, trialDaysLeft, planKey]);

  const [visibleBannerType, setVisibleBannerType] = useState<string | null>(null);
  const [hasSettled, setHasSettled] = useState(false);

  // Wait for subscription data to fully settle before showing any banner
  useEffect(() => {
    if (adminLoading || subLoading) {
      setHasSettled(false);
      setVisibleBannerType(null);
      return;
    }

    // Data loaded — wait 1.5s to ensure it's stable (avoids flash on navigation)
    const settleTimer = window.setTimeout(() => {
      setHasSettled(true);
    }, 1500);

    return () => window.clearTimeout(settleTimer);
  }, [adminLoading, subLoading]);

  useEffect(() => {
    if (!hasSettled) {
      setVisibleBannerType(null);
      return;
    }

    if (!bannerType) {
      setVisibleBannerType(null);
      return;
    }

    setVisibleBannerType(bannerType);
  }, [bannerType, hasSettled]);

  if (dismissed || !visibleBannerType) return null;

  if (visibleBannerType === "expiry") {
    return (
      <div className="bg-warning/10 border-b border-warning/30 px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-warning shrink-0" />
          <span className="text-warning font-medium">
            Sua assinatura vence em {daysUntilExpiry} dia{daysUntilExpiry !== 1 ? "s" : ""}.{" "}
            <button onClick={() => handleRenew()} disabled={renewing} className="underline font-bold inline-flex items-center gap-1">
              {renewing && <Loader2 className="w-3 h-3 animate-spin" />}
              Renovar agora
            </button>
          </span>
        </div>
        <button onClick={dismiss} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

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

  if (visibleBannerType === "upgrade") {
    return (
      <div className="bg-primary/5 border-b border-primary/20 px-4 py-1.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Crown className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-primary/80 text-xs font-medium">
            Desbloqueie relatórios IA, fidelidade e mais.{" "}
            <button onClick={() => navigate("/configuracoes")} className="underline font-bold text-primary">
              Fazer upgrade
            </button>
          </span>
        </div>
        <button onClick={dismiss} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return null;
}
