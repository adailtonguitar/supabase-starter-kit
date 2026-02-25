import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export type PlanTier = "starter" | "business" | "pro";
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
  const [state, setState] = useState<PlanFeatures>(() => {
    const cached = getCachedPlan();
    return cached ? { ...cached, loading: true } : defaults;
  });

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
        // No plan = starter defaults
        const s: PlanFeatures = { ...defaults, loading: false };
        setState(s);
        cachePlan(s);
        return;
      }

      const s: PlanFeatures = {
        plan: (data as any).plan || "starter",
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
  }, [companyId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const checkServerLimit = useCallback(async (feature: string): Promise<{ allowed: boolean; reason?: string }> => {
    if (!companyId) return { allowed: false, reason: "Empresa não identificada." };
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
    canUseFiscal: () => state.status === "active" && state.fiscalEnabled,
    canAddUser: () => state.status === "active" && (state.maxUsers <= 0 || state.maxUsers > 0), // frontend hint only
    canUseAdvancedReports: () => state.status === "active" && state.advancedReportsEnabled,
    canUseFullFinancial: () => state.status === "active" && state.financialModuleLevel === "full",
    isActive: () => state.status === "active",
    refresh: fetchPlan,
    checkServerLimit,
  }), [state, fetchPlan, checkServerLimit]);

  return <PlanContext.Provider value={ctx}>{children}</PlanContext.Provider>;
}

export function usePlanFeatures() {
  return useContext(PlanContext);
}
