import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { PlanGate } from "@/components/PlanGate";

// Lazy-loaded pages with retry on chunk failure
const lazyRetry = (fn: () => Promise<any>) =>
  lazy(() => fn().catch(() => {
    window.location.reload();
    return new Promise(() => {});
  }));

// ── Dashboard & Core ──
export const Dashboard = lazyRetry(() => import("@/pages/Dashboard"));
export const LandingPage = lazyRetry(() => import("@/pages/LandingPage"));
export const TrialExpirado = lazyRetry(() => import("@/pages/TrialExpirado"));
export const Auth = lazyRetry(() => import("@/pages/Auth"));
export const ResetPassword = lazyRetry(() => import("@/pages/ResetPassword"));
export const NotFound = lazyRetry(() => import("@/pages/NotFound"));

// ── PDV & Vendas ──
export const PDV = lazyRetry(() => import("@/pages/PDV"));
export const PDVCustomerDisplayPage = lazyRetry(() => import("@/pages/PDVDisplay"));
export const Caixa = lazyRetry(() => import("@/pages/Caixa"));
export const Vendas = lazyRetry(() => import("@/pages/Vendas"));
export const RelatorioVendas = lazyRetry(() => import("@/pages/RelatorioVendas"));

// ── Produtos & Estoque ──
export const Produtos = lazyRetry(() => import("@/pages/Produtos"));
export const Movimentacoes = lazyRetry(() => import("@/pages/Movimentacoes"));
export const Inventario = lazyRetry(() => import("@/pages/Inventario"));
export const CurvaABC = lazyRetry(() => import("@/pages/CurvaABC"));
export const Lotes = lazyRetry(() => import("@/pages/Lotes"));
export const Perdas = lazyRetry(() => import("@/pages/Perdas"));
export const Etiquetas = lazyRetry(() => import("@/pages/Etiquetas"));
export const Ruptura = lazyRetry(() => import("@/pages/Ruptura"));
export const SugestaoCompra = lazyRetry(() => import("@/pages/SugestaoCompra"));

// ── Fiscal ──
export const Fiscal = lazyRetry(() => import("@/pages/Fiscal"));
export const FiscalConfig = lazyRetry(() => import("@/pages/FiscalConfig"));
export const FiscalConfigEdit = lazyRetry(() => import("@/pages/FiscalConfigEdit"));
export const AssinadorDownload = lazyRetry(() => import("@/pages/AssinadorDownload"));
export const AuditLogs = lazyRetry(() => import("@/pages/AuditLogs"));
export const AuditoriaGeral = lazyRetry(() => import("@/pages/AuditoriaGeral"));
export const CompararXML = lazyRetry(() => import("@/pages/CompararXML"));
export const NFeEmissao = lazyRetry(() => import("@/pages/NFeEmissao"));
export const EmissorNFe = lazyRetry(() => import("@/pages/EmissorNFe"));
export const EmissorLanding = lazyRetry(() => import("@/pages/EmissorLanding"));
export const ConsultaDFe = lazyRetry(() => import("@/pages/ConsultaDFe"));

// ── Financeiro ──
export const Financeiro = lazyRetry(() => import("@/pages/Financeiro"));
export const PainelLucro = lazyRetry(() => import("@/pages/PainelLucro"));
export const LucroDiario = lazyRetry(() => import("@/pages/LucroDiario"));
export const AlertaFinanceiro = lazyRetry(() => import("@/pages/AlertaFinanceiro"));
export const DRE = lazyRetry(() => import("@/pages/DRE"));
export const FluxoCaixaProjetado = lazyRetry(() => import("@/pages/FluxoCaixaProjetado"));
export const CentroCusto = lazyRetry(() => import("@/pages/CentroCusto"));
export const Comissoes = lazyRetry(() => import("@/pages/Comissoes"));
export const ConciliacaoBancaria = lazyRetry(() => import("@/pages/ConciliacaoBancaria"));
export const DiagnosticoFinanceiro = lazyRetry(() => import("@/pages/DiagnosticoFinanceiro"));

// ── Cadastros ──
export const Empresas = lazyRetry(() => import("@/pages/Empresas"));
export const Clientes = lazyRetry(() => import("@/pages/Clientes"));
export const Fornecedores = lazyRetry(() => import("@/pages/Fornecedores"));
export const Funcionarios = lazyRetry(() => import("@/pages/Funcionarios"));
export const Transportadoras = lazyRetry(() => import("@/pages/Transportadoras"));
export const AdmCartoes = lazyRetry(() => import("@/pages/AdmCartoes"));
export const Categorias = lazyRetry(() => import("@/pages/Categorias"));

// ── Módulos extras ──
export const Producao = lazyRetry(() => import("@/pages/Producao"));
export const Fidelidade = lazyRetry(() => import("@/pages/Fidelidade"));
export const RelatoriosIA = lazyRetry(() => import("@/pages/RelatoriosIA"));
export const Relatorios = lazyRetry(() => import("@/pages/Relatorios"));
export const Orcamentos = lazyRetry(() => import("@/pages/Orcamentos"));
export const Promocoes = lazyRetry(() => import("@/pages/Promocoes"));
export const Fiado = lazyRetry(() => import("@/pages/Fiado"));
export const PedidosCompra = lazyRetry(() => import("@/pages/PedidosCompra"));
export const Terminais = lazyRetry(() => import("@/pages/Terminais"));
export const Filiais = lazyRetry(() => import("@/pages/Filiais"));
export const PainelDono = lazyRetry(() => import("@/pages/PainelDono"));

// ── Config & Admin ──
export const Configuracoes = lazyRetry(() => import("@/pages/Configuracoes"));
export const Usuarios = lazyRetry(() => import("@/pages/Usuarios"));
export const Admin = lazyRetry(() => import("@/pages/Admin"));
export const RegistroErros = lazyRetry(() => import("@/pages/RegistroErros"));
export const DiagnosticoSistema = lazyRetry(() => import("@/pages/DiagnosticoSistema"));
export const Ajuda = lazyRetry(() => import("@/pages/Ajuda"));
export const Assistente = lazyRetry(() => import("@/pages/Assistente"));

// ── Legal & Misc ──
export const Instalar = lazyRetry(() => import("@/pages/Instalar"));
export const Termos = lazyRetry(() => import("@/pages/Termos"));
export const ContratoSaaS = lazyRetry(() => import("@/pages/ContratoSaaS"));
export const Privacidade = lazyRetry(() => import("@/pages/Privacidade"));
export const Renovar = lazyRetry(() => import("@/pages/Renovar"));
export const TermosFiscais = lazyRetry(() => import("@/pages/TermosFiscais"));

/** Inner layout routes (inside AppLayout) */
export function LayoutRoutes() {
  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/painel-lucro" element={<PlanGate feature="hasProfitPanel" featureName="Painel de Lucro"><PainelLucro /></PlanGate>} />
      <Route path="/lucro-diario" element={<LucroDiario />} />
      <Route path="/alertas" element={<PlanGate feature="hasFinancialAlerts" featureName="Alertas Financeiros"><AlertaFinanceiro /></PlanGate>} />
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
      <Route path="/auditoria" element={<AuditoriaGeral />} />
      <Route path="/financeiro" element={<Financeiro />} />
      <Route path="/dre" element={<PlanGate feature="hasDre" featureName="DRE"><DRE /></PlanGate>} />
      <Route path="/fluxo-caixa" element={<PlanGate feature="hasCashFlow" featureName="Fluxo de Caixa Projetado"><FluxoCaixaProjetado /></PlanGate>} />
      <Route path="/centro-custo" element={<PlanGate feature="hasCostCenter" featureName="Centro de Custo"><CentroCusto /></PlanGate>} />
      <Route path="/comissoes" element={<PlanGate feature="hasCommissions" featureName="Comissões"><Comissoes /></PlanGate>} />
      <Route path="/conciliacao" element={<PlanGate feature="hasBankReconciliation" featureName="Conciliação Bancária"><ConciliacaoBancaria /></PlanGate>} />
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
      <Route path="/estoque/curva-abc" element={<PlanGate feature="hasAbcCurve" featureName="Curva ABC"><CurvaABC /></PlanGate>} />
      <Route path="/estoque/lotes" element={<Lotes />} />
      <Route path="/estoque/perdas" element={<Perdas />} />
      <Route path="/producao" element={<Producao />} />
      <Route path="/fidelidade" element={<PlanGate feature="hasLoyalty" featureName="Programa de Fidelidade"><Fidelidade /></PlanGate>} />
      <Route path="/relatorios-ia" element={<PlanGate feature="hasAiReports" featureName="Relatórios com IA"><RelatoriosIA /></PlanGate>} />
      <Route path="/relatorios" element={<Relatorios />} />
      <Route path="/etiquetas" element={<Etiquetas />} />
      <Route path="/orcamentos" element={<PlanGate feature="hasQuotes" featureName="Orçamentos"><Orcamentos /></PlanGate>} />
      <Route path="/promocoes" element={<Promocoes />} />
      <Route path="/fiado" element={<Fiado />} />
      <Route path="/pedidos-compra" element={<PedidosCompra />} />
      <Route path="/terminais" element={<Terminais />} />
      <Route path="/filiais" element={<PlanGate feature="hasBranches" featureName="Gestão de Filiais"><Filiais /></PlanGate>} />
      <Route path="/diagnostico-financeiro" element={<PlanGate feature="hasDiagnostico" featureName="Diagnóstico Financeiro com IA"><DiagnosticoFinanceiro /></PlanGate>} />
      <Route path="/estoque/ruptura" element={<PlanGate feature="hasRuptura" featureName="Relatório de Ruptura"><Ruptura /></PlanGate>} />
      <Route path="/painel-dono" element={<PainelDono />} />
      <Route path="/sugestao-compra" element={<PlanGate feature="hasAiReports" featureName="Sugestão de Compra por IA"><SugestaoCompra /></PlanGate>} />
      <Route path="/consulta-dfe" element={<ConsultaDFe />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/admin/erros" element={<RegistroErros />} />
      <Route path="/admin/diagnostico" element={<DiagnosticoSistema />} />
      <Route path="/ajuda" element={<Ajuda />} />
      <Route path="/assistente" element={<Assistente />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
