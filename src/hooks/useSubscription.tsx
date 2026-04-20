import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const GRACE_PERIOD_DAYS = 3;

/**
 * Single source of truth for trial expiration.
 * Reads exclusively from companies.trial_ends_at.
 * Fail-safe: if trial_ends_at is null, do NOT block (returns trialActive=true with null days).
 */
function calcTrialFromEndsAt(trialEndsAt: string | null): { trialActive: boolean; trialDaysLeft: number | null; trialExpired: boolean } {
  if (!trialEndsAt) {
    // Fail-safe: empresa sem trial_ends_at definido → liberar acesso
    return { trialActive: true, trialDaysLeft: null, trialExpired: false };
  }
  const endMs = new Date(trialEndsAt).getTime();
  const nowMs = Date.now();
  if (Number.isNaN(endMs)) {
    return { trialActive: true, trialDaysLeft: null, trialExpired: false };
  }
  const remainMs = endMs - nowMs;
  const expired = remainMs <= 0;
  const daysLeft = expired ? 0 : Math.ceil(remainMs / (24 * 60 * 60 * 1000));
  return { trialActive: !expired, trialDaysLeft: daysLeft, trialExpired: expired };
}

export const PLANS = {
  starter: { key: "starter", name: "Starter (TESTE)", price: 1.0 },
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
  checkSubscription: () => Promise<SubscriptionState>;
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
  checkSubscription: async () => defaultState,
  createCheckout: async () => {},
  openCustomerPortal: async () => {},
});


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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  console.log("SESSION", session);

  if (!session) {
    return {
      data: null,
      error: { message: "Sessão ausente para check-subscription" },
    };
  }

  const invoke = supabase.functions.invoke<Record<string, unknown>>("check-subscription");
  const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) =>
    setTimeout(
      () => resolve({ data: null, error: { message: "check-subscription timeout (fallback DB)" } }),
      CHECK_SUBSCRIPTION_INVOKE_MS,
    ),
  );
  const result = await Promise.race([invoke, timeout]);
  console.log('SUBSCRIPTION_STATUS', result?.data, 'error:', result?.error);
  return result;
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, session, loading: authLoading } = useAuth();
  const [state, setState] = useState<SubscriptionState>(() => {
    const cached = getCachedSubState();
    return cached ? { ...cached, loading: true } : defaultState;
  });

  const checkSubscription = useCallback(async (): Promise<SubscriptionState> => {
    if (authLoading || (user && !session)) {
      const cached = getCachedSubState();
      const pendingState: SubscriptionState = cached ? { ...cached, loading: true } : { ...defaultState, loading: true };
      setState(pendingState);
      return pendingState;
    }

    if (!user) {
      const newState: SubscriptionState = { ...defaultState, loading: false };
      setState(newState);
      return newState;
    }
    if (!navigator.onLine) {
      const cached = getCachedSubState();
      const newState: SubscriptionState = cached ? { ...cached, loading: false } : { ...defaultState, loading: false };
      setState(newState);
      return newState;
    }

    type EdgeSubscriptionPayload = {
      subscribed?: boolean;
      plan_key?: string | null;
      subscription_end?: string | null;
      was_subscriber?: boolean;
      last_subscription_end?: string | null;
      blocked?: boolean;
      block_reason?: string | null;
    };

    // Paralelo: trial_ends_at da empresa + edge (com timeout)
    let trialEndsAt: string | null = null;
    let companyId: string | null = null;
    let data: EdgeSubscriptionPayload | null = null;
    try {
      const [cuResult, response] = await Promise.all([
        supabase.from("company_users").select("company_id, companies!inner(trial_ends_at)").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle(),
        invokeCheckSubscriptionWithTimeout(),
      ]);
      const cuRow = cuResult.data as { company_id?: string; companies?: { trial_ends_at?: string | null } } | null;
      if (cuRow?.company_id) companyId = cuRow.company_id;
      if (cuRow?.companies?.trial_ends_at !== undefined) trialEndsAt = cuRow.companies.trial_ends_at ?? null;
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
        const cuResult = await supabase.from("company_users").select("company_id, companies!inner(trial_ends_at)").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
        const cuRow = cuResult.data as { company_id?: string; companies?: { trial_ends_at?: string | null } } | null;
        if (cuRow?.company_id) companyId = cuRow.company_id;
        if (cuRow?.companies?.trial_ends_at !== undefined) trialEndsAt = cuRow.companies.trial_ends_at ?? null;
      } catch { /* */ }
    }

    const trial = calcTrialFromEndsAt(trialEndsAt);
    // Observabilidade obrigatória — single source of truth
    console.log({
      type: "TRIAL_CHECK",
      company_id: companyId,
      trial_ends_at: trialEndsAt,
      expired: trial.trialExpired,
      ts: new Date().toISOString(),
    });

    if (!data) {
      try {
        // Check if user is blocked
        const { data: cu } = await supabase.from("company_users").select("is_active").eq("user_id", user.id).limit(1).maybeSingle();
        if (cu && !cu.is_active) {
          const blockedState: SubscriptionState = { ...defaultState, loading: false, blocked: true, blockReason: "Sua conta foi desativada pelo administrador." };
          setState(blockedState);
          return blockedState;
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
        const newState: SubscriptionState = { ...defaultState, loading: false, ...trial };
        setState(newState); cacheSubState(newState);
        return newState;
      }
    }

    try {
      if (data?.blocked) {
        const blockedState: SubscriptionState = { ...defaultState, loading: false, blocked: true, blockReason: data.block_reason || "Acesso bloqueado pelo administrador." };
        setState(blockedState);
        return blockedState;
      }

      const isSubscribed = data?.subscribed ?? false;
      const planKey = data?.plan_key ?? null;
      const subscriptionEnd = data?.subscription_end ?? null;
      const wasSubscriber = data?.was_subscriber ?? false;
      const lastSubscriptionEnd = data?.last_subscription_end ?? null;

      if (isSubscribed && subscriptionEnd) {
        const daysUntilExpiry = calcDaysUntilExpiry(subscriptionEnd);
        const newState: SubscriptionState = { subscribed: true, planKey, subscriptionEnd, loading: false, trialActive: false, trialDaysLeft: null, trialExpired: false, wasSubscriber: true, subscriptionOverdue: false, gracePeriodActive: false, graceDaysLeft: null, daysUntilExpiry, blocked: false, blockReason: null };
        setState(newState); cacheSubState(newState);
        return newState;
      } else if (wasSubscriber && lastSubscriptionEnd) {
        const grace = calcGracePeriod(lastSubscriptionEnd);
        const newState: SubscriptionState = { subscribed: false, planKey, subscriptionEnd: lastSubscriptionEnd, loading: false, trialActive: false, trialDaysLeft: null, trialExpired: false, wasSubscriber: true, ...grace, daysUntilExpiry: null, blocked: false, blockReason: null };
        setState(newState); cacheSubState(newState);
        return newState;
      } else {
        const newState: SubscriptionState = { subscribed: false, planKey: null, subscriptionEnd: null, loading: false, ...trial, wasSubscriber: false, subscriptionOverdue: false, gracePeriodActive: false, graceDaysLeft: null, daysUntilExpiry: null, blocked: false, blockReason: null };
        setState(newState); cacheSubState(newState);
        return newState;
      }
    } catch {
      const fallbackState: SubscriptionState = { ...defaultState, loading: false, ...trial };
      setState(fallbackState);
      return fallbackState;
    }
  }, [authLoading, session, user]);

  useEffect(() => {
    checkSubscription();

    const interval = setInterval(checkSubscription, 15 * 60_000);
    const handleFocus = () => { void checkSubscription(); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkSubscription();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkSubscription]); // 15 min + revalidação ao voltar do checkout

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
