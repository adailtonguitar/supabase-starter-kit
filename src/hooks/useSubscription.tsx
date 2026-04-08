import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const TRIAL_DAYS = 30;
const GRACE_PERIOD_DAYS = 3;

export const PLANS = {
  starter: { key: "starter", name: "Starter", price: 149.90 },
  business: { key: "business", name: "Business", price: 199.90 },
  pro: { key: "pro", name: "Pro", price: 449.90 },
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
/** Edge `check-subscription` pode levar 10–30s no cold start; isso travava o login no ProtectedRoute. */
const CHECK_SUBSCRIPTION_INVOKE_MS = 6_000;

function cacheSubState(s: SubscriptionState) { try { localStorage.setItem(SUB_CACHE_KEY, JSON.stringify(s)); } catch { /* */ } }
function getCachedSubState(): SubscriptionState | null { try { const raw = localStorage.getItem(SUB_CACHE_KEY); if (raw) return JSON.parse(raw); } catch { /* */ } return null; }

async function invokeCheckSubscriptionWithTimeout(): Promise<{
  data: Record<string, unknown> | null;
  error: { message?: string } | null;
}> {
  const { invokeEdgeFunctionWithAuth } = await import("@/lib/invoke-edge-function-with-auth");
  const invoke = invokeEdgeFunctionWithAuth<Record<string, unknown>>("check-subscription");
  const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) =>
    setTimeout(
      () => resolve({ data: null, error: { message: "check-subscription timeout (fallback DB)" } }),
      CHECK_SUBSCRIPTION_INVOKE_MS,
    ),
  );
  return Promise.race([invoke, timeout]);
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<SubscriptionState>(() => {
    const cached = getCachedSubState();
    return cached ? { ...cached, loading: true } : defaultState;
  });

  const checkSubscription = useCallback(async () => {
    if (!user) { setState({ ...defaultState, loading: false }); return; }
    if (!navigator.onLine) { const cached = getCachedSubState(); setState(cached ? { ...cached, loading: false } : { ...defaultState, loading: false }); return; }

    type EdgeSubscriptionPayload = {
      subscribed?: boolean;
      plan_key?: string | null;
      subscription_end?: string | null;
      was_subscriber?: boolean;
      last_subscription_end?: string | null;
      blocked?: boolean;
      block_reason?: string | null;
    };

    // Paralelo: data de trial + edge (com timeout) — evita somar dois tempos em série.
    let createdAt = user.created_at;
    let data: EdgeSubscriptionPayload | null = null;
    try {
      const [cuResult, response] = await Promise.all([
        supabase.from("company_users").select("created_at").eq("user_id", user.id).eq("is_active", true).limit(1).single(),
        invokeCheckSubscriptionWithTimeout(),
      ]);
      if (cuResult.data?.created_at) createdAt = cuResult.data.created_at;
      if (
        !response.error &&
        response.data &&
        typeof response.data === "object" &&
        !("error" in response.data)
      ) {
        data = response.data as EdgeSubscriptionPayload;
      }
    } catch {
      try {
        const cuResult = await supabase.from("company_users").select("created_at").eq("user_id", user.id).eq("is_active", true).limit(1).single();
        if (cuResult.data?.created_at) createdAt = cuResult.data.created_at;
      } catch { /* */ }
    }

    if (!data) {
      try {
        type CompanyUserBlockedRow = { is_active: boolean } | null;
        type SubscriptionRow = {
          status: string;
          plan_key: string | null;
          subscription_end: string | null;
        } | null;

        // Check if user is blocked
        const { data: cu } = await supabase.from("company_users").select("is_active").eq("user_id", user.id).limit(1).maybeSingle();
        if (cu && !cu.is_active) {
          setState({ ...defaultState, loading: false, blocked: true, blockReason: "Sua conta foi desativada pelo administrador." });
          return;
        }

        const { data: sub } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sub) {
          const now = new Date();
          const endDate = sub.subscription_end ? new Date(sub.subscription_end) : null;
          const isActive = sub.status === "active" && endDate && endDate > now;
          data = {
            subscribed: isActive,
            plan_key: sub.plan_key || null,
            subscription_end: sub.subscription_end || null,
            was_subscriber: true,
            last_subscription_end: sub.subscription_end || null,
          };
        } else {
          data = { subscribed: false, plan_key: null, subscription_end: null, was_subscriber: false, last_subscription_end: null };
        }
      } catch (dbErr) {
        console.warn("[useSubscription] DB fallback also failed, using trial:", dbErr);
        const trial = calcTrial(createdAt);
        const newState: SubscriptionState = { ...defaultState, loading: false, ...trial };
        setState(newState); cacheSubState(newState);
        return;
      }
    }

    try {
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

  useEffect(() => { checkSubscription(); const interval = setInterval(checkSubscription, 15 * 60_000); return () => clearInterval(interval); }, [checkSubscription]); // 15 min (was 5)

  const createCheckout = useCallback(async (planKey: string) => {
    // console.log("[createCheckout] Starting checkout for plan:", planKey);

    const tryInvoke = async (functionName: "create-checkout-v2" | "create-checkout") => {
      const { data, error } = await supabase.functions.invoke(functionName, { body: { planKey } });

      if (error) {
        let message = typeof error === "object" && error?.message ? String(error.message) : "Erro ao criar checkout";
        try {
          const errObj = error as unknown as Record<string, unknown>;
          const context = errObj?.context as unknown;
          const maybeContext = context as { json?: unknown } | null;
          if (maybeContext?.json && typeof maybeContext.json === "function") {
            const body = await (maybeContext.json as () => Promise<Record<string, unknown>> )();
            const errValue = body?.error;
            const msgValue = body?.message;
            if (errValue) message = String(errValue);
            if (msgValue) message = String(msgValue);
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
      return;
    } catch (firstErr: unknown) {
      console.warn("[createCheckout] create-checkout-v2 failed, trying create-checkout", firstErr);
    }

    try {
      await tryInvoke("create-checkout");
    } catch (secondErr: unknown) {
      const secondMsg = secondErr instanceof Error ? secondErr.message : String(secondErr);
      if (secondMsg.includes("getClaims")) {
        throw new Error("Backend de checkout desatualizado (usa getClaims). Atualize/publice a função create-checkout no backend.");
      }
      throw secondErr;
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
