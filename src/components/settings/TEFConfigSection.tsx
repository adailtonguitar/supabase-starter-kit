import { useState, useEffect } from "react";
import { CreditCard, Save, Loader2, Eye, EyeOff, CheckCircle2, AlertCircle, Pencil, HelpCircle, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

const PROVIDERS = [
  { id: "cielo", name: "Cielo", fields: [{ key: "merchant_id", label: "Merchant ID" }, { key: "api_key", label: "Merchant Key", secret: true }] },
  { id: "rede", name: "Rede", fields: [{ key: "merchant_id", label: "PV (Nº Estabelecimento)" }, { key: "api_key", label: "Integration Key", secret: true }] },
  { id: "pagseguro", name: "PagSeguro", fields: [{ key: "api_key", label: "Access Token", secret: true }] },
  { id: "stone", name: "Stone / Pagar.me", fields: [{ key: "api_key", label: "API Key (Secret Key)", secret: true }] },
  { id: "mercadopago", name: "Mercado Pago", fields: [{ key: "api_key", label: "Access Token", secret: true }] },
] as const;

const PROVIDER_GUIDES: Record<string, { steps: string[]; url: string; urlLabel: string }> = {
  cielo: {
    steps: [
      "Acesse o portal Cielo: minhaconta.cielo.com.br",
      "Vá em Configurações → Dados Cadastrais",
      "Copie o Merchant ID e o Merchant Key",
      "Para sandbox, cadastre-se em desenvolvedores.cielo.com.br",
    ],
    url: "https://desenvolvedores.cielo.com.br",
    urlLabel: "Portal Cielo Developers",
  },
  rede: {
    steps: [
      "Acesse o portal e.Rede: userede.com.br",
      "Vá em e.Rede → Configurações → Token de Integração",
      "Copie o Nº do Estabelecimento (PV) e a Integration Key",
      "Solicite ativação do e-commerce ao seu gerente Rede se necessário",
    ],
    url: "https://www.userede.com.br",
    urlLabel: "Portal e.Rede",
  },
  pagseguro: {
    steps: [
      "Acesse pagseguro.uol.com.br e faça login",
      "Vá em Integrações → Gerar Token",
      "Copie o Access Token gerado",
      "Para sandbox, use sandbox.pagseguro.uol.com.br",
    ],
    url: "https://pagseguro.uol.com.br",
    urlLabel: "Painel PagSeguro",
  },
  stone: {
    steps: [
      "Acesse o Dashboard Pagar.me: dashboard.pagar.me",
      "Vá em Configurações → Chaves da API",
      "Copie a Secret Key (API Key)",
      "Use a Test Key para ambiente sandbox",
    ],
    url: "https://dashboard.pagar.me",
    urlLabel: "Dashboard Pagar.me",
  },
  mercadopago: {
    steps: [
      "Acesse developers.mercadopago.com.br",
      "Vá em Suas Integrações → Criar aplicação (ou selecione existente)",
      "Em Credenciais de Produção, copie o Access Token",
      "Para sandbox, use as Credenciais de Teste",
    ],
    url: "https://www.mercadopago.com.br/developers",
    urlLabel: "Mercado Pago Developers",
  },
};

type ProviderKey = (typeof PROVIDERS)[number]["id"];

interface TEFFormData {
  provider: ProviderKey | "";
  environment: "sandbox" | "production";
  merchant_id: string;
  api_key: string;
  terminal_id: string;
}

const emptyForm: TEFFormData = { provider: "", environment: "sandbox", merchant_id: "", api_key: "", terminal_id: "" };

export function TEFConfigSection() {
  const { companyId } = useCompany();
  const [form, setForm] = useState<TEFFormData>(emptyForm);
  const [saved, setSaved] = useState<TEFFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      const { data } = await supabase.from("tef_config").select("*").eq("company_id", companyId).maybeSingle();
      if (data) {
        const loaded: TEFFormData = {
          provider: (data as any).provider || "",
          environment: (data as any).environment || "sandbox",
          merchant_id: (data as any).merchant_id || "",
          api_key: (data as any).api_key || "",
          terminal_id: (data as any).terminal_id || "",
        };
        setForm(loaded);
        setSaved(loaded);
      }
      setLoading(false);
    };
    load();
  }, [companyId]);

  const handleSave = async () => {
    if (!companyId || !form.provider) { toast.error("Selecione um provedor"); return; }
    setSaving(true);
    try {
      const payload = { company_id: companyId, provider: form.provider, environment: form.environment, merchant_id: form.merchant_id || null, api_key: form.api_key || null, terminal_id: form.terminal_id || null };
      if (saved?.provider) {
        const { error } = await supabase.from("tef_config").update(payload).eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tef_config").insert(payload);
        if (error) throw error;
      }
      setSaved({ ...form });
      setEditing(false);
      toast.success("Configuração TEF salva!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("tef-gateway", {
        body: {
          action: "test",
          provider: form.provider,
          environment: form.environment,
          merchantId: form.merchant_id,
          apiKey: form.api_key,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success("Conexão com o provedor TEF bem-sucedida!");
      } else {
        toast.error(data?.error || "Falha no teste de conexão");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao testar conexão");
    } finally {
      setTesting(false);
    }
  };

  const selectedProvider = PROVIDERS.find((p) => p.id === form.provider);
  const hasSaved = !!saved?.provider;
  const isReadOnly = hasSaved && !editing;

  if (loading) {
    return (
      <div className="bg-card rounded-xl card-shadow border border-border p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl card-shadow border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Integração TEF</h2>
        </div>
        {hasSaved && (
          <div className="flex items-center gap-1.5 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            <span className="text-success font-medium">Configurado</span>
          </div>
        )}
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">Configure as credenciais do seu provedor de pagamento para processar transações de cartão no PDV.</p>

        {/* Provider selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provedor</label>
          <select
            value={form.provider}
            onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as ProviderKey }))}
            disabled={isReadOnly}
            className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <option value="">Selecione um provedor</option>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Environment */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ambiente</label>
          <div className="flex gap-2">
            {(["sandbox", "production"] as const).map((env) => (
              <button
                key={env}
                onClick={() => !isReadOnly && setForm((f) => ({ ...f, environment: env }))}
                disabled={isReadOnly}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  form.environment === env
                    ? env === "production"
                      ? "bg-destructive/10 border-destructive/30 border text-destructive"
                      : "bg-primary/10 border-primary/30 border text-primary"
                    : "bg-muted border border-border text-muted-foreground"
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {env === "sandbox" ? "🧪 Sandbox" : "🔴 Produção"}
              </button>
            ))}
          </div>
          {form.environment === "production" && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="w-3 h-3" />
              <span>Transações reais serão cobradas</span>
            </div>
          )}
        </div>

        {/* Dynamic fields per provider */}
        {selectedProvider && (
          <div className="space-y-3">
            {selectedProvider.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{field.label}</label>
                <div className="relative">
                  <input
                    type={field.secret && !showSecrets ? "password" : "text"}
                    value={(form as any)[field.key] || ""}
                    onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                    disabled={isReadOnly}
                    placeholder={`Insira ${field.label}`}
                    className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed pr-10 font-mono"
                  />
                  {field.secret && (
                    <button
                      type="button"
                      onClick={() => setShowSecrets(!showSecrets)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Terminal ID (optional, all providers) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Terminal ID (opcional)</label>
              <input
                type="text"
                value={form.terminal_id}
                onChange={(e) => setForm((f) => ({ ...f, terminal_id: e.target.value }))}
                disabled={isReadOnly}
                placeholder="Identificador do terminal"
                className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed font-mono"
              />
            </div>

            {/* Provider guide */}
            {PROVIDER_GUIDES[form.provider] && (
              <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-2 mb-2">
                  <HelpCircle className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Como obter as credenciais</span>
                </div>
                <ol className="space-y-1.5 ml-6 list-decimal">
                  {PROVIDER_GUIDES[form.provider].steps.map((step, i) => (
                    <li key={i} className="text-sm text-muted-foreground">{step}</li>
                  ))}
                </ol>
                <a
                  href={PROVIDER_GUIDES[form.provider].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  {PROVIDER_GUIDES[form.provider].urlLabel}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 flex-wrap pt-2">
          {isReadOnly ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition-all"
            >
              <Pencil className="w-4 h-4" /> Editar
            </button>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={saving || !form.provider}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
              </button>
              {hasSaved && (
                <button
                  onClick={() => { setForm({ ...saved! }); setEditing(false); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-medium hover:opacity-90 transition-all"
                >
                  Cancelar
                </button>
              )}
            </>
          )}
          {hasSaved && form.api_key && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Testar Conexão
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
