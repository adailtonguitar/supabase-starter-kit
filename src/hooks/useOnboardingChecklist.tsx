import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyCompanyMemberships } from "@/lib/company-memberships";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  checkKey: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "company",
    title: "Configurar empresa",
    description: "Preencha os dados da sua empresa (CNPJ, endereço, logo)",
    icon: "🏢",
    route: "/configuracoes",
    checkKey: "onboarding_company_done",
  },
  {
    id: "product",
    title: "Cadastrar primeiro produto",
    description: "Adicione pelo menos um produto ao estoque",
    icon: "📦",
    route: "/produtos",
    checkKey: "onboarding_product_done",
  },
  {
    id: "sale",
    title: "Fazer primeira venda",
    description: "Realize uma venda pelo PDV para testar o fluxo",
    icon: "🛒",
    route: "/pdv",
    checkKey: "onboarding_sale_done",
  },
  {
    id: "financial",
    title: "Registrar lançamento financeiro",
    description: "Crie uma receita ou despesa no módulo financeiro",
    icon: "💰",
    route: "/financeiro",
    checkKey: "onboarding_financial_done",
  },
  {
    id: "fiscal",
    title: "Configurar módulo fiscal",
    description: "Configure certificado digital e dados fiscais (opcional)",
    icon: "📋",
    route: "/fiscal-config",
    checkKey: "onboarding_fiscal_done",
  },
];

const MS_COMPANY_CONSIDERED_ESTABLISHED = 48 * 60 * 60 * 1000;

type MemberProbe = "idle" | "none" | "has" | "error";

interface OnboardingState {
  completedSteps: string[];
  dismissed: boolean;
}

export function useOnboardingChecklist() {
  const { user } = useAuth();
  const { companyId, loading: companyLoading } = useCompany();
  const tenantReady = !!companyId && !companyLoading;
  const [state, setState] = useState<OnboardingState>({ completedSteps: [], dismissed: false });
  const [welcomeSeen, setWelcomeSeen] = useState(false);
  const [welcomeLoaded, setWelcomeLoaded] = useState(false);
  const [checklistLoaded, setChecklistLoaded] = useState(false);
  const [companyAgeLoaded, setCompanyAgeLoaded] = useState(false);
  const [companyIsEstablished, setCompanyIsEstablished] = useState(true);
  const [memberProbe, setMemberProbe] = useState<MemberProbe>("idle");

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setMemberProbe("idle");
      return;
    }
    (async () => {
      try {
        const rows = await fetchMyCompanyMemberships(user.id);
        if (cancelled) return;
        const active = rows.filter((r) => r.is_active).length;
        setMemberProbe(active > 0 ? "has" : "none");
      } catch {
        if (!cancelled) setMemberProbe("error");
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id) {
        setWelcomeLoaded(true);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("welcome_seen_at")
          .eq("id", user.id)
          .maybeSingle();
        if (error) throw error;
        const dbSeen = !!data?.welcome_seen_at;
        if (cancelled) return;
        setWelcomeSeen(dbSeen);
      } catch {
        setWelcomeSeen(false);
      } finally {
        if (!cancelled) setWelcomeLoaded(true);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!companyId) {
      setCompanyAgeLoaded(false);
      setCompanyIsEstablished(true);
      return;
    }
    let cancelled = false;
    setCompanyAgeLoaded(false);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("companies")
          .select("created_at")
          .eq("id", companyId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data?.created_at) {
          setCompanyIsEstablished(true);
        } else {
          const ageMs = Date.now() - new Date(data.created_at).getTime();
          setCompanyIsEstablished(ageMs > MS_COMPANY_CONSIDERED_ESTABLISHED);
        }
      } catch {
        if (!cancelled) setCompanyIsEstablished(true);
      } finally {
        if (!cancelled) setCompanyAgeLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const markWelcomeSeen = useCallback(() => {
    setWelcomeSeen(true);
    (async () => {
      try {
        if (!user?.id) return;
        await supabase.from("profiles").update({ welcome_seen_at: new Date().toISOString() } as any).eq("id", user.id);
      } catch { /* ignored */ }
    })();
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id) {
        setChecklistLoaded(true);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("onboarding_dismissed_at, onboarding_completed_steps")
          .eq("id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        const dbDismissed = !!data?.onboarding_dismissed_at;
        const dbSteps = Array.isArray(data?.onboarding_completed_steps) ? (data?.onboarding_completed_steps as unknown as string[]) : [];
        setState({
          completedSteps: dbSteps,
          dismissed: dbDismissed,
        });
      } catch {
        setState({ completedSteps: [], dismissed: false });
      } finally {
        if (!cancelled) setChecklistLoaded(true);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [user?.id]);

  const completeStep = useCallback((stepId: string) => {
    setState((prev) => {
      if (prev.completedSteps.includes(stepId)) return prev;
      const next = [...prev.completedSteps, stepId];
      (async () => {
        try {
          if (!user?.id) return;
          await supabase.from("profiles").update({ onboarding_completed_steps: next } as any).eq("id", user.id);
        } catch { /* ignored */ }
      })();
      return { ...prev, completedSteps: next };
    });
  }, [user?.id]);

  const dismissChecklist = useCallback(() => {
    setState((prev) => ({ ...prev, dismissed: true }));
    (async () => {
      try {
        if (!user?.id) return;
        await supabase.from("profiles").update({ onboarding_dismissed_at: new Date().toISOString() } as any).eq("id", user.id);
      } catch { /* ignored */ }
    })();
  }, [user?.id]);

  const resetOnboarding = useCallback(() => {
    setState({ completedSteps: [], dismissed: false });
    setWelcomeSeen(false);
    (async () => {
      try {
        if (!user?.id) return;
        await supabase.from("profiles").update({
          welcome_seen_at: null,
          onboarding_dismissed_at: null,
          onboarding_completed_steps: null,
        } as any).eq("id", user.id);
      } catch { /* ignored */ }
    })();
  }, [user?.id]);

  const steps = ONBOARDING_STEPS;
  const completedCount = state.completedSteps.length;
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;
  const allDone = completedCount >= totalSteps;
  const showChecklist =
    checklistLoaded &&
    companyAgeLoaded &&
    tenantReady &&
    !companyIsEstablished &&
    !state.dismissed &&
    !allDone;
  const showWelcomeModal =
    welcomeLoaded &&
    memberProbe === "none" &&
    !!user &&
    !companyLoading &&
    !welcomeSeen &&
    !tenantReady;

  return {
    steps,
    completedSteps: state.completedSteps,
    completeStep,
    dismissChecklist,
    welcomeSeen,
    welcomeLoaded,
    checklistLoaded,
    markWelcomeSeen,
    resetOnboarding,
    progress,
    completedCount,
    totalSteps,
    allDone,
    showChecklist,
    showWelcomeModal,
  };
}