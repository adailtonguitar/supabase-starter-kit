import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { PlanGate } from "@/components/PlanGate";
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
import { useSessionControl } from "@/hooks/useSessionControl";
import { ScrollToTop } from "@/components/ScrollToTop";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { EmissorOnboardingWizard } from "@/components/onboarding/EmissorOnboardingWizard";
import { useTermsAcceptance } from "@/hooks/useTermsAcceptance";
import { WalkthroughProvider } from "@/hooks/useWalkthrough";

import { WalkthroughRunner } from "@/components/WalkthroughRunner";
import { toast } from "sonner";

// Lazy-loaded pages with retry on chunk failure (stale deploy)
const lazyRetry = (fn: () => Promise<any>) =>
  lazy(() => fn().catch(() => {
    window.location.reload();
    return new Promise(() => {});
  }));

const Dashboard = lazyRetry(() => import("./pages/Dashboard"));
const LandingPage = lazyRetry(() => import("./pages/LandingPage"));
const TrialExpirado = lazyRetry(() => import("./pages/TrialExpirado"));
const Produtos = lazyRetry(() => import("./pages/Produtos"));
const Vendas = lazyRetry(() => import("./pages/Vendas"));
const RelatorioVendas = lazyRetry(() => import("./pages/RelatorioVendas"));
const Caixa = lazyRetry(() => import("./pages/Caixa"));
const Fiscal = lazyRetry(() => import("./pages/Fiscal"));
const FiscalConfig = lazyRetry(() => import("./pages/FiscalConfig"));
const FiscalConfigEdit = lazyRetry(() => import("./pages/FiscalConfigEdit"));
const AssinadorDownload = lazyRetry(() => import("./pages/AssinadorDownload"));
const AuditLogs = lazyRetry(() => import("./pages/AuditLogs"));
const CompararXML = lazyRetry(() => import("./pages/CompararXML"));
const Financeiro = lazyRetry(() => import("./pages/Financeiro"));
const Producao = lazyRetry(() => import("./pages/Producao"));
const Configuracoes = lazyRetry(() => import("./pages/Configuracoes"));
const Usuarios = lazyRetry(() => import("./pages/Usuarios"));

const Clientes = lazyRetry(() => import("./pages/Clientes"));
const Fornecedores = lazyRetry(() => import("./pages/Fornecedores"));
const Funcionarios = lazyRetry(() => import("./pages/Funcionarios"));
const Transportadoras = lazyRetry(() => import("./pages/Transportadoras"));
const AdmCartoes = lazyRetry(() => import("./pages/AdmCartoes"));
const Categorias = lazyRetry(() => import("./pages/Categorias"));
const Etiquetas = lazyRetry(() => import("./pages/Etiquetas"));
const Auth = lazyRetry(() => import("./pages/Auth"));
const ResetPassword = lazyRetry(() => import("./pages/ResetPassword"));
const PDV = lazyRetry(() => import("./pages/PDV"));
const NotFound = lazyRetry(() => import("./pages/NotFound"));
const Instalar = lazyRetry(() => import("./pages/Instalar"));
const Termos = lazyRetry(() => import("./pages/Termos"));
const ContratoSaaS = lazyRetry(() => import("./pages/ContratoSaaS"));
const Privacidade = lazyRetry(() => import("./pages/Privacidade"));
const PainelLucro = lazyRetry(() => import("./pages/PainelLucro"));
const LucroDiario = lazyRetry(() => import("./pages/LucroDiario"));
const AlertaFinanceiro = lazyRetry(() => import("./pages/AlertaFinanceiro"));
const Empresas = lazyRetry(() => import("./pages/Empresas"));
const DRE = lazyRetry(() => import("./pages/DRE"));
const FluxoCaixaProjetado = lazyRetry(() => import("./pages/FluxoCaixaProjetado"));
const CentroCusto = lazyRetry(() => import("./pages/CentroCusto"));
const Comissoes = lazyRetry(() => import("./pages/Comissoes"));
const ConciliacaoBancaria = lazyRetry(() => import("./pages/ConciliacaoBancaria"));
const Inventario = lazyRetry(() => import("./pages/Inventario"));
const CurvaABC = lazyRetry(() => import("./pages/CurvaABC"));
const Lotes = lazyRetry(() => import("./pages/Lotes"));
const Movimentacoes = lazyRetry(() => import("./pages/Movimentacoes"));
const Perdas = lazyRetry(() => import("./pages/Perdas"));
const Fidelidade = lazyRetry(() => import("./pages/Fidelidade"));
const RelatoriosIA = lazyRetry(() => import("./pages/RelatoriosIA"));
const Orcamentos = lazyRetry(() => import("./pages/Orcamentos"));
const Promocoes = lazyRetry(() => import("./pages/Promocoes"));
const Fiado = lazyRetry(() => import("./pages/Fiado"));
const PedidosCompra = lazyRetry(() => import("./pages/PedidosCompra"));
const Terminais = lazyRetry(() => import("./pages/Terminais"));
const Admin = lazyRetry(() => import("./pages/Admin"));
const Ajuda = lazyRetry(() => import("./pages/Ajuda"));
const Renovar = lazyRetry(() => import("./pages/Renovar"));
const TermosFiscais = lazyRetry(() => import("./pages/TermosFiscais"));
const Filiais = lazyRetry(() => import("./pages/Filiais"));
const DiagnosticoFinanceiro = lazyRetry(() => import("./pages/DiagnosticoFinanceiro"));
const Ruptura = lazyRetry(() => import("./pages/Ruptura"));
const SugestaoCompra = lazyRetry(() => import("./pages/SugestaoCompra"));
const PainelDono = lazyRetry(() => import("./pages/PainelDono"));
const NFeEmissao = lazyRetry(() => import("./pages/NFeEmissao"));
const EmissorNFe = lazyRetry(() => import("./pages/EmissorNFe"));
const EmissorLanding = lazyRetry(() => import("./pages/EmissorLanding"));
const ConsultaDFe = lazyRetry(() => import("./pages/ConsultaDFe"));
const Relatorios = lazyRetry(() => import("./pages/Relatorios"));
const PDVCustomerDisplayPage = lazyRetry(() => import("./pages/PDVDisplay"));

const RegistroErros = lazyRetry(() => import("./pages/RegistroErros"));
const DiagnosticoSistema = lazyRetry(() => import("./pages/DiagnosticoSistema"));
const Assistente = lazyRetry(() => import("./pages/Assistente"));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 60 * 1000, // 15 min — reduce refetches
      gcTime: 60 * 60 * 1000, // 60 min cache retention
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

const PageSpinner = () => (
  <div className="flex items-center justify-center h-screen bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { companyId, loading: companyLoading } = useCompany();
  const { subscribed, trialExpired, subscriptionOverdue, blocked, loading: subLoading } = useSubscription();
  const { isSuperAdmin, loading: adminLoading } = useAdminRole();
  const { accepted: termsAccepted, loading: termsLoading } = useTermsAcceptance();
  useSessionControl(); // Anti-sharing session control
  const hasSignedOut = useRef(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [companyCheckDone, setCompanyCheckDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Note: removed auto-clear of as_selected_company for super_admins
  // to preserve company selection across page reloads

  // Safety timeout: if loading takes more than 8s, force completion
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
      setCompanyCheckDone(true); // Prevent infinite loop
      console.warn("[ProtectedRoute] Loading timeout reached — forcing through");
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading && !companyLoading && user && companyId === null && !hasSignedOut.current) {
      // Skip network check when offline — rely on cached data
      if (!navigator.onLine) {
        setCompanyCheckDone(true);
        return;
      }
      const checkCompany = async () => {
        try {
          const { data } = await (await import("@/integrations/supabase/client")).supabase
            .from("company_users")
            .select("id")
            .eq("user_id", user.id)
            .limit(1);

          if (!data || data.length === 0) {
            setShowOnboarding(true);
          } else if (!companyId) {
            hasSignedOut.current = true;
            toast.error("Sua conta foi desativada. Entre em contato com o administrador.");
            signOut();
          }
        } catch (err) {
          console.error("[ProtectedRoute] Company check failed:", err);
        }
        setCompanyCheckDone(true);
      };
      checkCompany();
    } else if (companyId) {
      setCompanyCheckDone(true);
    }
  }, [loading, companyLoading, user, companyId, signOut]);

  useEffect(() => {
    if (!user) {
      hasSignedOut.current = false;
      setShowOnboarding(false);
      setCompanyCheckDone(false);
    }
  }, [user]);

  const isStillLoading = loading || companyLoading || subLoading || adminLoading || termsLoading || (!companyId && !companyCheckDone);

  if (isStillLoading && !timedOut) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => window.location.reload()} />;
  }

  // If no company after timeout, show onboarding instead of redirect loop
  if (!companyId && !showOnboarding) {
    return <OnboardingWizard onComplete={() => window.location.reload()} />;
  }

  // Block until terms are accepted (super_admin bypasses)
  if (!isSuperAdmin && !termsAccepted) {
    return (
      <Suspense fallback={<PageSpinner />}>
        <TermosFiscais />
      </Suspense>
    );
  }

  // Kill switch or subscription block (super_admin bypasses)
  if (!isSuperAdmin && (blocked || (trialExpired && !subscribed) || subscriptionOverdue)) {
    return <Navigate to="/trial-expirado" replace />;
  }

  return <>{children}</>;
}

/** Blocks emissor-only plan users from accessing full-system routes (super_admin bypasses) */
function EmissorGuard({ children }: { children: React.ReactNode }) {
  const { isEmissorOnly, loading } = usePlanFeatures();
  const { isSuperAdmin } = useAdminRole();
  if (loading) return null;
  if (!isSuperAdmin && isEmissorOnly()) return <Navigate to="/emissor-nfe" replace />;
  return <>{children}</>;
}

/** Shows LandingPage immediately; redirects to /dashboard once auth confirms user */
function LandingRedirectWrapper() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/dashboard" replace />;
  return <LandingPage />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Suspense fallback={<PageSpinner />}>
      <UpdateNoticeModal />
      <Routes>
        {/* Public landing - renders immediately, redirects after auth resolves */}
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
        {/* Public 404 catch — routes that don't match any public path go to ProtectedRoute,
            which redirects unauthenticated users. We add a dedicated not-found for known-invalid paths. */}
        {/* PDV: full-screen, outside AppLayout */}
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
        {/* Authenticated routes inside AppLayout; unauthenticated users see 404 */}
        <Route
          path="/*"
          element={user ? (
            <ProtectedRoute>
              <EmissorGuard>
              <AppLayout>
                <Suspense fallback={<PageSpinner />}>
                  <Routes>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route
                      path="/painel-lucro"
                      element={
                        <PlanGate feature="hasProfitPanel" featureName="Painel de Lucro">
                          <PainelLucro />
                        </PlanGate>
                      }
                    />
                    <Route path="/lucro-diario" element={<LucroDiario />} />
                    <Route
                      path="/alertas"
                      element={
                        <PlanGate feature="hasFinancialAlerts" featureName="Alertas Financeiros">
                          <AlertaFinanceiro />
                        </PlanGate>
                      }
                    />
                    <Route path="/produtos" element={<Produtos />} />
                    <Route path="/vendas" element={<Vendas />} />
                    <Route path="/relatorio-vendas" element={<RelatorioVendas />} />
                    <Route path="/caixa" element={<Caixa />} />
                    <Route path="/fiscal" element={<Fiscal />} />
                    <Route path="/fiscal/config" element={<FiscalConfig />} />
                    <Route path="/fiscal/config/edit" element={<FiscalConfigEdit />} />
                    <Route path="/fiscal/assinador" element={<AssinadorDownload />} />
                    <Route path="/fiscal/auditoria" element={<AuditLogs />} />
                    <Route path="/fiscal/comparar-xml" element={<CompararXML />} />
                    <Route path="/fiscal/nfe" element={<NFeEmissao />} />
                    <Route path="/financeiro" element={<Financeiro />} />
                    <Route
                      path="/dre"
                      element={
                        <PlanGate feature="hasDre" featureName="DRE">
                          <DRE />
                        </PlanGate>
                      }
                    />
                    <Route
                      path="/fluxo-caixa"
                      element={
                        <PlanGate feature="hasCashFlow" featureName="Fluxo de Caixa Projetado">
                          <FluxoCaixaProjetado />
                        </PlanGate>
                      }
                    />
                    <Route
                      path="/centro-custo"
                      element={
                        <PlanGate feature="hasCostCenter" featureName="Centro de Custo">
                          <CentroCusto />
                        </PlanGate>
                      }
                    />
                    <Route
                      path="/comissoes"
                      element={
                        <PlanGate feature="hasCommissions" featureName="Comissões">
                          <Comissoes />
                        </PlanGate>
                      }
                    />
                    <Route
                      path="/conciliacao"
                      element={
                        <PlanGate feature="hasBankReconciliation" featureName="Conciliação Bancária">
                          <ConciliacaoBancaria />
                        </PlanGate>
                      }
                    />
                    <Route path="/configuracoes" element={<Configuracoes />} />
                    <Route path="/usuarios" element={<Usuarios />} />

                    <Route path="/cadastro/empresas" element={<Empresas />} />
                    <Route path="/cadastro/clientes" element={<Clientes />} />
                    <Route path="/cadastro/fornecedores" element={<Fornecedores />} />
                    <Route path="/cadastro/funcionarios" element={<Funcionarios />} />
                    <Route path="/cadastro/transportadoras" element={<Transportadoras />} />
                    <Route path="/cadastro/adm-cartoes" element={<AdmCartoes />} />
                    <Route path="/cadastro/categorias" element={<Categorias />} />
                    <Route path="/estoque/movimentacoes" element={<Movimentacoes />} />
                    <Route path="/estoque/inventario" element={<Inventario />} />
                    <Route
                      path="/estoque/curva-abc"
                      element={
                        <PlanGate feature="hasAbcCurve" featureName="Curva ABC">
                          <CurvaABC />
                        </PlanGate>
                      }
                    />
                    <Route path="/estoque/lotes" element={<Lotes />} />
                    <Route path="/estoque/perdas" element={<Perdas />} />
                    <Route path="/producao" element={<Producao />} />
                    <Route
                      path="/fidelidade"
                      element={
                        <PlanGate feature="hasLoyalty" featureName="Programa de Fidelidade">
                          <Fidelidade />
                        </PlanGate>
                      }
                    />
                    <Route
                      path="/relatorios-ia"
                      element={
                        <PlanGate feature="hasAiReports" featureName="Relatórios com IA">
                          <RelatoriosIA />
                        </PlanGate>
                      }
                    />
                    <Route path="/relatorios" element={<Relatorios />} />
                    <Route path="/etiquetas" element={<Etiquetas />} />
                    <Route
                      path="/orcamentos"
                      element={
                        <PlanGate feature="hasQuotes" featureName="Orçamentos">
                          <Orcamentos />
                        </PlanGate>
                      }
                    />
                    <Route path="/promocoes" element={<Promocoes />} />
                    <Route path="/fiado" element={<Fiado />} />
                    <Route path="/pedidos-compra" element={<PedidosCompra />} />
                    <Route path="/terminais" element={<Terminais />} />
                    <Route path="/filiais" element={
                      <PlanGate feature="hasBranches" featureName="Gestão de Filiais">
                        <Filiais />
                      </PlanGate>
                    } />
                    <Route path="/diagnostico-financeiro" element={
                      <PlanGate feature="hasDiagnostico" featureName="Diagnóstico Financeiro com IA">
                        <DiagnosticoFinanceiro />
                      </PlanGate>
                    } />
                    <Route path="/estoque/ruptura" element={
                      <PlanGate feature="hasRuptura" featureName="Relatório de Ruptura">
                        <Ruptura />
                      </PlanGate>
                    } />
                    <Route path="/painel-dono" element={<PainelDono />} />
                    <Route path="/sugestao-compra" element={
                      <PlanGate feature="hasAiReports" featureName="Sugestão de Compra por IA">
                        <SugestaoCompra />
                      </PlanGate>
                    } />
                    <Route path="/consulta-dfe" element={<ConsultaDFe />} />
                    
                    
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/admin/erros" element={<RegistroErros />} />
                    <Route path="/admin/diagnostico" element={<DiagnosticoSistema />} />
                    <Route path="/ajuda" element={<Ajuda />} />
                    <Route path="/assistente" element={<Assistente />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
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
                    <AppRoutes />
                  </WalkthroughProvider>
                </LocalDBProvider>
              </PlanProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
