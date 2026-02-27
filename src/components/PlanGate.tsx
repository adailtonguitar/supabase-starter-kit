import { ReactNode } from "react";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useAdminRole } from "@/hooks/useAdminRole";
import { Lock, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface PlanGateProps {
  feature: string;
  featureName: string;
  children: ReactNode;
}

/**
 * Maps legacy PlanGate feature keys to plan feature checks.
 */
function isFeatureAllowed(feature: string, plan: ReturnType<typeof usePlanFeatures>): boolean {
  // Pro-only features (Filiais, Diagnóstico Financeiro, Relatórios IA completos, Ruptura, Sugestão Compra)
  const proOnlyFeatures = ["hasBranches", "hasDiagnostico", "hasFullAiReports", "hasRuptura", "hasSugestaoCompra"];
  if (proOnlyFeatures.includes(feature)) return plan.plan === "pro" && plan.isActive();

  // Fiscal features (NFC-e) — Business+ only
  if (feature === "hasFiscal") return plan.canUseFiscal();

  // Business+ features (Fidelidade, Orçamentos, Relatórios IA básicos, etc.)
  const businessPlusFeatures = [
    "hasProfitPanel", "hasFinancialAlerts", "hasAbcCurve", "hasAiReports",
    "hasLoyalty", "hasQuotes",
  ];
  if (businessPlusFeatures.includes(feature)) return plan.canUseAdvancedReports();

  // Full financial features (Pro only via financial_module_level = full)
  const fullFinancialFeatures = ["hasDre", "hasCashFlow", "hasCostCenter", "hasCommissions", "hasBankReconciliation"];
  if (fullFinancialFeatures.includes(feature)) return plan.canUseFullFinancial();

  return true;
}

export function PlanGate({ feature, featureName, children }: PlanGateProps) {
  const plan = usePlanFeatures();
  const { isSuperAdmin } = useAdminRole();

  // Super admins bypass all plan restrictions
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  if (plan.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!plan.isActive()) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
        <Lock className="w-10 h-10 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">Assinatura Inativa</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Sua assinatura está suspensa ou cancelada. Renove para acessar {featureName}.
        </p>
        <Button asChild size="sm" className="mt-2 gap-1.5">
          <Link to="/renovar">Renovar Assinatura <ArrowUpRight className="w-4 h-4" /></Link>
        </Button>
      </div>
    );
  }

  if (!isFeatureAllowed(feature, plan)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
        <Lock className="w-10 h-10 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">Recurso Bloqueado</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          <strong>{featureName}</strong> não está disponível no seu plano atual ({plan.plan.toUpperCase()}).
          Faça upgrade para desbloquear.
        </p>
        <Button asChild size="sm" className="mt-2 gap-1.5">
          <Link to="/renovar">Fazer Upgrade <ArrowUpRight className="w-4 h-4" /></Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
