import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Package, ShoppingCart, CheckCircle2, ArrowRight, ArrowLeft, Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logoAs from "@/assets/logo-as.png";

interface Props {
  onComplete: () => void;
}

const STEPS = [
  { icon: Rocket, title: "Bem-vindo", subtitle: "Vamos configurar seu negócio" },
  { icon: Building2, title: "Sua Empresa", subtitle: "Dados básicos do estabelecimento" },
  { icon: Package, title: "Primeiro Produto", subtitle: "Cadastre um produto para começar" },
  { icon: ShoppingCart, title: "Pronto!", subtitle: "Tudo configurado para vender" },
];

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 — Company
  const [companyName, setCompanyName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [phone, setPhone] = useState("");

  // Step 2 — Product
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productStock, setProductStock] = useState("");

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const handleCreateCompany = async () => {
    if (!companyName.trim()) {
      toast.error("Informe o nome da empresa");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Check if user already has a company
      const { data: existing } = await supabase
        .from("company_users")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (existing) {
        toast.info("Você já possui uma empresa cadastrada!");
        next();
        return;
      }

      // Create company directly (RLS allows authenticated users)
      const { data: company, error: companyErr } = await supabase
        .from("companies")
        .insert({
          name: companyName.trim(),
          cnpj: cnpj.replace(/\D/g, "") || "",
          phone: phone.trim() || null,
        } as any)
        .select("id")
        .single();

      if (companyErr) throw companyErr;

      // Link user as admin
      const { error: linkErr } = await supabase
        .from("company_users")
        .insert({
          company_id: company.id,
          user_id: user.id,
          role: "admin",
          is_active: true,
        } as any);

      if (linkErr) throw linkErr;

      toast.success("Empresa criada com sucesso!");
      next();
    } catch (err: any) {
      console.error("[Onboarding] Error:", err);
      toast.error(err.message || "Erro ao criar empresa");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!productName.trim() || !productPrice) {
      toast.error("Informe nome e preço do produto");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Get company
      const { data: cu } = await supabase
        .from("company_users")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!cu) throw new Error("Empresa não encontrada");

      const { error } = await supabase.from("products").insert({
        company_id: cu.company_id,
        name: productName.trim(),
        price: parseFloat(productPrice),
        stock_quantity: parseInt(productStock) || 0,
        unit: "UN",
        sku: `PRD-${Date.now().toString(36).toUpperCase()}`,
      } as any);

      if (error) throw error;

      toast.success("Produto cadastrado!");
      next();
    } catch (err: any) {
      toast.error(err.message || "Erro ao cadastrar produto");
    } finally {
      setSaving(false);
    }
  };

  const handleSkipProduct = () => next();

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i <= step ? "bg-primary w-10" : "bg-muted w-6"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
            className="bg-card border border-border rounded-2xl p-8 shadow-xl"
          >
            {/* Step 0 — Welcome */}
            {step === 0 && (
              <div className="text-center space-y-6">
                <img src={logoAs} alt="AnthoSystem" className="w-20 h-20 mx-auto rounded-xl" />
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Bem-vindo ao AnthoSystem!</h1>
                  <p className="text-muted-foreground mt-2">
                    Vamos configurar seu supermercado em poucos passos. Leva menos de 2 minutos.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { icon: "🛒", label: "PDV Rápido" },
                    { icon: "📦", label: "Estoque" },
                    { icon: "💰", label: "Financeiro" },
                  ].map((f) => (
                    <div key={f.label} className="bg-muted/50 rounded-xl p-3">
                      <span className="text-2xl">{f.icon}</span>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">{f.label}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={next}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
                >
                  Começar <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Step 1 — Company */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">Dados da Empresa</h2>
                  <p className="text-sm text-muted-foreground mt-1">Você pode editar depois em Configurações</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-foreground">Nome da empresa *</label>
                    <input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Ex: Supermercado Bom Preço"
                      className="w-full mt-1 px-4 py-3 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">CNPJ <span className="text-muted-foreground">(opcional)</span></label>
                    <input
                      value={cnpj}
                      onChange={(e) => setCnpj(e.target.value)}
                      placeholder="00.000.000/0000-00"
                      className="w-full mt-1 px-4 py-3 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Telefone <span className="text-muted-foreground">(opcional)</span></label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full mt-1 px-4 py-3 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={prev}
                    className="px-4 py-3 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCreateCompany}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : "Próximo"} {!saving && <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — First Product */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Package className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">Primeiro Produto</h2>
                  <p className="text-sm text-muted-foreground mt-1">Cadastre um produto de exemplo para testar o PDV</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-foreground">Nome do produto *</label>
                    <input
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="Ex: Arroz 5kg"
                      className="w-full mt-1 px-4 py-3 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">Preço (R$) *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={productPrice}
                        onChange={(e) => setProductPrice(e.target.value)}
                        placeholder="29.90"
                        className="w-full mt-1 px-4 py-3 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Estoque</label>
                      <input
                        type="number"
                        value={productStock}
                        onChange={(e) => setProductStock(e.target.value)}
                        placeholder="100"
                        className="w-full mt-1 px-4 py-3 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={prev}
                    className="px-4 py-3 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCreateProduct}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : "Cadastrar"} {!saving && <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={handleSkipProduct}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Pular por enquanto →
                </button>
              </div>
            )}

            {/* Step 3 — Done */}
            {step === 3 && (
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-accent-foreground" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Tudo pronto! 🎉</h2>
                  <p className="text-muted-foreground mt-2">
                    Sua empresa está configurada. Agora explore o sistema:
                  </p>
                </div>

                <div className="space-y-2 text-left">
                  {[
                    { icon: "🛒", text: "Abra o PDV e faça sua primeira venda" },
                    { icon: "📦", text: "Cadastre mais produtos em Estoque" },
                    { icon: "👥", text: "Convide sua equipe em Usuários" },
                    { icon: "🧾", text: "Configure a emissão fiscal depois" },
                  ].map((tip) => (
                    <div key={tip.text} className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-xl">
                      <span className="text-lg">{tip.icon}</span>
                      <span className="text-sm text-foreground">{tip.text}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={onComplete}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
                >
                  Ir para o Dashboard <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Você tem <strong>15 dias grátis</strong> para testar todas as funcionalidades.
        </p>
      </div>
    </div>
  );
}
