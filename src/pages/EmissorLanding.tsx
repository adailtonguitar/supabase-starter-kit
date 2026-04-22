import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { SEOHead } from "@/components/SEOHead";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText, Check, ArrowRight, Shield, Zap, Clock, Cloud,
  Building2, Mail, Lock, User, Eye, EyeOff, Loader2,
  Receipt, Settings, BarChart3, Package, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoAs from "@/assets/logo-as.webp";
import { LEGAL_CONFIG } from "@/config/legal";

const features = [
  { icon: FileText, title: "NF-e Modelo 55", desc: "Emissão completa com validação SEFAZ em tempo real" },
  { icon: Package, title: "Cadastro Fiscal", desc: "Produtos com NCM, CFOP, CST/CSOSN e alíquotas" },
  { icon: Shield, title: "Certificado A1/A3", desc: "Suporte a certificados digitais .pfx e token" },
  { icon: Cloud, title: "100% na Nuvem", desc: "Sem instalação, acesse de qualquer navegador" },
  { icon: BarChart3, title: "Relatório Fiscal", desc: "Acompanhe notas emitidas, rejeitadas e canceladas" },
  { icon: Settings, title: "Configuração Simples", desc: "Wizard de onboarding guiado passo a passo" },
];

const benefits = [
  "Emissão de NF-e modelo 55 ilimitada",
  "Cadastro de produtos com dados fiscais completos",
  "Cadastro de destinatários com endereço IBGE",
  "Ambiente de homologação para testes",
  "Download de XML autorizado",
  "Suporte via WhatsApp",
];

export default function EmissorLanding() {
  const [showSignUp, setShowSignUp] = useState(false);

  return (
    <div className="landing-animated h-screen overflow-y-auto overflow-x-hidden bg-background text-foreground scroll-smooth">
      <SEOHead
        title="Emissor NF-e Online"
        description="Emita NF-e modelo 55 de forma simples e rápida. Sistema completo de emissão de Nota Fiscal Eletrônica na nuvem, sem instalação. Certificado A1 e A3. R$99,90/mês."
        path="/emissor"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "AnthoSystem Emissor NF-e",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "description": "Emissor de NF-e modelo 55 completo na nuvem.",
          "url": "https://anthosystem.com.br/emissor",
          "offers": {
            "@type": "Offer",
            "price": "99.90",
            "priceCurrency": "BRL"
          }
        }}
      />
      <nav aria-label="Navegação principal do Emissor NF-e" className="sticky top-0 z-50 backdrop-blur-2xl bg-background/70 border-b border-border/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoAs} alt="AnthoSystem" className="w-8 h-8 rounded-lg object-contain" />
            <span className="text-lg font-extrabold tracking-tight">
              <span className="text-primary">Antho</span>
              <span className="text-foreground">System</span>
            </span>
            <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">EMISSOR</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button size="sm" onClick={() => setShowSignUp(true)} className="shadow-md font-semibold">
              Criar Conta
            </Button>
          </div>
        </div>
      </nav>

      <main id="main-content">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[100px]" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-24 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-semibold uppercase tracking-wider mb-6">
              <Receipt className="w-3.5 h-3.5" />
              Emissor NF-e Standalone
            </div>

            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-black tracking-tight leading-[1.1]">
              Emita{" "}
              <span className="text-primary">NF-e modelo 55</span>
              <br />
              de forma simples e rápida
            </h1>

            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Sistema completo de emissão de Nota Fiscal Eletrônica na nuvem.
              Sem instalação, sem complicação. Cadastre produtos, destinatários e emita em minutos.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-10">
              <Button size="lg" className="text-base px-8 h-13 shadow-lg shadow-primary/20 font-semibold" onClick={() => setShowSignUp(true)}>
                Começar agora — Grátis para testar
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button asChild variant="outline" size="lg" className="text-base px-8 h-13 font-medium">
                <a href="#recursos">Ver recursos</a>
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Setup em 5 minutos
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Certificado A1 e A3
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> Suporte humano
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="recursos" className="py-20 bg-card/40">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">Recursos</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Tudo que você precisa para emitir NF-e</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="rounded-2xl border border-border bg-card p-6 hover:border-primary/20 hover:shadow-lg transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">Plano</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Simples e acessível</h2>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl border-2 border-primary bg-gradient-to-b from-primary/5 to-card p-8 shadow-xl shadow-primary/10"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
              <div>
                <h3 className="text-2xl font-black">Emissor NF-e</h3>
                <p className="text-muted-foreground mt-1">Emissão completa de NF-e modelo 55</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-muted-foreground font-medium">R$</span>
                <span className="text-5xl font-black tracking-tight">99,90</span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mb-8">
              {benefits.map((b) => (
                <div key={b} className="flex items-start gap-2.5 text-sm">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-foreground/80">{b}</span>
                </div>
              ))}
            </div>

            <Button size="lg" className="w-full h-12 text-base font-semibold" onClick={() => setShowSignUp(true)}>
              Criar minha conta agora
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        </div>
      </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <img src={logoAs} alt="AnthoSystem" className="w-6 h-6 rounded-md object-contain" />
              <span className="text-sm font-bold">
                <span className="text-primary">Antho</span>System Emissor
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <Link to="/termos" className="hover:text-foreground transition-colors">Termos</Link>
              <Link to="/privacidade" className="hover:text-foreground transition-colors">Privacidade</Link>
              <Link to="/suporte" className="hover:text-foreground transition-colors">Suporte</Link>
              <Link to="/" className="hover:text-foreground transition-colors">Sistema Completo</Link>
            </div>
            <a
              href={`mailto:${LEGAL_CONFIG.supportEmail}`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {LEGAL_CONFIG.supportEmail}
            </a>
          </div>
          <div className="text-center text-xs text-muted-foreground leading-relaxed border-t border-border pt-4">
            © {new Date().getFullYear()} {LEGAL_CONFIG.companyLegalName} — CNPJ {LEGAL_CONFIG.companyCNPJ}
          </div>
        </div>
      </footer>

      {/* Self-service Sign Up Modal */}
      {showSignUp && <EmissorSignUpModal onClose={() => setShowSignUp(false)} />}
    </div>
  );
}

function EmissorSignUpModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    cnpj: "",
    full_name: "",
    email: "",
    password: "",
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim() || !form.email.trim() || !form.password) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Senha deve ter pelo menos 6 caracteres");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-emissor-client", {
        body: { ...form, self_service: true },
      });
      if (error) throw new Error(typeof error === "object" && "message" in error ? error.message : "Erro ao criar conta");
      if (data?.error) throw new Error(data.error);

      // Auto-login
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (loginErr) {
        toast.success("Conta criada! Faça login com suas credenciais.");
        navigate("/auth");
      } else {
        localStorage.setItem("emissor_signup", "1");
        toast.success("Conta criada com sucesso! Redirecionando...");
        navigate("/emissor-nfe");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="emissor-signup-title"
    >
      <motion.div
        ref={dialogRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-card rounded-2xl border border-border p-6 shadow-2xl relative"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar cadastro"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2 mb-6">
          <Receipt className="w-5 h-5 text-primary" aria-hidden="true" />
          <h2 id="emissor-signup-title" className="text-lg font-bold">Criar Conta — Emissor NF-e</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Nome da Empresa *</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={form.company_name}
                onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))}
                placeholder="Razão Social ou Nome Fantasia"
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">CNPJ (opcional)</Label>
            <Input
              value={form.cnpj}
              onChange={(e) => setForm(f => ({ ...f, cnpj: e.target.value }))}
              placeholder="00.000.000/0000-00"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Seu Nome *</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={form.full_name}
                onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="Nome completo"
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">E-mail *</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="seu@email.com"
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Senha *</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                className="pl-10 pr-10"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full h-11 font-semibold gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {loading ? "Criando conta..." : "Criar Conta e Acessar"}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/auth" className="text-primary hover:underline font-medium">Entrar</Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
