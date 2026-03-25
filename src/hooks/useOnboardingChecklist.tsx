import { useState, useCallback, useEffect } from "react";

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
  const [state, setState] = useState<OnboardingState>(loadState);
  const [welcomeSeen, setWelcomeSeen] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_KEY) === "true";
    } catch {
      return false;
    }
  });

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
      localStorage.setItem(WELCOME_KEY, "true");
    } catch {}
  }, []);

  const resetOnboarding = useCallback(() => {
    setState({ completedSteps: [], dismissed: false });
    setWelcomeSeen(false);
    try {
      localStorage.removeItem(WELCOME_KEY);
    } catch {}
  }, []);

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
    markWelcomeSeen,
    resetOnboarding,
    progress,
    completedCount,
    totalSteps,
    allDone,
    showChecklist,
  };
}
