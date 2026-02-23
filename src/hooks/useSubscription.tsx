import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "./useAuth";
import { useCompany } from "./useCompany";
import { supabase } from "@/integrations/supabase/client";

interface SubscriptionContextType {
  subscribed: boolean;
  trialExpired: boolean;
  subscriptionOverdue: boolean;
  blocked: boolean;
  loading: boolean;
  planId: string | null;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  subscribed: false,
  trialExpired: false,
  subscriptionOverdue: false,
  blocked: false,
  loading: true,
  planId: null,
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const [state, setState] = useState<Omit<SubscriptionContextType, "loading">>({
    subscribed: false,
    trialExpired: false,
    subscriptionOverdue: false,
    blocked: false,
    planId: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !companyId) {
      setLoading(false);
      return;
    }

    const fetchSubscription = async () => {
      try {
        const { data } = await supabase
          .from("companies")
          .select("subscription_status, trial_ends_at, blocked, plan_id")
          .eq("id", companyId)
          .single();

        if (data) {
          const now = new Date();
          const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
          setState({
            subscribed: data.subscription_status === "active",
            trialExpired: trialEnd ? now > trialEnd : false,
            subscriptionOverdue: data.subscription_status === "overdue",
            blocked: data.blocked ?? false,
            planId: data.plan_id ?? null,
          });
        }
      } catch {
        // ignore
      }
      setLoading(false);
    };

    fetchSubscription();
  }, [user, companyId]);

  return (
    <SubscriptionContext.Provider value={{ ...state, loading }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
