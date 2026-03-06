import { useState } from "react";
import { Shield, Check, X, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

type PlanTier = "starter" | "business" | "pro" | "emissor";

interface FeatureDef {
  key: string;
  label: string;
  plans: PlanTier[];
  category: string;
}

const FEATURES: FeatureDef[] = [
  // Business+ features
  { key: "hasProfitPanel", label: "Painel de Lucro", plans: ["business", "pro"], category: "Relatórios" },
  { key: "hasFinancialAlerts", label: "Alertas Financeiros", plans: ["business", "pro"], category: "Relatórios" },
  { key: "hasAbcCurve", label: "Curva ABC", plans: ["business", "pro"], category: "Relatórios" },
  { key: "hasAiReports", label: "Relatórios com IA", plans: ["business", "pro"], category: "Relatórios" },
  { key: "hasLoyalty", label: "Programa de Fidelidade", plans: ["business", "pro"], category: "Vendas" },
  { key: "hasQuotes", label: "Orçamentos", plans: ["business", "pro"], category: "Vendas" },
  { key: "hasFiscal", label: "NFC-e / Fiscal", plans: ["business", "pro"], category: "Fiscal" },
  // Pro-only features
  { key: "hasBranches", label: "Gestão de Filiais", plans: ["pro"], category: "Pro" },
  { key: "hasDiagnostico", label: "Diagnóstico Financeiro IA", plans: ["pro"], category: "Pro" },
  { key: "hasRuptura", label: "Relatório de Ruptura", plans: ["pro"], category: "Pro" },
  { key: "hasSugestaoCompra", label: "Sugestão de Compra", plans: ["pro"], category: "Pro" },
  // Full financial (Pro)
  { key: "hasDre", label: "DRE", plans: ["pro"], category: "Financeiro Avançado" },
  { key: "hasCashFlow", label: "Fluxo de Caixa Projetado", plans: ["pro"], category: "Financeiro Avançado" },
  { key: "hasCostCenter", label: "Centro de Custo", plans: ["pro"], category: "Financeiro Avançado" },
  { key: "hasCommissions", label: "Comissões", plans: ["pro"], category: "Financeiro Avançado" },
  { key: "hasBankReconciliation", label: "Conciliação Bancária", plans: ["pro"], category: "Financeiro Avançado" },
];

const PLANS: { tier: PlanTier; label: string; price: string; color: string }[] = [
  { tier: "starter", label: "Starter", price: "R$ 149,90", color: "bg-muted text-muted-foreground" },
  { tier: "business", label: "Business", price: "R$ 199,90", color: "bg-info/10 text-info" },
  { tier: "pro", label: "Pro", price: "R$ 449,90", color: "bg-warning/10 text-warning" },
  { tier: "emissor", label: "Emissor", price: "R$ 99,90", color: "bg-chart-3/10 text-chart-3" },
];

export default function AdminPlanTester() {
  const { companyId } = useCompany();
  const [currentPlan, setCurrentPlan] = useState<PlanTier | null>(null);
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});

  const loadCurrentPlan = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("company_plans")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    setCurrentPlan((data as any)?.plan || "starter");
  };

  const simulatePlan = async (tier: PlanTier) => {
    if (!companyId) { toast.error("Empresa não identificada"); return; }
    setLoading(true);
    try {
      const planConfig: Record<PlanTier, any> = {
        starter: {
          plan: "starter", max_users: 1, fiscal_enabled: false,
          advanced_reports_enabled: false, financial_module_level: "basic",
        },
        business: {
          plan: "business", max_users: 5, fiscal_enabled: true,
          advanced_reports_enabled: true, financial_module_level: "basic",
        },
        pro: {
          plan: "pro", max_users: 999, fiscal_enabled: true,
          advanced_reports_enabled: true, financial_module_level: "full",
        },
        emissor: {
          plan: "emissor", max_users: 2, fiscal_enabled: true,
          advanced_reports_enabled: false, financial_module_level: "basic",
        },
      };

      const { error } = await supabase
        .from("company_plans" as any)
        .upsert({
          company_id: companyId,
          ...planConfig[tier],
          status: "active",
        }, { onConflict: "company_id" });

      if (error) throw error;

      setCurrentPlan(tier);

      // Build expected results
      const results: Record<string, boolean> = {};
      FEATURES.forEach(f => {
        results[f.key] = f.plans.includes(tier);
      });
      setTestResults(results);

      toast.success(`Plano alterado para ${tier.toUpperCase()} — recarregue a página para ver o efeito no PlanGate`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Load on mount
  if (currentPlan === null) loadCurrentPlan();

  const categories = [...new Set(FEATURES.map(f => f.category))];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-primary" />
        <div>
          <h2 className="text-lg font-bold text-foreground">Teste de Planos</h2>
          <p className="text-sm text-muted-foreground">
            Simule cada plano para verificar as restrições de features.
          </p>
        </div>
      </div>

      {/* Current plan */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Plano atual da empresa:</span>
        <Badge variant="outline" className="font-mono uppercase">
          {currentPlan || "carregando..."}
        </Badge>
      </div>

      {/* Simulate buttons */}
      <div className="flex flex-wrap gap-3">
        {PLANS.map(p => (
          <Button
            key={p.tier}
            variant={currentPlan === p.tier ? "default" : "outline"}
            size="sm"
            disabled={loading}
            onClick={() => simulatePlan(p.tier)}
          >
            Simular {p.label} ({p.price})
          </Button>
        ))}
      </div>

      {Object.keys(testResults).length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            O plano foi alterado no banco. <strong>Recarregue a página (F5)</strong> para que o PlanGate reflita a mudança. Após testar, restaure o plano correto.
          </p>
        </div>
      )}

      {/* Feature matrix */}
      <div className="bg-card rounded-xl border border-border overflow-hidden relative z-10">
        <div className="overflow-auto" style={{ touchAction: "auto", WebkitOverflowScrolling: "touch" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Recurso</th>
                {PLANS.map(p => (
                  <th key={p.tier} className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase">
                    <Badge className={p.color}>{p.label}</Badge>
                  </th>
                ))}
                {Object.keys(testResults).length > 0 && (
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase">
                    Resultado
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <>
                  <tr key={`cat-${cat}`}>
                    <td colSpan={PLANS.length + 2} className="px-4 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {cat}
                    </td>
                  </tr>
                  {FEATURES.filter(f => f.category === cat).map(f => (
                    <tr key={f.key} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-foreground">{f.label}</td>
                      {PLANS.map(p => (
                        <td key={p.tier} className="text-center px-4 py-2.5">
                          {f.plans.includes(p.tier) ? (
                            <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                          ) : (
                            <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                          )}
                        </td>
                      ))}
                      {Object.keys(testResults).length > 0 && (
                        <td className="text-center px-4 py-2.5">
                          {testResults[f.key] ? (
                            <Badge variant="outline" className="border-emerald-500 text-emerald-600 text-[10px]">
                              Liberado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-destructive text-destructive text-[10px]">
                              Bloqueado
                            </Badge>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sessions info */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-2">
        <h3 className="font-semibold text-foreground text-sm">Sessões Simultâneas por Plano</h3>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-muted-foreground">Starter: <strong className="text-foreground">3</strong></span>
          <span className="text-muted-foreground">Business: <strong className="text-foreground">8</strong></span>
          <span className="text-muted-foreground">Pro: <strong className="text-foreground">∞</strong></span>
          <span className="text-muted-foreground">Emissor: <strong className="text-foreground">2</strong></span>
        </div>
      </div>
    </div>
  );
}
