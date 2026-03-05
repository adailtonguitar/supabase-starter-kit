import { useState, useEffect, useRef } from "react";
import { Download, Upload, Clock, HardDrive, Percent, Save, Loader2, Crown, Check, ArrowRight, MessageCircle, Pencil, Calculator, Send, Mail, Lock, Eye, EyeOff, Wallet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TEFConfigSection } from "@/components/settings/TEFConfigSection";
import { ScaleConfigSection } from "@/components/settings/ScaleConfigSection";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscription, PLANS } from "@/hooks/useSubscription";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useCompany } from "@/hooks/useCompany";

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
  essencial: ["1 terminal PDV", "Até 500 produtos", "Até 200 notas/mês", "Controle de estoque", "Financeiro básico", "Relatórios de vendas", "Suporte por e-mail"],
  profissional: ["Até 5 terminais PDV", "Produtos ilimitados", "NF-e + NFC-e", "Relatórios avançados com IA", "Programa de fidelidade", "Multi-usuários e permissões", "Orçamentos e cotações", "Curva ABC e painel de lucro", "Suporte prioritário"],
};

function MyPlanSection() {
  const { subscribed, planKey, trialActive, trialDaysLeft, subscriptionEnd, createCheckout, loading } = useSubscription();
  const { isSuperAdmin, loading: adminLoading } = useAdminRole();
  const [upgrading, setUpgrading] = useState(false);

  if (loading || adminLoading) return null;
  if (isSuperAdmin) return null;

  const currentPlan = planKey && PLANS[planKey as keyof typeof PLANS] ? PLANS[planKey as keyof typeof PLANS] : null;
  const isEssencial = planKey === "essencial";
  const features = planKey ? planFeatures[planKey] || [] : [];

  const handleUpgrade = async () => {
    try {
      setUpgrading(true);
      await createCheckout("profissional");
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
        {subscribed && currentPlan ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-lg font-bold text-foreground">{currentPlan.name}</span>
                <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">Ativo</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-extrabold text-foreground">R$ {currentPlan.price.toFixed(2).replace(".", ",")}</span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
            </div>
            {subscriptionEnd && <p className="text-xs text-muted-foreground">Próxima renovação: {new Date(subscriptionEnd).toLocaleDateString("pt-BR")}</p>}
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>
            {isEssencial && (
              <Button size="sm" onClick={handleUpgrade} disabled={upgrading}>
                <ArrowRight className="w-4 h-4 mr-2" /> {upgrading ? "Redirecionando..." : "Fazer upgrade para Profissional"}
              </Button>
            )}
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
              <Button variant="secondary" size="sm" onClick={() => createCheckout("essencial").catch(() => toast.error("Erro ao iniciar checkout"))}>
                Essencial — R$ 149,90/mês
              </Button>
              <Button size="sm" onClick={() => createCheckout("profissional").catch(() => toast.error("Erro ao iniciar checkout"))}>
                Profissional — R$ 199,90/mês
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Você não possui uma assinatura ativa.</p>
            <Button size="sm" onClick={() => createCheckout("profissional").catch(() => toast.error("Erro ao iniciar checkout"))}>
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

export default function Configuracoes() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-company-data?download=true`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
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
    setImporting(true);
    try {
      const text = await file.text();
      let backup: any;
      try { backup = JSON.parse(text); } catch { toast.error("Arquivo JSON inválido"); setImporting(false); return; }
      if (!backup.version || !backup.data) { toast.error("Este arquivo não parece ser um backup válido do sistema"); setImporting(false); return; }
      const { data, error } = await supabase.functions.invoke("import-company-data", { body: { backup } });
      if (error) { toast.error("Erro ao importar: " + error.message); return; }
      if (data?.success) {
        const totalImported = data.total_imported || 0;
        const totalErrors = data.total_errors || 0;
        if (totalErrors > 0) toast.warning(`Importação concluída: ${totalImported} registros importados, ${totalErrors} erros`);
        else toast.success(`Backup restaurado com sucesso! ${totalImported} registros importados.`);
      } else { toast.error(data?.error || "Erro ao importar backup"); }
    } catch { toast.error("Erro ao processar arquivo de backup"); } finally { setImporting(false); }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Configurações gerais do sistema</p>
      </motion.div>

      <ChangePasswordSection />
      <MyPlanSection />
      <CashRegisterToggleSection />
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
              Faça upload de um arquivo <strong>.json</strong> exportado anteriormente pelo sistema.
            </p>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportBackup} className="hidden" id="backup-file-input" />
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing || exporting}>
              {importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              {importing ? "Importando..." : "Restaurar Backup (JSON)"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
