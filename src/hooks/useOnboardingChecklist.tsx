import { useState, useCallback, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

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

const STORAGE_KEY = "antho_onboarding";
const WELCOME_KEY = "antho_welcome_seen";

interface OnboardingState {
  completedSteps: string[];
  dismissed: boolean;
}

function loadState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { completedSteps: [], dismissed: false };
}

function saveState(state: OnboardingState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function useOnboardingChecklist() {
  const { user } = useAuth();
  const [state, setState] = useState<OnboardingState>(loadState);
  const welcomeKey = useMemo(() => (user?.id ? `${WELCOME_KEY}:${user.id}` : WELCOME_KEY), [user?.id]);
  const [welcomeSeen, setWelcomeSeen] = useState(() => {
    try {
      // Prefer scoped key (per-user). Fallback to legacy global key if present.
      const scoped = localStorage.getItem(welcomeKey);
      if (scoped != null) return scoped === "true";
      return localStorage.getItem(WELCOME_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [welcomeLoaded, setWelcomeLoaded] = useState(false);

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
    saveState(state);
  }, [state]);

  const completeStep = useCallback((stepId: string) => {
    setState((prev) => {
      if (prev.completedSteps.includes(stepId)) return prev;
      return { ...prev, completedSteps: [...prev.completedSteps, stepId] };
    });
  }, []);

  const dismissChecklist = useCallback(() => {
    setState((prev) => ({ ...prev, dismissed: true }));
  }, []);

  const markWelcomeSeen = useCallback(() => {
    setWelcomeSeen(true);
    try {
      localStorage.setItem(welcomeKey, "true");
    } catch {}
    // Best effort: persist server-side
    (async () => {
      try {
        if (!user?.id) return;
        await supabase.from("profiles").update({ welcome_seen_at: new Date().toISOString() } as any).eq("id", user.id);
      } catch {
        /* best effort */
      }
    })();
  }, [welcomeKey, user?.id]);

  const resetOnboarding = useCallback(() => {
    setState({ completedSteps: [], dismissed: false });
    setWelcomeSeen(false);
    try {
      localStorage.removeItem(welcomeKey);
    } catch {}
    (async () => {
      try {
        if (!user?.id) return;
        await supabase.from("profiles").update({ welcome_seen_at: null } as any).eq("id", user.id);
      } catch {
        /* best effort */
      }
    })();
  }, [welcomeKey, user?.id]);

  const steps = ONBOARDING_STEPS;
  const completedCount = state.completedSteps.length;
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;
  const allDone = completedCount >= totalSteps;
  const showChecklist = !state.dismissed && !allDone;

  return {
    steps,
    completedSteps: state.completedSteps,
    completeStep,
    dismissChecklist,
    welcomeSeen,
    welcomeLoaded,
    markWelcomeSeen,
    resetOnboarding,
    progress,
    completedCount,
    totalSteps,
    allDone,
    showChecklist,
  };
}
