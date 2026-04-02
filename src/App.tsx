import { useEffect, useRef, useState, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useAdminRole } from "@/hooks/useAdminRole";
import { SubscriptionProvider, useSubscription } from "@/hooks/useSubscription";
import { PlanProvider, usePlanFeatures } from "@/hooks/usePlanFeatures";
import { LocalDBProvider } from "@/components/providers/LocalDBProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import { UpdateNoticeModal } from "@/components/UpdateNoticeModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HelmetProvider } from "react-helmet-async";
import { useSessionControl } from "@/hooks/useSessionControl";
import { ScrollToTop } from "@/components/ScrollToTop";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { EmissorOnboardingWizard } from "@/components/onboarding/EmissorOnboardingWizard";
import { useTermsAcceptance } from "@/hooks/useTermsAcceptance";
import { WalkthroughProvider } from "@/hooks/useWalkthrough";
import { WalkthroughRunner } from "@/components/WalkthroughRunner";
import { toast } from "sonner";
import { fetchMyCompanyMemberships } from "@/lib/company-memberships";

import {
  LandingPage, Auth, ResetPassword, TrialExpirado, Instalar, Termos,
  ContratoSaaS, Privacidade, Renovar, PDV, PDVCustomerDisplayPage,
  EmissorNFe, EmissorLanding, TermosFiscais, LayoutRoutes,
} from "@/routes/AppRouteDefinitions";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

const PageSpinner = () => (
  <div className="flex items-center justify-center h-screen bg-background" role="status" aria-label="Carregando">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, session, loading, signOut } = useAuth();
  const { companyId, loading: companyLoading } = useCompany();
  const { subscribed, trialExpired, subscriptionOverdue, blocked, loading: subLoading } = useSubscription();
  const { isSuperAdmin, loading: adminLoading } = useAdminRole();
  const { accepted: termsAccepted, loading: termsLoading } = useTermsAcceptance();
  useSessionControl();
  const hasSignedOut = useRef(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [companyCheckDone, setCompanyCheckDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [membershipFetchFailed, setMembershipFetchFailed] = useState(false);
  /** null = ainda não checamos; 0 = sem vínculo ativo; >0 = tem empresa mas companyId pode não ter resolvido (ex.: RLS em companies). */
  const [activeMembershipCount, setActiveMembershipCount] = useState<number | null>(null);

  // Só contar depois de auth + empresa + checagem de memberships — evita modal falso durante
  // várias idas ao Supabase ou enquanto checkCompany ainda roda.
  useEffect(() => {
    setTimedOut(false);
    if (loading || !session || companyLoading || !companyCheckDone) return;
    const timer = setTimeout(() => {
      setTimedOut(true);
      console.warn("[ProtectedRoute] Pós-carregamento de empresa: timeout ao liberar rota");
    }, 30000);
    return () => clearTimeout(timer);
  }, [loading, session, companyLoading, companyCheckDone]);

  useEffect(() => {
    if (!loading && !!session && !companyLoading && user && companyId === null && !hasSignedOut.current) {
      if (!navigator.onLine) {
        setCompanyCheckDone(true);
        return;
      }
      const checkCompany = async () => {
        try {
          const memberships = await fetchMyCompanyMemberships(user.id);

          const activeCount = memberships.filter((m) => m.is_active).length;
          setActiveMembershipCount(activeCount);
          if (memberships.length === 0) {
            setShowOnboarding(true);
          } else {
            setShowOnboarding(false);
            if (activeCount === 0) {
              hasSignedOut.current = true;
              toast.error("Sua conta foi desativada. Entre em contato com o administrador.");
              signOut();
            }
          }
        } catch (err) {
          console.error("[ProtectedRoute] Company check failed:", err);
          setMembershipFetchFailed(true);
          setShowOnboarding(false);
          setActiveMembershipCount(null);
        }
        setCompanyCheckDone(true);
      };
      checkCompany();
    } else if (companyId) {
      setCompanyCheckDone(true);
    }
  }, [loading, session, companyLoading, user, companyId, signOut]);

  useEffect(() => {
    if (!user) {
      hasSignedOut.current = false;
      setShowOnboarding(false);
      setCompanyCheckDone(false);
      setMembershipFetchFailed(false);
      setActiveMembershipCount(null);
    }
  }, [user]);

  useEffect(() => {
    if (companyId) setMembershipFetchFailed(false);
  }, [companyId]);

  // Assim que a empresa resolve (ex.: após criar no wizard + reload), não manter wizard preso.
  useEffect(() => {
    if (companyId) setShowOnboarding(false);
  }, [companyId]);

  // When a cached user exists, Supabase may still be restoring the real session.
  // Avoid flashing onboarding screens during this short window.
  const authNeedsSession = !!user && !session;
  /** Enquanto o wizard de onboarding está visível, não bloquear por subscription/admin/terms — senão o spinner desmonta o wizard e o passo volta a 0. */
  const coreRouteBlocking =
    loading || authNeedsSession || companyLoading || (!companyId && !companyCheckDone);
  const isStillLoading = showOnboarding
    ? coreRouteBlocking
    : coreRouteBlocking || subLoading || adminLoading || termsLoading;

  if (isStillLoading && !timedOut) {
    return (
      <div className="flex items-center justify-center h-screen bg-background" role="status" aria-label="Carregando">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;

  // If we timed out resolving company, never fall back to onboarding wizard automatically.
  // Old users can briefly have companyId=null during refresh; onboarding must be explicit.
  if (timedOut && (!companyId && !showOnboarding)) {
    return (
      <div className="flex items-center justify-center h-screen bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-3">
          <div className="text-lg font-bold text-foreground">Carregando sua empresa…</div>
          <div className="text-sm text-muted-foreground">
            O carregamento demorou mais que o esperado. Isso pode acontecer por conexão lenta ou bloqueio de rede.
          </div>
          <div className="flex gap-2 pt-2">
            <button
              className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
              onClick={() => window.location.reload()}
            >
              Tentar novamente
            </button>
            <button
              className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
              onClick={() => { setTimedOut(false); setCompanyCheckDone(false); }}
            >
              Aguardar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (membershipFetchFailed && !companyId && !showOnboarding) {
    return (
      <div className="flex items-center justify-center h-screen bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-3">
          <div className="text-lg font-bold text-foreground">Não foi possível confirmar sua empresa</div>
          <div className="text-sm text-muted-foreground">
            A API não respondeu ao buscar seus vínculos (empresas). Isso costuma ser erro temporário no servidor ou política de segurança (RLS). Você{" "}
            <strong className="text-foreground">não</strong> foi tratado como conta nova — recarregue após corrigir o backend.
          </div>
          <button
            type="button"
            className="w-full px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
            onClick={() => window.location.reload()}
          >
            Recarregar página
          </button>
        </div>
      </div>
    );
  }

  if (
    companyCheckDone &&
    !companyLoading &&
    !companyId &&
    !showOnboarding &&
    !membershipFetchFailed &&
    activeMembershipCount !== null &&
    activeMembershipCount > 0
  ) {
    return (
      <div className="flex items-center justify-center h-screen bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-3">
          <div className="text-lg font-bold text-foreground">Sua conta já tem empresa cadastrada</div>
          <div className="text-sm text-muted-foreground">
            O sistema encontrou vínculo ativo com uma ou mais empresas, mas não conseguiu carregar o painel (erro 500 nas consultas ao Supabase, em geral RLS). Isso{" "}
            <strong className="text-foreground">não</strong> é fluxo de primeiro acesso. Aplique a migration{" "}
            <code className="text-xs bg-muted px-1 rounded">current_user_company_ids</code> no SQL Editor do projeto e recarregue.
          </div>
          <button
            type="button"
            className="w-full px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
            onClick={() => window.location.reload()}
          >
            Recarregar página
          </button>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => window.location.reload()} />;
  }

  if (!companyId && !showOnboarding) {
    return (
      <div className="flex items-center justify-center h-screen bg-background" role="status" aria-label="Carregando">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin && !termsAccepted) {
    return (
      <Suspense fallback={<PageSpinner />}>
        <TermosFiscais />
      </Suspense>
    );
  }

  if (!isSuperAdmin && (blocked || (trialExpired && !subscribed) || subscriptionOverdue)) {
    return <Navigate to="/trial-expirado" replace />;
  }

  return <>{children}</>;
}

function EmissorGuard({ children }: { children: React.ReactNode }) {
  const { isEmissorOnly, loading } = usePlanFeatures();
  const { isSuperAdmin } = useAdminRole();
  if (loading) return null;
  if (!isSuperAdmin && isEmissorOnly()) return <Navigate to="/emissor-nfe" replace />;
  return <>{children}</>;
}

function LandingRedirectWrapper() {
  const { user, session, loading } = useAuth();
  // Only redirect if we have a real session, not just a cached user
  if (!loading && user && session) return <Navigate to="/dashboard" replace />;
  return <LandingPage />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/" element={<LandingRedirectWrapper />} />
        <Route
          path="/auth"
          element={
            user &&
            !window.location.hash.includes("type=") &&
            sessionStorage.getItem("needs-password-setup") !== "true" ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Auth />
            )
          }
        />
        <Route path="/landing" element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/emissor" element={user ? <Navigate to="/emissor-nfe" replace /> : <EmissorLanding />} />
        <Route path="/install" element={<Instalar />} />
        <Route path="/termos" element={<Termos />} />
        <Route path="/contrato" element={<ContratoSaaS />} />
        <Route path="/privacidade" element={<Privacidade />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/trial-expirado" element={user ? <TrialExpirado /> : <Navigate to="/" replace />} />
        <Route path="/pdv-display" element={<PDVCustomerDisplayPage />} />
        <Route path="/renovar" element={user ? <Renovar /> : <Navigate to="/auth" replace />} />
        <Route
          path="/pdv"
          element={
            <ProtectedRoute>
              <EmissorGuard>
                <PDV />
              </EmissorGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/emissor-nfe"
          element={
            <ProtectedRoute>
              <EmissorNFe />
            </ProtectedRoute>
          }
        />
        <Route
          path="/*"
          element={user ? (
            <ProtectedRoute>
              <EmissorGuard>
                <AppLayout>
                  <Suspense fallback={<PageSpinner />}>
                    <LayoutRoutes />
                  </Suspense>
                </AppLayout>
              </EmissorGuard>
            </ProtectedRoute>
          ) : (
            <Navigate to="/" replace />
          )}
        />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <ErrorBoundary>
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <AuthProvider>
            <SubscriptionProvider>
              <PlanProvider>
                <LocalDBProvider>
                  <WalkthroughProvider>
                    <WalkthroughRunner />
                    <UpdateNoticeModal />
                    <AppRoutes />
                  </WalkthroughProvider>
                </LocalDBProvider>
              </PlanProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

export default App;
