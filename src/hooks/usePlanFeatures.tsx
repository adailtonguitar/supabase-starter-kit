import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useSubscription } from "@/hooks/useSubscription";

export type PlanTier = "starter" | "business" | "pro" | "emissor";
export type FinancialLevel = "basic" | "full";

interface PlanFeatures {
  plan: PlanTier;
  status: "active" | "suspended" | "canceled";
  maxUsers: number;
  fiscalEnabled: boolean;
  advancedReportsEnabled: boolean;
  financialModuleLevel: FinancialLevel;
  expiresAt: string | null;
  loading: boolean;
}

interface PlanContextType extends PlanFeatures {
  canUseFiscal: () => boolean;
  canAddUser: () => boolean;
  canUseAdvancedReports: () => boolean;
  canUseFullFinancial: () => boolean;
  isActive: () => boolean;
  isEmissorOnly: () => boolean;
  refresh: () => Promise<void>;
  /** Server-side check (call before critical actions) */
  checkServerLimit: (feature: string) => Promise<{ allowed: boolean; reason?: string }>;
}

const defaults: PlanFeatures = {
  plan: "starter",
  status: "active",
  maxUsers: 1,
  fiscalEnabled: false,
  advancedReportsEnabled: false,
  financialModuleLevel: "basic",
  expiresAt: null,
  loading: true,
};

const PlanContext = createContext<PlanContextType>({
  ...defaults,
  canUseFiscal: () => false,
  canAddUser: () => true,
  canUseAdvancedReports: () => false,
  canUseFullFinancial: () => false,
  isActive: () => true,
  isEmissorOnly: () => false,
  refresh: async () => {},
  checkServerLimit: async () => ({ allowed: true }),
});

const CACHE_KEY = "as_cached_plan";

function cachePlan(p: PlanFeatures) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(p)); } catch { /* */ }
}

function getCachedPlan(): PlanFeatures | null {
  try { const r = localStorage.getItem(CACHE_KEY); if (r) return JSON.parse(r); } catch { /* */ }
  return null;
}

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const { companyId } = useCompany();
  const { trialActive } = useSubscription();
  const [state, setState] = useState<PlanFeatures>(() => {
    const cached = getCachedPlan();
    return cached ? { ...cached, loading: true } : defaults;
  });

  // Pro-level features for trial users
  const PRO_TRIAL: PlanFeatures = {
    plan: "pro",
    status: "active",
    maxUsers: 99,
    fiscalEnabled: true,
    advancedReportsEnabled: true,
    financialModuleLevel: "full",
    expiresAt: null,
    loading: false,
  };

  const fetchPlan = useCallback(async () => {
    if (!companyId) {
      setState({ ...defaults, loading: false });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("company_plans")
        .select("*")
        .eq("company_id", companyId)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // No plan record: if trial is active, grant Pro; otherwise Starter
        if (trialActive) {
          setState(PRO_TRIAL);
          cachePlan(PRO_TRIAL);
        } else {
          const s: PlanFeatures = { ...defaults, loading: false };
          setState(s);
          cachePlan(s);
        }
        return;
      }

      // If there's a plan record but it's starter and trial is still active, override to Pro
      const planTier = (data as any).plan || "starter";
      if (planTier === "starter" && trialActive) {
        setState(PRO_TRIAL);
        cachePlan(PRO_TRIAL);
        return;
      }

      const s: PlanFeatures = {
        plan: planTier,
        status: (data as any).status || "active",
        maxUsers: (data as any).max_users || 1,
        fiscalEnabled: (data as any).fiscal_enabled || false,
        advancedReportsEnabled: (data as any).advanced_reports_enabled || false,
        financialModuleLevel: (data as any).financial_module_level || "basic",
        expiresAt: (data as any).expires_at || null,
        loading: false,
      };
      setState(s);
      cachePlan(s);
    } catch (err) {
      console.error("[usePlanFeatures] Error:", err);
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [companyId, trialActive]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const checkServerLimit = useCallback(async (feature: string): Promise<{ allowed: boolean; reason?: string }> => {
    if (!companyId) return { allowed: false, reason: "Empresa não identificada." };

    // Check if user is super_admin — bypass all limits
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: adminData } = await supabase
          .from("admin_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        if (adminData?.role === "super_admin") return { allowed: true };
      }
    } catch { /* continue with normal check */ }

    try {
      const { data, error } = await supabase.rpc("check_plan_limit", {
        p_company_id: companyId,
        p_feature: feature,
      });
      if (error) throw error;
      return data as { allowed: boolean; reason?: string };
    } catch {
      // Fail open to not block operations if RPC fails
      return { allowed: true };
    }
  }, [companyId]);

  const ctx = useMemo<PlanContextType>(() => ({
    ...state,
  canUseFiscal: () => state.status === "active" && (state.fiscalEnabled || state.plan === "emissor"),
    canAddUser: () => state.status === "active" && (state.maxUsers <= 0 || state.maxUsers > 0), // frontend hint only
    canUseAdvancedReports: () => state.status === "active" && state.advancedReportsEnabled,
    canUseFullFinancial: () => state.status === "active" && state.financialModuleLevel === "full",
    isActive: () => state.status === "active",
    isEmissorOnly: () => state.plan === "emissor" && state.status === "active",
    refresh: fetchPlan,
    checkServerLimit,
  }), [state, fetchPlan, checkServerLimit]);

  return <PlanContext.Provider value={ctx}>{children}</PlanContext.Provider>;
}

export function usePlanFeatures() {
  return useContext(PlanContext);
}
