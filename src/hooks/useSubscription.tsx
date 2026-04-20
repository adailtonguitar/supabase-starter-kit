import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

function calcTrialFromEndsAt(trialEndsAt: string | null): { trialActive: boolean; trialDaysLeft: number | null } {
  if (!trialEndsAt) {
    return { trialActive: false, trialDaysLeft: null };
  }

  const endMs = new Date(trialEndsAt).getTime();
  if (Number.isNaN(endMs)) {
    return { trialActive: false, trialDaysLeft: null };
  }

  const remainMs = endMs - Date.now();
  const trialExpired = remainMs <= 0;
  return {
    trialActive: !trialExpired,
    trialDaysLeft: trialExpired ? 0 : Math.ceil(remainMs / (24 * 60 * 60 * 1000)),
  };
}

const GRACE_PERIOD_DAYS = 3;

function calcGracePeriod(subscriptionEnd: string) {
  const endDate = new Date(subscriptionEnd).getTime();
  const remainMs = endDate + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000 - Date.now();
  const graceDaysLeft = Math.max(0, Math.ceil(remainMs / (24 * 60 * 60 * 1000)));
  const gracePeriodActive = Date.now() > endDate && graceDaysLeft > 0;
  const subscriptionOverdue = graceDaysLeft <= 0 && Date.now() > endDate;
  return {
    gracePeriodActive,
    graceDaysLeft: gracePeriodActive ? graceDaysLeft : null,
    subscriptionOverdue,
  };
}

export const PLANS = {
  starter: { key: "starter", name: "Starter (TESTE)", price: 1.0 },
  business: { key: "business", name: "Business", price: 199.9 },
  pro: { key: "pro", name: "Pro", price: 349.9 },
} as const;

interface SubscriptionState {
  access: boolean;
  loading: boolean;
  trialActive: boolean;
  trialDaysLeft: number | null;
  wasSubscriber: boolean;
  subscriptionOverdue: boolean;
  gracePeriodActive: boolean;
  graceDaysLeft: number | null;
  blocked: boolean;
  blockReason: string | null;
}

interface SubscriptionContextType extends SubscriptionState {
  checkSubscription: () => Promise<SubscriptionState>;
  createCheckout: (planKey: string) => Promise<void>;
  openCustomerPortal: () => Promise<void>;
}

const defaultState: SubscriptionState = {
  access: false,
  loading: true,
  trialActive: false,
  trialDaysLeft: null,
  wasSubscriber: false,
  subscriptionOverdue: false,
  gracePeriodActive: false,
  graceDaysLeft: null,
  blocked: false,
  blockReason: null,
};

const SubscriptionContext = createContext<SubscriptionContextType>({
  ...defaultState,
  checkSubscription: async () => defaultState,
  createCheckout: async () => {},
  openCustomerPortal: async () => {},
});

const CHECK_SUBSCRIPTION_INVOKE_MS = 6_000;

type EdgeSubscriptionPayload = {
  access?: boolean;
  was_subscriber?: boolean;
  last_subscription_end?: string | null;
  trial_ends_at?: string | null;
  blocked?: boolean;
  block_reason?: string | null;
};

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
    setTimeout(() => resolve({ data: null, error: { message: "check-subscription timeout" } }), CHECK_SUBSCRIPTION_INVOKE_MS),
  );

  return Promise.race([invoke, timeout]);
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, session, loading: authLoading } = useAuth();
  const [state, setState] = useState<SubscriptionState>(defaultState);

  const checkSubscription = useCallback(async (): Promise<SubscriptionState> => {
    if (authLoading || (user && !session)) {
      const pendingState = { ...defaultState, loading: true };
      setState(pendingState);
      return pendingState;
    }

    if (!user) {
      const nextState = { ...defaultState, loading: false };
      setState(nextState);
      return nextState;
    }

    try {
      const response = await invokeCheckSubscriptionWithTimeout();

      if (
        response.error ||
        !response.data ||
        typeof response.data !== "object" ||
        "error" in response.data
      ) {
        const failureState = { ...defaultState, loading: false };
        setState(failureState);
        return failureState;
      }

      const data = response.data as EdgeSubscriptionPayload;
      const access = data.access === true;
      const trial = calcTrialFromEndsAt(data.trial_ends_at ?? null);
      const grace = data.last_subscription_end
        ? calcGracePeriod(data.last_subscription_end)
        : { gracePeriodActive: false, graceDaysLeft: null, subscriptionOverdue: false };

      const nextState: SubscriptionState = {
        access,
        loading: false,
        trialActive: trial.trialActive,
        trialDaysLeft: trial.trialDaysLeft,
        wasSubscriber: data.was_subscriber === true || !!data.last_subscription_end,
        subscriptionOverdue: grace.subscriptionOverdue,
        gracePeriodActive: grace.gracePeriodActive,
        graceDaysLeft: grace.graceDaysLeft,
        blocked: data.blocked === true,
        blockReason: data.blocked === true ? data.block_reason || "Acesso bloqueado pelo administrador." : null,
      };

      setState(nextState);
      console.log("SUBSCRIPTION_STATUS", data);
      return nextState;
    } catch {
      const failureState = { ...defaultState, loading: false };
      setState(failureState);
      return failureState;
    }
  }, [authLoading, session, user]);

  useEffect(() => {
    void checkSubscription();

    const interval = setInterval(() => void checkSubscription(), 15 * 60_000);
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
  }, [checkSubscription]);

  const createCheckout = useCallback(async (planKey: string) => {
    const tryInvoke = async (functionName: "create-checkout-v2" | "create-checkout") => {
      const { data, error } = await supabase.functions.invoke(functionName, { body: { planKey } });

      if (error) {
        let message = typeof error === "object" && error?.message ? String(error.message) : "Erro ao criar checkout";
        try {
          const errObj = error as unknown as Record<string, unknown>;
          const context = errObj?.context as unknown;
          const maybeContext = context as { json?: unknown } | null;
          if (maybeContext?.json && typeof maybeContext.json === "function") {
            const body = await (maybeContext.json as () => Promise<Record<string, unknown>>)();
            const errValue = body?.error;
            const msgValue = body?.message;
            if (errValue) message = String(errValue);
            if (msgValue) message = String(msgValue);
          }
        } catch {
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

export function useSubscription() {
  return useContext(SubscriptionContext);
}
