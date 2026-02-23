import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const TRIAL_DAYS = 8;
const GRACE_PERIOD_DAYS = 3;

export const PLANS = {
  essencial: { key: "essencial", name: "Essencial", price: 149.90 },
  profissional: { key: "profissional", name: "Profissional", price: 199.90 },
} as const;

interface SubscriptionState {
  subscribed: boolean;
  planKey: string | null;
  subscriptionEnd: string | null;
  loading: boolean;
  trialActive: boolean;
  trialDaysLeft: number | null;
  trialExpired: boolean;
  wasSubscriber: boolean;
  subscriptionOverdue: boolean;
  gracePeriodActive: boolean;
  graceDaysLeft: number | null;
  daysUntilExpiry: number | null;
  blocked: boolean;
  blockReason: string | null;
}

interface SubscriptionContextType extends SubscriptionState {
  checkSubscription: () => Promise<void>;
  createCheckout: (planKey: string) => Promise<void>;
  openCustomerPortal: () => Promise<void>;
}

const defaultState: SubscriptionState = {
  subscribed: false, planKey: null, subscriptionEnd: null, loading: true,
  trialActive: false, trialDaysLeft: null, trialExpired: false,
  wasSubscriber: false, subscriptionOverdue: false, gracePeriodActive: false,
  graceDaysLeft: null, daysUntilExpiry: null, blocked: false, blockReason: null,
};

const SubscriptionContext = createContext<SubscriptionContextType>({
  ...defaultState,
  checkSubscription: async () => {},
  createCheckout: async () => {},
  openCustomerPortal: async () => {},
});

function calcTrial(createdAt: string) {
  const start = new Date(createdAt).getTime();
  const now = Date.now();
  const elapsed = now - start;
  const totalMs = TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const remainMs = totalMs - elapsed;
  const daysLeft = Math.max(0, Math.ceil(remainMs / (24 * 60 * 60 * 1000)));
  return { trialActive: daysLeft > 0, trialDaysLeft: daysLeft, trialExpired: daysLeft <= 0 };
}

function calcGracePeriod(subscriptionEnd: string) {
  const endDate = new Date(subscriptionEnd).getTime();
  const now = Date.now();
  const graceEndMs = endDate + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const remainMs = graceEndMs - now;
  const graceDaysLeft = Math.max(0, Math.ceil(remainMs / (24 * 60 * 60 * 1000)));
  const isInGrace = now > endDate && graceDaysLeft > 0;
  const isOverdue = graceDaysLeft <= 0 && now > endDate;
  return { gracePeriodActive: isInGrace, graceDaysLeft: isInGrace ? graceDaysLeft : null, subscriptionOverdue: isOverdue };
}

function calcDaysUntilExpiry(subscriptionEnd: string): number | null {
  const endDate = new Date(subscriptionEnd).getTime();
  const now = Date.now();
  if (now > endDate) return null;
  return Math.ceil((endDate - now) / (24 * 60 * 60 * 1000));
}

const SUB_CACHE_KEY = "as_cached_subscription";
function cacheSubState(s: SubscriptionState) { try { localStorage.setItem(SUB_CACHE_KEY, JSON.stringify(s)); } catch { /* */ } }
function getCachedSubState(): SubscriptionState | null { try { const raw = localStorage.getItem(SUB_CACHE_KEY); if (raw) return JSON.parse(raw); } catch { /* */ } return null; }

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<SubscriptionState>(() => {
    const cached = getCachedSubState();
    return cached ? { ...cached, loading: false } : defaultState;
  });

  const checkSubscription = useCallback(async () => {
    if (!user) { setState({ ...defaultState, loading: false }); return; }
    if (!navigator.onLine) { const cached = getCachedSubState(); setState(cached ? { ...cached, loading: false } : { ...defaultState, loading: false }); return; }

    let createdAt = user.created_at;
    try { const cuResult = await supabase.from("company_users").select("created_at").eq("user_id", user.id).eq("is_active", true).limit(1).single(); if (cuResult.data?.created_at) createdAt = cuResult.data.created_at; } catch { /* */ }

    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;

      if (data?.blocked) { setState({ ...defaultState, loading: false, blocked: true, blockReason: data.block_reason || "Acesso bloqueado pelo administrador." }); return; }

      const isSubscribed = data?.subscribed ?? false;
      const planKey = data?.plan_key ?? null;
      const subscriptionEnd = data?.subscription_end ?? null;
      const wasSubscriber = data?.was_subscriber ?? false;
      const lastSubscriptionEnd = data?.last_subscription_end ?? null;

      if (isSubscribed && subscriptionEnd) {
        const daysUntilExpiry = calcDaysUntilExpiry(subscriptionEnd);
        const newState: SubscriptionState = { subscribed: true, planKey, subscriptionEnd, loading: false, trialActive: false, trialDaysLeft: null, trialExpired: false, wasSubscriber: true, subscriptionOverdue: false, gracePeriodActive: false, graceDaysLeft: null, daysUntilExpiry, blocked: false, blockReason: null };
        setState(newState); cacheSubState(newState);
      } else if (wasSubscriber && lastSubscriptionEnd) {
        const grace = calcGracePeriod(lastSubscriptionEnd);
        const newState: SubscriptionState = { subscribed: false, planKey, subscriptionEnd: lastSubscriptionEnd, loading: false, trialActive: false, trialDaysLeft: null, trialExpired: false, wasSubscriber: true, ...grace, daysUntilExpiry: null, blocked: false, blockReason: null };
        setState(newState); cacheSubState(newState);
      } else {
        const trial = calcTrial(createdAt);
        const newState: SubscriptionState = { subscribed: false, planKey: null, subscriptionEnd: null, loading: false, ...trial, wasSubscriber: false, subscriptionOverdue: false, gracePeriodActive: false, graceDaysLeft: null, daysUntilExpiry: null, blocked: false, blockReason: null };
        setState(newState); cacheSubState(newState);
      }
    } catch {
      const trial = calcTrial(createdAt);
      setState((s) => ({ ...s, loading: false, ...trial }));
    }
  }, [user]);

  useEffect(() => { checkSubscription(); const interval = setInterval(checkSubscription, 60_000); return () => clearInterval(interval); }, [checkSubscription]);

  const createCheckout = useCallback(async (planKey: string) => {
    console.log("[createCheckout] Starting checkout for plan:", planKey);

    const tryInvoke = async (functionName: "create-checkout-v2" | "create-checkout") => {
      const { data, error } = await supabase.functions.invoke(functionName, { body: { planKey } });

      if (error) {
        let message = typeof error === "object" && error?.message ? String(error.message) : "Erro ao criar checkout";
        try {
          const context = (error as any)?.context;
          if (context?.json) {
            const body = await context.json();
            if (body?.error) message = String(body.error);
            if (body?.message) message = String(body.message);
          }
        } catch {
          // ignore parse errors
        }

        throw new Error(message);
      }

      if (data?.error) throw new Error(String(data.error));
      if (!data?.url) throw new Error("URL de checkout não retornada");

      window.location.href = data.url;
    };

    try {
      await tryInvoke("create-checkout-v2");
    } catch (firstErr: any) {
      const msg = String(firstErr?.message || "");

      const shouldFallback =
        msg.includes("Failed to send a request to the Edge Function") ||
        msg.includes("Requested function was not found") ||
        msg.includes("NOT_FOUND") ||
        msg.includes("404") ||
        msg.includes("getClaims");

      if (!shouldFallback) throw firstErr;

      console.warn("[createCheckout] create-checkout-v2 unavailable, fallback to create-checkout");
      try {
        await tryInvoke("create-checkout");
      } catch (secondErr: any) {
        const secondMsg = String(secondErr?.message || "");
        if (secondMsg.includes("getClaims")) {
          throw new Error("Backend de checkout desatualizado (usa getClaims). Atualize/publice a função create-checkout no backend.");
        }
        throw secondErr;
      }
    }
  }, []);

  const openCustomerPortal = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("customer-portal");
    if (error) throw error;
    if (data?.url) window.open(data.url, "_blank");
  }, []);

  return (
    <SubscriptionContext.Provider value={{ ...state, checkSubscription, createCheckout, openCustomerPortal }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() { return useContext(SubscriptionContext); }
