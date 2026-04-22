import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle2, Wifi, MessageCircle, Rocket, ShoppingCart, TrendingUp, Brain, Package, ZoomIn, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import checkoutScene from "@/assets/pdv-checkout-scene.webp";

const highlights = [
  "PDV com leitor e balança",
  "NFC-e / NF-e automática",
  "Funciona offline",
];

const trustBadges = [
  { icon: Wifi, text: "Funciona mesmo sem internet" },
  { icon: MessageCircle, text: "Suporte rápido via WhatsApp" },
  { icon: Rocket, text: "Implantação simples" },
];

export function LandingHero() {
  const [zoomed, setZoomed] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  const handleDemo = async () => {
    trackEvent("demo_account_start", { location: "hero" });
    setDemoLoading(true);
    try {
      const demoId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const companyName = `Loja Demo ${demoId.toUpperCase()}`;
      const { data, error } = await supabase.functions.invoke("create-demo-account", {
        body: { company_name: companyName },
      });
      if (error || !data?.email) throw new Error(error?.message || "Erro ao criar conta demo");
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (signInError) throw signInError;
      localStorage.setItem("as_selected_company", data.company_id);
      trackEvent("demo_account_success", { location: "hero" });
      toast.success("Conta demo criada! Explore o sistema à vontade.");
      navigate("/dashboard");
    } catch (err: any) {
      trackEvent("demo_account_error", {
        location: "hero",
        reason: err?.message?.slice(0, 80) ?? "unknown",
      });
      toast.error(err?.message || "Erro ao criar demo");
    } finally {
      setDemoLoading(false);
    }
  };
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient mesh */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[100px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — Text */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-semibold uppercase tracking-wider mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              ERP + PDV + Fiscal em um só lugar
            </div>

            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-2">AnthoSystem — Seu ERP completo para varejo</p>

            <h1 className="font-display text-4xl sm:text-5xl xl:text-6xl font-extrabold tracking-tight leading-[1.1]">
              Gestão completa
              <br />
              para o seu{" "}
              <span className="gradient-text">comércio</span>
            </h1>

            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-lg">
              Reduza perdas, aumente o lucro e tenha controle total do seu negócio em um único sistema. Ideal para supermercados, padarias, pet shops, lojas e muito mais.
            </p>

            <div className="flex flex-wrap gap-4 mt-6">
              {highlights.map((h) => (
                <div key={h} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                  <span>{h}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-10">
              <Button asChild size="lg" className="text-base px-8 h-13 shadow-lg shadow-primary/20 font-semibold">
                <Link
                  to="/auth"
                  onClick={() => trackEvent("cta_click", { location: "hero", cta: "start_trial" })}
                >
                  Começar teste grátis por 15 dias
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-base px-8 h-13 font-medium border-primary/30 hover:bg-primary/5"
                onClick={handleDemo}
                disabled={demoLoading}
              >
                <Zap className="w-4 h-4 mr-2" />
                {demoLoading ? "Criando..." : "Testar sem cadastro"}
              </Button>
            </div>

            {/* Trust badges */}
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              {trustBadges.map((b) => (
                <div key={b.text} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <b.icon className="w-4 h-4 text-primary flex-shrink-0" />
                  <span>✔ {b.text}</span>
                </div>
              ))}
            </div>

            {/* Social proof */}
            <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span>Usado por comércios reais em produção</span>
            </div>
          </motion.div>

          {/* Right — Clean laptop mockup with PDV screenshot */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            {/* Checkout scene */}
            <button
              type="button"
              className="relative cursor-pointer group text-left w-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => setZoomed(true)}
              aria-label="Ampliar imagem do PDV em operação"
            >
              <div className="rounded-2xl overflow-hidden shadow-2xl shadow-primary/10 border border-border/50">
                <img
                  src={checkoutScene}
                  alt="Caixa de supermercado usando o PDV AnthoSystem — sistema real em operação"
                  className="w-full h-auto"
                  loading="eager"
                />
              </div>

              {/* Zoom hint */}
              <div className="absolute top-4 right-4 bg-background/70 backdrop-blur-sm rounded-full p-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity border border-border/50">
                <ZoomIn className="w-4 h-4 text-primary" aria-hidden="true" />
              </div>

              {/* Subtle glow */}
              <div className="absolute -inset-4 -z-10 bg-primary/5 rounded-3xl blur-2xl" />
            </button>

            {/* Floating cards */}
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="hidden lg:flex absolute -bottom-6 -left-4 bg-card border border-border rounded-xl p-3 shadow-lg items-center gap-3 z-20"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vendas hoje</p>
                <p className="text-sm font-bold text-foreground">R$ 12.450</p>
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
              className="hidden lg:flex absolute top-8 -right-4 bg-card border border-border rounded-xl p-3 shadow-lg items-center gap-3 z-20"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Lucro</p>
                <p className="text-sm font-bold text-foreground">+18% mês</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Fullscreen Zoom Modal */}
      <AnimatePresence>
        {zoomed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
            onClick={() => setZoomed(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="hero-zoom-title"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", damping: 25 }}
              className="relative max-w-6xl w-full cursor-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="hero-zoom-title" className="sr-only">
                Imagem ampliada do PDV AnthoSystem em operação
              </h2>
              <button
                type="button"
                onClick={() => setZoomed(false)}
                className="absolute -top-12 right-0 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 text-sm rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Fechar imagem ampliada"
                autoFocus
              >
                <X className="w-5 h-5" aria-hidden="true" /> Fechar
              </button>
              <div className="rounded-xl border-2 border-border overflow-hidden shadow-2xl">
                <img
                  src={checkoutScene}
                  alt="PDV AnthoSystem em uso no caixa do supermercado — visualização ampliada"
                  className="w-full h-auto"
                />
              </div>
              <p className="text-center text-sm text-muted-foreground mt-4">
                Sistema AnthoSystem em operação real — pressione Esc ou clique fora para fechar
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
