import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Upload, Clock, HardDrive, Percent, Save, Loader2, Crown, Check, ArrowRight, MessageCircle, Pencil, Calculator, Send, Mail, Lock, Eye, EyeOff, Wallet, FileText, ShieldAlert, X, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TEFConfigSection } from "@/components/settings/TEFConfigSection";
import { ScaleConfigSection } from "@/components/settings/ScaleConfigSection";
import { motion } from "framer-motion";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscription } from "@/hooks/useSubscription";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useCompany } from "@/hooks/useCompany";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { getFiscalReadiness, getFiscalReadinessPrimaryFixRoute, getFiscalReadinessPrimaryIssue, type FiscalReadinessResult } from "@/lib/fiscal-readiness";
import { useProducts, useBulkUpdateProducts, type Product } from "@/hooks/useProducts";
import { useFiscalCategories } from "@/hooks/useFiscalCategories";
import { type TaxRegime } from "@/lib/cst-csosn-validator";
import { getSuggestedFiscalUpdate, getChangedFiscalFields, getFiscalSuggestionDiagnostics, getBulkFiscalFixAnalysis } from "@/lib/fiscal-product-suggestions";
import { messageFromFunctionsInvokeError } from "@/lib/supabase-function-error";
import { getAccessTokenForEdgeFunctions } from "@/lib/supabase-edge-auth";
import { SubscriptionCancelWizard } from "@/components/subscription/SubscriptionCancelWizard";
import { LgpdDataSection } from "@/components/lgpd/LgpdDataSection";

/** Alinhado a useCompany / Filiais — define qual empresa abrir após reload. */
const LS_SELECTED_COMPANY_KEY = "as_selected_company";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function WhatsAppSupportSection() {
  const { role } = usePermissions();
  const { companyId } = useCompany();
  const [number, setNumber] = useState("");
  const [savedNumber, setSavedNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      const { data } = await supabase.from("companies").select("whatsapp_support").eq("id", companyId).single();
      if (data?.whatsapp_support) {
        setNumber(data.whatsapp_support);
        setSavedNumber(data.whatsapp_support);
      }
      setLoading(false);
    };
    load();
  }, [companyId]);

  const hasSaved = !!savedNumber;

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("companies").update({ whatsapp_support: number || null }).eq("id", companyId);
      if (error) throw error;
      setSavedNumber(number);
      setEditing(false);
      logAction({ companyId: companyId!, action: "WhatsApp de suporte atualizado", module: "configuracoes", details: number || "removido" });
      toast.success("WhatsApp de suporte salvo!");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (role !== "admin") return null;

  const isReadOnly = hasSaved && !editing;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-2xl card-shadow border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">WhatsApp de Suporte</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">Configure o número de WhatsApp que será exibido no botão flutuante de suporte para seus usuários.</p>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <input type="text" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="(11) 99999-9999" disabled={isReadOnly}
              className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed" />
            <div className="flex gap-3">
              {isReadOnly ? (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="w-4 h-4 mr-2" /> Editar
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Salvar
                  </Button>
                  {hasSaved && (
                    <Button variant="ghost" size="sm" onClick={() => { setNumber(savedNumber); setEditing(false); }}>
                      Cancelar
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  supervisor: "Supervisor",
  caixa: "Caixa",
};

const DEFAULT_LIMITS = [
  { role: "admin", max_discount_percent: 100 },
  { role: "gerente", max_discount_percent: 15 },
  { role: "supervisor", max_discount_percent: 10 },
  { role: "caixa", max_discount_percent: 5 },
];

function DiscountLimitsSection() {
  const { role } = usePermissions();
  const { companyId } = useCompany();
  const [limits, setLimits] = useState<{ id: string; role: string; max_discount_percent: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      const { data } = await supabase
        .from("discount_limits")
        .select("id, role, max_discount_percent")
        .eq("company_id", companyId)
        .order("max_discount_percent", { ascending: false });

      if (data && data.length > 0) {
        setLimits(data);
      } else {
        // Seed default limits for this company
        const toInsert = DEFAULT_LIMITS.map((d) => ({ ...d, company_id: companyId }));
        const { data: inserted, error } = await supabase
          .from("discount_limits")
          .insert(toInsert)
          .select("id, role, max_discount_percent");
        if (!error && inserted) {
          setLimits(inserted);
        } else {
          // If table doesn't exist or insert fails, show local defaults
          setLimits(DEFAULT_LIMITS.map((d, i) => ({ id: `local-${i}`, ...d })));
        }
      }
      setLoading(false);
    };
    load();
  }, [companyId]);

  const handleChange = (id: string, value: number) => {
    setEdited((prev) => ({ ...prev, [id]: Math.min(100, Math.max(0, value)) }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [id, val] of Object.entries(edited)) {
        if (id.startsWith("local-")) continue;
        const { error } = await supabase.from("discount_limits").update({ max_discount_percent: val }).eq("id", id);
        if (error) throw error;
      }
      setLimits((prev) => prev.map((l) => edited[l.id] !== undefined ? { ...l, max_discount_percent: edited[l.id] } : l));
      setEdited({});
      logAction({ companyId: companyId!, action: "Limites de desconto atualizados", module: "configuracoes" });
      toast.success("Limites de desconto salvos!");
    } catch {
      toast.error("Erro ao salvar limites");
    } finally {
      setSaving(false);
    }
  };

  if (role !== "admin") return null;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-2xl card-shadow border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Percent className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Limites de Desconto por Cargo</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">Defina o percentual máximo de desconto que cada cargo pode aplicar no PDV (por item ou no total).</p>
        {loading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : limits.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum limite configurado.</p>
        ) : (
          <div className="space-y-3">
            {limits.map((limit) => {
              const val = edited[limit.id] ?? limit.max_discount_percent;
              return (
                <div key={limit.id} className="flex items-center justify-between py-3 px-4 rounded-xl bg-muted/50 border border-border">
                  <span className="text-sm font-medium text-foreground">{roleLabels[limit.role] || limit.role}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={100} step={1} value={val} onChange={(e) => handleChange(limit.id, Number(e.target.value))}
                      className="w-20 px-2 py-1.5 rounded-lg bg-card border border-border text-sm font-mono text-right focus:outline-none focus:ring-1 focus:ring-primary/40" />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {Object.keys(edited).length > 0 && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Salvar Alterações
          </Button>
        )}
      </div>
    </motion.div>
  );
}

const planFeatures: Record<string, string[]> = {
  emissor: ["NF-e modelo 55 e 65", "Consulta DF-e", "Até 2 usuários", "Financeiro básico", "Ideal para MEI/ME"],
  starter: ["3 sessões simultâneas", "Controle de estoque", "Financeiro básico", "Relatórios de vendas", "Suporte por e-mail"],
  business: ["8 sessões simultâneas", "Emissão de NFC-e", "IA integrada", "Multi-usuários e permissões", "Programa de fidelidade", "Curva ABC e painel de lucro", "Suporte prioritário"],
  pro: ["Sessões ilimitadas", "Todos os módulos inclusos", "NF-e + NFC-e ilimitadas", "Relatórios avançados com IA", "Consulta DF-e", "Suporte dedicado"],
};

interface SubscriptionManagementState {
  id: string;
  status: string;
  plan_key: string | null;
  subscription_end: string | null;
  canceled_at: string | null;
  cancel_effective_date: string | null;
  refund_status: string | null;
  refund_amount: number | null;
}

function MyPlanSection() {
  const { access, trialActive, trialDaysLeft, createCheckout, loading, checkSubscription } = useSubscription();
  const { plan, expiresAt, loading: planLoading } = usePlanFeatures();
  const { isSuperAdmin, loading: adminLoading } = useAdminRole();
  const [upgrading, setUpgrading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [subManagement, setSubManagement] = useState<SubscriptionManagementState | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  const loadSubscriptionManagement = useCallback(async () => {
    setSubLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSubManagement(null);
        return;
      }
      const { data } = await supabase
        .from("subscriptions")
        .select("id, status, plan_key, subscription_end, canceled_at, cancel_effective_date, refund_status, refund_amount")
        .eq("user_id", user.id)
        .in("status", ["active", "scheduled_cancel"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setSubManagement((data as SubscriptionManagementState | null) ?? null);
    } catch (err) {
      console.warn("[MyPlanSection] loadSubscriptionManagement failed", err);
      setSubManagement(null);
    } finally {
      setSubLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !adminLoading && !isSuperAdmin) {
      void loadSubscriptionManagement();
    }
  }, [loading, adminLoading, isSuperAdmin, loadSubscriptionManagement]);

  const handleReactivate = async () => {
    setReactivating(true);
    try {
      const { data, error } = await supabase.functions.invoke("reactivate-subscription");
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      toast.success(data?.message || "Assinatura reativada com sucesso.");
      await loadSubscriptionManagement();
      await checkSubscription();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao reativar assinatura";
      toast.error(msg);
    } finally {
      setReactivating(false);
    }
  };

  if (loading || adminLoading || planLoading) return null;
  if (isSuperAdmin) return null;

  const currentPlanLabels: Record<string, { name: string; price: string }> = {
    starter: { name: "Starter", price: "149,90" },
    business: { name: "Business", price: "199,90" },
    pro: { name: "Pro", price: "349,90" },
    emissor: { name: "Emissor", price: "99,90" },
  };
  const currentPlan = currentPlanLabels[plan] ?? currentPlanLabels.starter;
  const features = planFeatures[plan] || [];
  const canUpgrade = plan === "starter" || plan === "emissor";
  const isScheduledCancel = subManagement?.status === "scheduled_cancel";

  const handleUpgrade = async () => {
    try {
      setUpgrading(true);
      await createCheckout("business");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao iniciar checkout");
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl card-shadow border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Crown className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Meu Plano</h2>
      </div>
      <div className="p-5 space-y-4">
        {isScheduledCancel && subManagement && (
          <div className="p-4 rounded-xl border border-warning/40 bg-warning/5 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="font-semibold text-sm text-foreground">Assinatura agendada para cancelamento</p>
                <p className="text-sm text-muted-foreground">
                  Você mantém acesso até{" "}
                  <strong>
                    {subManagement.cancel_effective_date
                      ? new Date(subManagement.cancel_effective_date).toLocaleDateString("pt-BR")
                      : "—"}
                  </strong>
                  . Não haverá cobrança de renovação.
                </p>
                {subManagement.refund_status === "pending" && subManagement.refund_amount && (
                  <p className="text-xs text-muted-foreground">
                    Reembolso pendente: R$ {Number(subManagement.refund_amount).toFixed(2).replace(".", ",")} (processado em até 5 dias úteis).
                  </p>
                )}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleReactivate} disabled={reactivating}>
              {reactivating ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              )}
              {reactivating ? "Reativando..." : "Reativar assinatura"}
            </Button>
          </div>
        )}

        {access ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-lg font-bold text-foreground">{currentPlan.name}</span>
                <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                  isScheduledCancel
                    ? "bg-warning/10 text-warning"
                    : "bg-primary/10 text-primary"
                }`}>
                  {isScheduledCancel ? "Agendado p/ cancelamento" : "Ativo"}
                </span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-extrabold text-foreground">R$ {currentPlan.price}</span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
            </div>
            {expiresAt && !isScheduledCancel && (
              <p className="text-xs text-muted-foreground">Próxima renovação: {new Date(expiresAt).toLocaleDateString("pt-BR")}</p>
            )}
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {canUpgrade && !isScheduledCancel && (
                <Button size="sm" onClick={handleUpgrade} disabled={upgrading}>
                  <ArrowRight className="w-4 h-4 mr-2" /> {upgrading ? "Redirecionando..." : "Fazer upgrade para Business"}
                </Button>
              )}
              {!isScheduledCancel && !subLoading && subManagement && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setCancelOpen(true)}
                >
                  <X className="w-4 h-4 mr-1.5" />
                  Cancelar assinatura
                </Button>
              )}
            </div>

            <SubscriptionCancelWizard
              open={cancelOpen}
              onClose={() => setCancelOpen(false)}
              onCanceled={async () => {
                await loadSubscriptionManagement();
                await checkSubscription();
              }}
              onDowngrade={async (planKey) => {
                await createCheckout(planKey);
              }}
            />
          </>
        ) : trialActive ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-lg font-bold text-foreground">Período de Teste</span>
                <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-warning/10 text-warning">{trialDaysLeft} dia{trialDaysLeft !== 1 ? "s" : ""} restante{trialDaysLeft !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Assine um plano para continuar usando o sistema após o período de teste.</p>
            <div className="flex gap-3 flex-wrap">
              <Button variant="secondary" size="sm" onClick={() => createCheckout("starter").catch(() => toast.error("Erro ao iniciar checkout"))}>
                Starter — R$ 149,90/mês
              </Button>
              <Button size="sm" onClick={() => createCheckout("business").catch(() => toast.error("Erro ao iniciar checkout"))}>
                Business — R$ 199,90/mês
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Você não possui uma assinatura ativa.</p>
            <Button size="sm" onClick={() => createCheckout("business").catch(() => toast.error("Erro ao iniciar checkout"))}>
              Assinar agora
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}

function AccountantSection() {
  const { role } = usePermissions();
  const { companyId } = useCompany();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [crc, setCrc] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [sendDay, setSendDay] = useState(5);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      const { data } = await supabase.from("companies").select("accountant_name, accountant_email, accountant_phone, accountant_crc, accountant_auto_send, accountant_send_day").eq("id", companyId).single();
      if (data) {
        setName((data as any).accountant_name || "");
        setEmail((data as any).accountant_email || "");
        setPhone((data as any).accountant_phone || "");
        setCrc((data as any).accountant_crc || "");
        setAutoSend((data as any).accountant_auto_send || false);
        setSendDay((data as any).accountant_send_day || 5);
        setHasSaved(!!(data as any).accountant_email);
      }
      setLoading(false);
    };
    load();
  }, [companyId]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("companies").update({
        accountant_name: name || null,
        accountant_email: email || null,
        accountant_phone: phone || null,
        accountant_crc: crc || null,
        accountant_auto_send: autoSend,
        accountant_send_day: sendDay,
      } as any).eq("id", companyId);
      if (error) throw error;
      setHasSaved(!!email);
      setEditing(false);
      toast.success("Dados do contador salvos!");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleSendReport = async () => {
    if (!email) { toast.error("Configure o e-mail do contador primeiro"); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-accountant-report", { body: { email } });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Relatório enviado para ${data.sent_to} (${data.period})`);
      } else {
        toast.error(data?.error || "Erro ao enviar relatório");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar relatório");
    } finally {
      setSending(false);
    }
  };

  if (role !== "admin" && role !== "gerente") return null;

  const isReadOnly = hasSaved && !editing;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-2xl card-shadow border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Calculator className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Integração com Contador</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">Configure os dados do seu contador para envio automático de relatórios fiscais mensais.</p>
        {loading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome do Contador</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João Silva" disabled={isReadOnly}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">E-mail do Contador *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contador@exemplo.com" disabled={isReadOnly}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Telefone</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" disabled={isReadOnly}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">CRC</label>
                <input type="text" value={crc} onChange={(e) => setCrc(e.target.value)} placeholder="CRC-SP 123456" disabled={isReadOnly}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed" />
              </div>
            </div>

            {!isReadOnly && (
              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20" />
                  <span className="text-sm text-foreground">Envio automático mensal</span>
                </label>
                {autoSend && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Dia</span>
                    <input type="number" min={1} max={28} value={sendDay} onChange={(e) => setSendDay(Number(e.target.value))}
                      className="w-16 px-2 py-1.5 rounded-lg bg-background border border-border text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/40" />
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 flex-wrap pt-2">
              {isReadOnly ? (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="w-4 h-4 mr-2" /> Editar
                  </Button>
                  <Button size="sm" onClick={handleSendReport} disabled={sending}>
                    {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                    {sending ? "Enviando..." : "Enviar Relatório Agora"}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={handleSave} disabled={saving || !email}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Salvar
                  </Button>
                  {hasSaved && (
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                      Cancelar
                    </Button>
                  )}
                </>
              )}
            </div>

            {hasSaved && isReadOnly && (
              <div className="flex items-center gap-2 pt-1">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Relatório fiscal mensal será enviado para <strong>{email}</strong>
                  {autoSend ? ` automaticamente no dia ${sendDay} de cada mês` : " quando você clicar em enviar"}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function ChangePasswordSection() {
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleChange = async () => {
    if (!newPwd || newPwd.length < 6) { toast.warning("A nova senha deve ter pelo menos 6 caracteres"); return; }
    if (newPwd !== confirmPwd) { toast.warning("As senhas não coincidem"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      toast.success("Senha alterada com sucesso!");
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar senha");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }} className="bg-card rounded-2xl card-shadow border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Lock className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Alterar Senha</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">Altere sua senha de acesso ao sistema.</p>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Nova Senha</label>
          <div className="relative">
            <input type={showNew ? "text" : "password"} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Mínimo 6 caracteres"
              className="w-full px-3 py-2 pr-10 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
            <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Confirmar Nova Senha</label>
          <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="Repita a nova senha"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
        </div>
        <Button onClick={handleChange} disabled={saving || !newPwd || !confirmPwd} size="sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
          {saving ? "Salvando..." : "Alterar Senha"}
        </Button>
      </div>
    </motion.div>
  );
}

function CarneConfigSection() {
  const { role } = usePermissions();
  const [enabled, setEnabled] = useState(() => localStorage.getItem("carne_enabled") === "true");
  const [format, setFormat] = useState<"a4" | "matricial">(() => (localStorage.getItem("carne_format") as any) || "a4");

  if (role !== "admin" && role !== "gerente") return null;

  const toggleEnabled = () => {
    const newVal = !enabled;
    setEnabled(newVal);
    localStorage.setItem("carne_enabled", String(newVal));
    toast.success(newVal ? "Impressão de carnê ativada" : "Impressão de carnê desativada");
  };

  const changeFormat = (f: "a4" | "matricial") => {
    setFormat(f);
    localStorage.setItem("carne_format", f);
    toast.success(f === "matricial" ? "Formato: Matricial (Epson LX)" : "Formato: A4 PDF");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="bg-card rounded-2xl card-shadow border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Impressão de Carnê</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">Habilite a geração de carnês para vendas a prazo. Ideal para lojas de móveis, eletrodomésticos e materiais de construção.</p>

        <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-muted/50 border border-border">
          <div>
            <p className="text-sm font-medium text-foreground">Habilitar carnê nas vendas a prazo</p>
            <p className="text-xs text-muted-foreground">Exibe o botão "Gerar Carnê" na tela de Fiado</p>
          </div>
          <button onClick={toggleEnabled} className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>

        {enabled && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Formato de impressão</p>
            <div className="flex gap-2">
              <button onClick={() => changeFormat("a4")}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all border ${format === "a4" ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-accent"}`}>
                <div className="font-semibold">A4 (PDF)</div>
                <div className="text-[10px] mt-0.5 opacity-70">Impressoras comuns, jato de tinta, laser</div>
              </button>
              <button onClick={() => changeFormat("matricial")}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all border ${format === "matricial" ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-accent"}`}>
                <div className="font-semibold">Matricial (Epson LX)</div>
                <div className="text-[10px] mt-0.5 opacity-70">Formulário contínuo, LX-350, FX-890</div>
              </button>
            </div>

            {format === "matricial" && (
              <div className="mt-3 p-3 rounded-xl bg-primary/5 border border-primary/10 space-y-1.5">
                <p className="text-xs font-semibold text-primary">💡 Dica: Configuração da impressora matricial</p>
                <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
                  <li>No <strong>Windows</strong>, vá em Painel de Controle → Dispositivos e Impressoras</li>
                  <li>Clique com o botão direito na <strong>EPSON LX-350</strong> → Propriedades</li>
                  <li>Em "Papel", selecione <strong>"Formulário contínuo"</strong> ou <strong>"Fanfold"</strong></li>
                  <li>Configure a largura para <strong>80 colunas</strong> (padrão)</li>
                  <li>Conecte via <strong>USB</strong> ou <strong>porta paralela (LPT1)</strong></li>
                  <li>Modelos compatíveis: LX-350, LX-300+II, FX-890, FX-2190</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function CashRegisterToggleSection() {
  const { role } = usePermissions();
  const [required, setRequired] = useState(() => localStorage.getItem("pdv_require_cash_session") !== "false");

  if (role !== "admin" && role !== "gerente") return null;

  const toggle = () => {
    const newVal = !required;
    setRequired(newVal);
    localStorage.setItem("pdv_require_cash_session", String(newVal));
    toast.success(newVal ? "Abertura de caixa obrigatória ativada" : "Abertura de caixa agora é opcional");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }} className="bg-card rounded-2xl card-shadow border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Wallet className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Controle de Caixa no PDV</h2>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-sm text-muted-foreground">Defina se o operador deve abrir um caixa antes de usar o PDV.</p>
        <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-muted/50 border border-border">
          <div>
            <p className="text-sm font-medium text-foreground">Exigir abertura de caixa</p>
            <p className="text-xs text-muted-foreground">Quando desativado, o PDV abre diretamente sem sessão de caixa</p>
          </div>
          <button onClick={toggle} className={`relative w-11 h-6 rounded-full transition-colors ${required ? "bg-primary" : "bg-muted-foreground/30"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${required ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function PdvFiscalAutomationSection() {
  const { role } = usePermissions();
  const { companyId } = useCompany();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      const { data } = await supabase
        .from("companies")
        .select("pdv_auto_emit_nfce")
        .eq("id", companyId)
        .single();
      setEnabled(data?.pdv_auto_emit_nfce ?? true);
      setLoading(false);
    };
    load();
  }, [companyId]);

  if (role !== "admin" && role !== "gerente") return null;

  const toggle = async () => {
    if (!companyId || loading || saving) return;
    const next = !enabled;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({ pdv_auto_emit_nfce: next })
        .eq("id", companyId);
      if (error) throw error;
      setEnabled(next);
      logAction({
        companyId,
        action: "Automação fiscal do PDV atualizada",
        module: "configuracoes",
        details: next ? "Emissão automática NFC-e ativada" : "Emissão automática NFC-e desativada",
      });
      toast.success(next ? "PDV configurado para emitir NFC-e automaticamente" : "PDV configurado para não emitir NFC-e automaticamente");
    } catch {
      toast.error("Erro ao salvar configuração fiscal do PDV");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.075 }} className="bg-card rounded-2xl card-shadow border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">NFC-e Automática no PDV</h2>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-sm text-muted-foreground">Define o comportamento padrão do caixa. Quando ativado, o PDV emite NFC-e automaticamente nas vendas elegíveis, sem checkbox manual na tela.</p>
        {loading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-muted/50 border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Emitir NFC-e automaticamente no PDV</p>
              <p className="text-xs text-muted-foreground">Se desativado, as vendas do caixa serão concluídas sem emissão automática de NFC-e</p>
            </div>
            <button onClick={toggle} disabled={saving} className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function FiscalReadinessSection() {
  const { role } = usePermissions();
  const { companyId, taxRegime: rawTaxRegime } = useCompany();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<FiscalReadinessResult | null>(null);
  const [lastBulkFixAt, setLastBulkFixAt] = useState<string | null>(null);
  const [lastBulkFixSummary, setLastBulkFixSummary] = useState<string | null>(null);
  const [showBulkFixConfirm, setShowBulkFixConfirm] = useState(false);
  const { data: products = [] } = useProducts();
  const { data: fiscalCategories = [] } = useFiscalCategories();
  const bulkUpdateProducts = useBulkUpdateProducts();
  const canView = role === "admin" || role === "gerente";
  const taxRegime: TaxRegime = rawTaxRegime === "lucro_presumido"
    ? "lucro_presumido"
    : rawTaxRegime === "lucro_real"
      ? "lucro_real"
      : "simples_nacional";

  const bulkFixAnalysis = useMemo(
    () => getBulkFiscalFixAnalysis(products, fiscalCategories, taxRegime),
    [products, fiscalCategories, taxRegime],
  );
  const pendingFiscalProducts = bulkFixAnalysis.pendingFiscalProducts;
  const criticalConflictProducts = bulkFixAnalysis.criticalConflictProducts;
  const excludedCriticalBulkProducts = bulkFixAnalysis.excludedCriticalBulkProducts;
  const pendingBulkFixProducts = bulkFixAnalysis.pendingBulkFixProducts;
  const actionableBulkFixCount = bulkFixAnalysis.actionableBulkFixCount;
  const bulkFixPreview = bulkFixAnalysis.bulkFixPreview;

  const buildSuggestedFiscalUpdate = useCallback((product: Product): Partial<Product> => {
    return getSuggestedFiscalUpdate(product, fiscalCategories, taxRegime);
  }, [fiscalCategories, taxRegime]);

  const reloadReadiness = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    Promise.all([
      getFiscalReadiness(companyId),
      supabase
        .from("action_logs")
        .select("created_at, details")
        .eq("company_id", companyId)
        .eq("module", "produtos")
        .eq("action", "Produtos atualizados em lote")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
      .then(([data, bulkLog]) => {
        setResult(data);
        setLastBulkFixAt((bulkLog.data as { created_at?: string } | null)?.created_at || null);
        setLastBulkFixSummary((bulkLog.data as { details?: string } | null)?.details || null);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;

    let mounted = true;
    setLoading(true);
    Promise.all([
      getFiscalReadiness(companyId),
      supabase
        .from("action_logs")
        .select("created_at, details")
        .eq("company_id", companyId)
        .eq("module", "produtos")
        .eq("action", "Produtos atualizados em lote")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
      .then(([data, bulkLog]) => {
        if (!mounted) return;
        setResult(data);
        setLastBulkFixAt((bulkLog.data as { created_at?: string } | null)?.created_at || null);
        setLastBulkFixSummary((bulkLog.data as { details?: string } | null)?.details || null);
      })
      .catch(() => {
        if (mounted) {
          setResult({
            status: "incomplete",
            issues: [{
              code: "fiscal_readiness_error",
              label: "Falha ao verificar prontidão",
              message: "Nao foi possivel validar as pendencias fiscais da empresa.",
              severity: "error",
            }],
          });
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [companyId]);

  const handleRunBulkFiscalFix = async () => {
    const updates = pendingBulkFixProducts
      .map((product) => ({ product, data: buildSuggestedFiscalUpdate(product) }))
      .filter(({ product, data }) => getChangedFiscalFields(product, data).length > 0)
      .map(({ product, data }) => ({ id: product.id, data }));
    await bulkUpdateProducts.mutateAsync(updates);
    setShowBulkFixConfirm(false);
    reloadReadiness();
  };

  const issues = result?.issues || [];
  const ready = result?.status === "ready";
  const invalidProductsIssue = issues.find((issue) => issue.code === "products_fiscal_invalid");
  const criticalConflictIssue = issues.find((issue) => issue.code === "products_fiscal_conflict");
  const primaryIssue = getFiscalReadinessPrimaryIssue(result);
  const primaryFixRoute = getFiscalReadinessPrimaryFixRoute(result);
  const primaryIssueCode = primaryIssue?.code || "";
  const issueRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!canView) return;
    if (loading) return;
    if (ready) return;
    if (!primaryIssueCode) return;

    const el = issueRefs.current[primaryIssueCode];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [canView, loading, ready, primaryIssueCode]);

  if (!canView) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="bg-card rounded-2xl card-shadow border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Prontidão Fiscal</h2>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-sm text-muted-foreground">Mostra se a empresa já está pronta para emitir NFC-e sem intervenção manual.</p>
        {loading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : ready ? (
          <div className="py-3 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
            Empresa pronta para emissão fiscal.
          </div>
        ) : (
          <div className="space-y-2">
            {primaryIssue && primaryFixRoute && (
              <div className="py-3 px-4 rounded-xl border border-primary/20 bg-primary/5">
                <p className="text-sm font-semibold text-foreground">Correção prioritária</p>
                <p className="text-xs text-muted-foreground mt-0.5">{primaryIssue.message}</p>
                <div className="mt-2">
                  <Button size="sm" onClick={() => navigate(primaryFixRoute)}>
                    Corrigir agora
                  </Button>
                </div>
              </div>
            )}
            {issues.filter((issue) => issue.code !== "products_fiscal_invalid" && issue.code !== "products_fiscal_conflict").map((issue) => (
              <div
                key={issue.code}
                ref={(el) => { issueRefs.current[issue.code] = el; }}
                className={`py-3 px-4 rounded-xl border ${issue.code === primaryIssueCode ? "ring-2 ring-primary/40" : ""} ${issue.severity === "error" ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300"}`}
              >
                <p className="text-sm font-semibold">{issue.label}</p>
                <p className="text-xs opacity-90">{issue.message}</p>
                {issue.route && (
                  <button
                    type="button"
                    className="text-[11px] opacity-80 mt-1 underline underline-offset-2"
                    onClick={() => navigate(issue.route === "/produtos" ? "/produtos?fiscal=pending" : issue.route)}
                  >
                    Abrir ajuste: {issue.route === "/produtos" ? "/produtos?fiscal=pending" : issue.route}
                  </button>
                )}
                {!!issue.details?.length && (
                  <div className="mt-2 space-y-1">
                    {issue.details.map((detail) => (
                      <p key={detail} className="text-[11px] opacity-90">
                        {detail}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {criticalConflictIssue && (
              <div
                ref={(el) => { issueRefs.current[criticalConflictIssue.code] = el; }}
                className={`py-3 px-4 rounded-xl border ${criticalConflictIssue.code === primaryIssueCode ? "ring-2 ring-primary/40" : ""} bg-destructive/10 border-destructive/20 text-destructive`}
              >
                <p className="text-sm font-semibold">{criticalConflictIssue.label}</p>
                <p className="text-xs opacity-90">{criticalConflictIssue.message}</p>
                <button
                  type="button"
                  className="text-[11px] opacity-80 mt-1 underline underline-offset-2"
                  onClick={() => navigate("/produtos?fiscal=pending")}
                >
                  Abrir revisão manual: /produtos?fiscal=pending
                </button>
                {!!criticalConflictIssue.details?.length && (
                  <div className="mt-2 space-y-1">
                    {criticalConflictIssue.details.map((detail) => (
                      <p key={detail} className="text-[11px] opacity-90">
                        {detail}
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-[11px] opacity-90 mt-2">
                  Esses conflitos nao entram na autocorreção em lote e exigem revisão manual.
                </p>
              </div>
            )}
            {invalidProductsIssue && (
              <div
                ref={(el) => { issueRefs.current[invalidProductsIssue.code] = el; }}
                className={`py-3 px-4 rounded-xl border ${invalidProductsIssue.code === primaryIssueCode ? "ring-2 ring-primary/40" : ""} bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300`}
              >
                <p className="text-sm font-semibold">{invalidProductsIssue.label}</p>
                <p className="text-xs opacity-90">{invalidProductsIssue.message}</p>
                <button
                  type="button"
                  className="text-[11px] opacity-80 mt-1 underline underline-offset-2"
                  onClick={() => navigate("/produtos?fiscal=pending")}
                >
                  Abrir autocorreção/manual: /produtos?fiscal=pending
                </button>
                {!!invalidProductsIssue.details?.length && (
                  <div className="mt-2 space-y-1">
                    {invalidProductsIssue.details.map((detail) => (
                      <p key={detail} className="text-[11px] opacity-90">
                        {detail}
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-[11px] opacity-90 mt-2">
                  Essas pendências podem ser parcialmente resolvidas pela autocorreção quando houver sugestão acionável.
                </p>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground pt-1">
              Pendências aqui indicam o que falta para prontidão sem surpresas; a SEFAZ valida de novo na emissão.
            </p>
          </div>
        )}
        {!loading && (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Resumo operacional</p>
            <p className="text-xs text-muted-foreground mt-1">
              Produtos com pendência autocorrigível: {invalidProductsIssue ? "sim" : "nao"}.
            </p>
            <p className="text-xs text-muted-foreground">
              Produtos com conflito crítico manual: {criticalConflictIssue ? "sim" : "nao"}.
            </p>
            <p className="text-xs text-muted-foreground">
              Última autocorreção em lote: {lastBulkFixAt ? new Date(lastBulkFixAt).toLocaleString("pt-BR") : "nenhuma registrada"}.
            </p>
            {lastBulkFixSummary && (
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3">
                {lastBulkFixSummary}
              </p>
            )}
            {!!pendingFiscalProducts.length && (
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={() => setShowBulkFixConfirm(true)}
                  disabled={bulkUpdateProducts.isPending || actionableBulkFixCount === 0}
                >
                  {bulkUpdateProducts.isPending ? "Reexecutando..." : "Reexecutar autocorreção em lote"}
                </Button>
                {!!criticalConflictProducts.length && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {criticalConflictProducts.length} produto(s) com conflito crítico ficam fora da autocorreção e precisam de revisão manual.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <AlertDialog open={showBulkFixConfirm} onOpenChange={setShowBulkFixConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reexecutar autocorreção fiscal em lote?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai aplicar novamente sugestões fiscais em {pendingBulkFixProducts.length} produto(s) elegíveis.
              {excludedCriticalBulkProducts.length > 0 ? ` ${excludedCriticalBulkProducts.length} conflito(s) crítico(s) ficarão fora do lote para revisão manual.` : ""}
              {actionableBulkFixCount === 0 ? " Nenhuma alteração real foi identificada nos produtos pendentes." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {bulkFixPreview.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-muted/40 px-3 py-2">
                <p className="text-sm font-semibold text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.changes.join(" | ")}</p>
              </div>
            ))}
            {actionableBulkFixCount > bulkFixPreview.length && (
              <p className="text-xs text-muted-foreground">
                ...e mais {actionableBulkFixCount - bulkFixPreview.length} produto(s).
              </p>
            )}
            {excludedCriticalBulkProducts.length > 0 && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2">
                <p className="text-sm font-semibold text-destructive">Fora da autocorreção</p>
                <div className="mt-1 space-y-1">
                  {excludedCriticalBulkProducts.slice(0, 5).map((product) => {
                    const diagnostics = getFiscalSuggestionDiagnostics(product, fiscalCategories, taxRegime);
                    return (
                      <p key={product.id} className="text-xs text-destructive/90">
                        {product.name}: {diagnostics.warnings.join(" | ")}
                      </p>
                    );
                  })}
                </div>
                {excludedCriticalBulkProducts.length > 5 && (
                  <p className="text-xs text-destructive/90 mt-1">
                    ...e mais {excludedCriticalBulkProducts.length - 5} produto(s) com revisão manual pendente.
                  </p>
                )}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRunBulkFiscalFix} className="bg-primary text-primary-foreground" disabled={actionableBulkFixCount === 0}>
              Confirmar autocorreção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

// FurnitureModeSection removed — segment is now defined at onboarding only

export default function Configuracoes() {
  const { companyName, companyId: activeCompanyId } = useCompany();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backupChoices, setBackupChoices] = useState<Array<{ key: string; companyName: string; totalRows: number; data: Record<string, unknown[]> }>>([]);
  const [selectedBackupKey, setSelectedBackupKey] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const normalizeCompanyName = useCallback((value: string | null | undefined) => {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }, []);

  const clearBackupSelection = useCallback(() => {
    setBackupChoices([]);
    setSelectedBackupKey("");
  }, []);

  const clearCompanyCache = useCallback(() => {
    localStorage.removeItem("as_cached_company");
    localStorage.removeItem("as_selected_company");
  }, []);

  const executeRestore = useCallback(async (backupData: Record<string, unknown[]>, sourceCompanyName: string) => {
    setImporting(true);

    try {
      const auth = await getAccessTokenForEdgeFunctions();
      if ("error" in auth) {
        throw new Error(auth.error);
      }

      const storedCompanyId =
        typeof window !== "undefined" ? window.localStorage.getItem(LS_SELECTED_COMPANY_KEY) : null;
      const targetCompanyId = activeCompanyId || storedCompanyId || undefined;

      const { data, error, response: fnResponse } = await supabase.functions.invoke("restore-my-backup", {
        body: {
          backup_data: backupData,
          source_company_name: sourceCompanyName,
          ...(targetCompanyId ? { target_company_id: targetCompanyId } : {}),
        },
        headers: { Authorization: `Bearer ${auth.token}` },
      });

      if (error) {
        throw new Error(await messageFromFunctionsInvokeError(error, fnResponse));
      }
      if (data?.error) throw new Error(data.error);

      const results = Array.isArray(data?.results) ? data.results : [];
      // Um resultado "insert" por tabela (servidor); evita somar linhas duplicadas de batches.
      const totalImported = results
        .filter((result: any) => result?.phase === "insert")
        .reduce((sum: number, result: any) => sum + Number(result?.count ?? 0), 0);
      const failedSteps = results.filter((result: any) => result?.error);
      const totalErrors = failedSteps.length;
      const errorDetail =
        totalErrors > 0
          ? failedSteps
              .slice(0, 4)
              .map((r: any) => `${r.table} (${r.phase}): ${String(r.error).slice(0, 140)}`)
              .join("\n")
          : "";

      logAction({
        companyId: data?.company_id,
        action: "Restauração de backup pela tela de configurações",
        module: "configuracoes",
        details: `Origem: ${sourceCompanyName}`,
      });

      const restoredName = typeof data?.company_name === "string" ? data.company_name : "";
      const restoredId = typeof data?.company_id === "string" ? data.company_id : "";
      const tenantHint = restoredName ? ` (“${restoredName}”)` : restoredId ? ` (ID ${restoredId.slice(0, 8)}…)` : "";

      const preview = data?.backup_rows_in_payload;
      const payloadSummary =
        preview && typeof preview === "object"
          ? `Conteúdo do JSON: ${preview.products ?? 0} produtos, ${preview.clients ?? 0} clientes, ${preview.sales ?? 0} vendas, ${preview.suppliers ?? 0} fornecedores.\n`
          : "";

      // Tempo para ler o toast antes do reload (o reload imediato apagava a mensagem).
      const reloadAfterMs = totalErrors > 0 ? 22_000 : 9_000;
      const reloadHint = `\n\n↻ Recarregando a página em ${Math.round(reloadAfterMs / 1000)}s…`;

      if (totalErrors > 0) {
        toast.warning(
          `Restauração parcial${tenantHint}: ${totalImported} registros gravados; ${totalErrors} etapa(s) com erro.`,
          {
            description:
              payloadSummary + (errorDetail || "Se produtos não subiram, veja a linha \"products\" nos erros abaixo.") + reloadHint,
            duration: reloadAfterMs + 5_000,
          },
        );
      } else if (data?.company_created) {
        toast.success(
          `Empresa recriada e backup restaurado${tenantHint}! ${totalImported} registros gravados no banco.`,
          { description: (payloadSummary + reloadHint).trim(), duration: reloadAfterMs + 5_000 },
        );
      } else {
        toast.success(
          `Backup restaurado${tenantHint}! ${totalImported} registros gravados no banco.`,
          { description: (payloadSummary + reloadHint).trim(), duration: reloadAfterMs + 5_000 },
        );
      }

      try {
        localStorage.removeItem("as_cached_company");
      } catch {
        /* */
      }
      if (restoredId) {
        try {
          localStorage.setItem(LS_SELECTED_COMPANY_KEY, restoredId);
        } catch {
          /* */
        }
      } else {
        clearCompanyCache();
      }

      setTimeout(() => {
        window.location.reload();
      }, reloadAfterMs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao restaurar backup", { duration: 45_000 });
    } finally {
      setImporting(false);
    }
  }, [activeCompanyId, clearCompanyCache]);

  const handleRestoreSelectedBackup = useCallback(async () => {
    const selectedBackup = backupChoices.find((choice) => choice.key === selectedBackupKey);
    if (!selectedBackup) {
      toast.error("Selecione a empresa do backup que deseja restaurar");
      return;
    }

    await executeRestore(selectedBackup.data, selectedBackup.companyName);
  }, [backupChoices, executeRestore, selectedBackupKey]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Faça login para exportar"); return; }
      const response = await supabase.functions.invoke("export-company-data", { body: {} });
      if (response.error) { toast.error("Erro ao exportar: " + response.error.message); return; }
      const result = response.data;
      if (result.success) {
        toast.success(`Backup criado! ${Object.values(result.records as Record<string, number>).reduce((a: number, b: number) => a + b, 0)} registros exportados.`);
      } else { toast.error(result.error || "Erro ao exportar"); }
    } catch { toast.error("Erro ao exportar dados"); } finally { setExporting(false); }
  };

  const handleDownloadExport = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Faça login para exportar"); return; }
      const url = `${SUPABASE_URL}/functions/v1/export-company-data?download=true`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
      });
      if (!res.ok) { toast.error("Erro ao baixar backup"); return; }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Backup baixado!");
    } catch { toast.error("Erro ao baixar backup"); } finally { setExporting(false); }
  };

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file.name.endsWith(".json")) { toast.error("Selecione um arquivo .json válido"); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error("Arquivo muito grande (máx. 50MB)"); return; }

    try {
      clearBackupSelection();
      const text = await file.text();
      let backup: any;
      try { backup = JSON.parse(text); } catch { toast.error("Arquivo JSON inválido"); return; }

      if (backup?.data && typeof backup.data === "object") {
        const sourceCompanyName = backup?.metadata?.company_name ?? companyName ?? "Backup manual";
        await executeRestore(backup.data, sourceCompanyName);
        return;
      }

      if (backup?.metadata && Array.isArray(backup?.backups)) {
        const choices = backup.backups
          .filter((entry: any) => entry?.data && typeof entry.data === "object")
          .map((entry: any) => ({
            key: String(entry.company_id ?? entry.company_name),
            companyName: String(entry.company_name ?? "Empresa sem nome").trim(),
            data: entry.data as Record<string, unknown[]>,
            totalRows: Object.values(entry.data).reduce<number>((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0),
          }));

        if (choices.length === 0) {
          toast.error("O backup semanal não possui empresas válidas para restaurar");
          return;
        }

        const preferredChoice = choices.find((choice) => normalizeCompanyName(choice.companyName) === normalizeCompanyName(companyName)) ?? choices[0];
        setBackupChoices(choices);
        setSelectedBackupKey(preferredChoice.key);

        if (choices.length === 1) {
          await executeRestore(preferredChoice.data, preferredChoice.companyName);
        } else {
          toast.success("Backup semanal carregado. Escolha a empresa que deseja restaurar.");
        }
        return;
      }

      toast.error("Este arquivo não parece ser um backup válido do sistema");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar arquivo de backup");
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Configurações gerais do sistema</p>
      </motion.div>

      
      <ChangePasswordSection />
      <MyPlanSection />
      <LgpdDataSection />
      <CashRegisterToggleSection />
      <PdvFiscalAutomationSection />
      <FiscalReadinessSection />
      <CarneConfigSection />
      <DiscountLimitsSection />
      <TEFConfigSection />
      <ScaleConfigSection />
      <AccountantSection />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl card-shadow border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Backup & Exportação</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">Exporte ou restaure todos os dados da empresa em formato JSON.</p>
          <div className="flex gap-3 flex-wrap">
            <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting || importing}>
              <Clock className={`w-4 h-4 mr-2 ${exporting ? "animate-spin" : ""}`} />
              {exporting ? "Exportando..." : "Salvar Backup no Cloud"}
            </Button>
            <Button size="sm" onClick={handleDownloadExport} disabled={exporting || importing}>
              <Download className="w-4 h-4 mr-2" /> Baixar Backup (JSON)
            </Button>
          </div>

          <div className="border-t border-border pt-4 mt-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Restaurar Backup</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Faça upload de um arquivo <strong>.json</strong> exportado pelo sistema ou do <strong>backup semanal consolidado</strong>.{" "}
              <strong>Não é obrigatório</strong> cadastrar a empresa antes: se você não tiver nenhuma empresa ativa na conta, ela será criada na restauração. Se já tiver mais de uma (filiais), os dados vão para a empresa em que você está usando o app agora — depois pode conferir em <strong>Filiais</strong>.
            </p>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportBackup} className="hidden" id="backup-file-input" />
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing || exporting}>
              {importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              {importing ? "Importando..." : "Restaurar Backup (JSON)"}
            </Button>

            {backupChoices.length > 1 && (
              <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Selecione a empresa do backup semanal</p>
                  <p className="text-xs text-muted-foreground mt-1">Encontramos {backupChoices.length} empresas dentro do arquivo enviado.</p>
                </div>

                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  value={selectedBackupKey}
                  onChange={(event) => setSelectedBackupKey(event.target.value)}
                  disabled={importing}
                >
                  {backupChoices.map((choice) => (
                    <option key={choice.key} value={choice.key}>
                      {choice.companyName} ({choice.totalRows} registros)
                    </option>
                  ))}
                </select>

                <Button size="sm" onClick={handleRestoreSelectedBackup} disabled={importing || !selectedBackupKey}>
                  {importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                  Restaurar empresa selecionada
                </Button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
