import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
  checkKey: string; // localStorage key or table check
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

// Storage keys removed for strict Supabase-only audit.
...
export function useOnboardingChecklist() {
  const { user } = useAuth();
  const { companyId, loading: companyLoading } = useCompany();
  const [state, setState] = useState<OnboardingState>({ completedSteps: [], dismissed: false });
  const [welcomeSeen, setWelcomeSeen] = useState(false);
  const [welcomeLoaded, setWelcomeLoaded] = useState(false);
  const [checklistLoaded, setChecklistLoaded] = useState(false);
  const [companyAgeLoaded, setCompanyAgeLoaded] = useState(false);
  /** true = empresa criada há mais de MS_COMPANY_CONSIDERED_ESTABLISHED ou falha ao ler created_at (preferir não incomodar). */
  const [companyIsEstablished, setCompanyIsEstablished] = useState(true);
  /** Evita tratar conta com vínculo real como “primeiro login” quando RLS falha; só exibe welcome se probe = none. */
  const [memberProbe, setMemberProbe] = useState<MemberProbe>("idle");

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setMemberProbe("idle");
      return;
    }
    setMemberProbe("idle");
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
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Migrate legacy key -> per-user key (so old users don't see it again)
  useEffect(() => {
    try {
      if (!user?.id) return;
      const legacySeen = localStorage.getItem(WELCOME_KEY) === "true";
      const scopedSeen = localStorage.getItem(welcomeKey) === "true";
      if (legacySeen && !scopedSeen) {
        localStorage.setItem(welcomeKey, "true");
      }
      setWelcomeSeen(localStorage.getItem(welcomeKey) === "true");
    } catch {
      /* best effort */
    }
  }, [user?.id, welcomeKey]);

  // Keep state in sync when the key changes (user switch / session restore)
  useEffect(() => {
    try {
      const scoped = localStorage.getItem(welcomeKey);
      if (scoped != null) setWelcomeSeen(scoped === "true");
    } catch {
      /* best effort */
    }
  }, [welcomeKey]);

  // Authoritative source of truth: DB (survives anonymous tabs / storage resets)
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
        setWelcomeSeen((prev) => (dbSeen ? true : prev));
      } catch {
        // best effort: keep localStorage-derived value
      } finally {
        if (!cancelled) setWelcomeLoaded(true);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
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
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const markWelcomeSeen = useCallback(() => {
    setWelcomeSeen(true);
    try {
      localStorage.setItem(welcomeKey, "true");
    } catch {}
    (async () => {
      try {
        if (!user?.id) return;
        await supabase.from("profiles").update({ welcome_seen_at: new Date().toISOString() } as any).eq("id", user.id);
      } catch {
        /* best effort */
      }
    })();
  }, [welcomeKey, user?.id]);

  const tenantWelcomeSynced = useRef(false);
  useEffect(() => {
    if (!tenantReady || !user?.id) {
      tenantWelcomeSynced.current = false;
      return;
    }
    if (welcomeSeen) return;
    if (tenantWelcomeSynced.current) return;
    tenantWelcomeSynced.current = true;
    markWelcomeSeen();
  }, [tenantReady, user?.id, welcomeSeen, markWelcomeSeen]);

  useEffect(() => {
    saveState(onboardingKey, state);
  }, [onboardingKey, state]);

  // Server-side onboarding checklist state
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
        setState((prev) => {
          const mergedSteps = Array.from(new Set([...(prev.completedSteps || []), ...dbSteps]));
          return {
            completedSteps: mergedSteps,
            dismissed: prev.dismissed || dbDismissed,
          };
        });
      } catch {
        // best effort: keep localStorage-derived state
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
      return { ...prev, completedSteps: [...prev.completedSteps, stepId] };
    });
    // Best effort: persist server-side
    (async () => {
      try {
        if (!user?.id) return;
        const next = Array.from(new Set([...(state.completedSteps || []), stepId]));
        await supabase.from("profiles").update({ onboarding_completed_steps: next } as any).eq("id", user.id);
      } catch {
        /* best effort */
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, state.completedSteps]);

  const dismissChecklist = useCallback(() => {
    setState((prev) => ({ ...prev, dismissed: true }));
    (async () => {
      try {
        if (!user?.id) return;
        await supabase.from("profiles").update({ onboarding_dismissed_at: new Date().toISOString() } as any).eq("id", user.id);
      } catch {
        /* best effort */
      }
    })();
  }, [user?.id]);

  /** Empresas antigas: persistir dismiss no profile (evita voltar o card se algo limpar estado local). */
  const establishedDismissSyncedForCompany = useRef<string | null>(null);
  useEffect(() => {
    if (!checklistLoaded || !companyAgeLoaded || !tenantReady || !companyId || !user?.id) return;
    if (!companyIsEstablished) return;
    const everyStepDone = state.completedSteps.length >= ONBOARDING_STEPS.length;
    if (state.dismissed || everyStepDone) return;
    if (establishedDismissSyncedForCompany.current === companyId) return;
    establishedDismissSyncedForCompany.current = companyId;
    dismissChecklist();
  }, [
    checklistLoaded,
    companyAgeLoaded,
    companyIsEstablished,
    tenantReady,
    companyId,
    user?.id,
    state.dismissed,
    state.completedSteps.length,
    dismissChecklist,
  ]);

  /** Contas novas com uso real (produto ou venda visível) dispensam o checklist sem esperar 48h. */
  const checklistProbeDoneForCompany = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!checklistLoaded || !companyAgeLoaded || !tenantReady || !companyId || !user?.id) return;
    if (companyIsEstablished) return;
    const everyStepDone = state.completedSteps.length >= ONBOARDING_STEPS.length;
    if (state.dismissed || everyStepDone) return;
    if (checklistProbeDoneForCompany.current.has(companyId)) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ data: pRows }, { data: sRows }] = await Promise.all([
          supabase.from("products").select("id").eq("company_id", companyId).limit(1),
          supabase.from("sales").select("id").eq("company_id", companyId).limit(1),
        ]);
        if (cancelled) return;
        checklistProbeDoneForCompany.current.add(companyId);
        const hasActivity = (pRows?.length ?? 0) > 0 || (sRows?.length ?? 0) > 0;
        if (hasActivity) dismissChecklist();
      } catch {
        checklistProbeDoneForCompany.current.add(companyId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    checklistLoaded,
    companyAgeLoaded,
    companyIsEstablished,
    tenantReady,
    companyId,
    user?.id,
    state.dismissed,
    state.completedSteps.length,
    dismissChecklist,
  ]);

  const resetOnboarding = useCallback(() => {
    checklistProbeDoneForCompany.current.clear();
    establishedDismissSyncedForCompany.current = null;
    tenantWelcomeSynced.current = false;
    setState({ completedSteps: [], dismissed: false });
    setWelcomeSeen(false);
    try {
      localStorage.removeItem(welcomeKey);
      localStorage.removeItem(onboardingKey);
    } catch {}
    (async () => {
      try {
        if (!user?.id) return;
        await supabase.from("profiles").update({
          welcome_seen_at: null,
          onboarding_dismissed_at: null,
          onboarding_completed_steps: null,
        } as any).eq("id", user.id);
      } catch {
        /* best effort */
      }
    })();
  }, [welcomeKey, onboardingKey, user?.id]);

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
