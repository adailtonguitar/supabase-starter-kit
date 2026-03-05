import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Play, CheckCircle2, Wifi, MessageCircle, Rocket, ShoppingCart, TrendingUp, Brain, Package, ZoomIn, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import pdvScreen from "@/assets/pdv-screen.png";
import supermarketScene from "@/assets/supermarket-scene.png";

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
              Sistema #1 para comércios e varejo
            </div>

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
                <Link to="/auth">
                  Começar teste grátis por 15 dias
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-base px-8 h-13 font-medium">
                <a href="#recursos">
                  <Play className="w-4 h-4 mr-2 fill-current" />
                  Ver recursos
                </a>
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
            {/* Laptop mockup */}
            <div
              className="relative cursor-pointer group"
              onClick={() => setZoomed(true)}
            >
              {/* Laptop screen */}
              <div className="bg-[hsl(220,20%,8%)] rounded-t-xl border-2 border-b-0 border-[hsl(220,15%,20%)] shadow-2xl shadow-primary/10 overflow-hidden">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-4 py-2 bg-[hsl(220,15%,11%)] border-b border-[hsl(220,15%,16%)]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[hsl(0,60%,50%)]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[hsl(45,80%,50%)]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[hsl(120,50%,45%)]" />
                  </div>
                  <div className="flex-1 mx-4 bg-[hsl(220,15%,15%)] rounded-md h-5 flex items-center px-3">
                    <span className="text-[9px] text-muted-foreground/60 truncate">anthosystem.com.br/pdv</span>
                  </div>
                </div>
                {/* PDV Screenshot */}
                <img
                  src={pdvScreen}
                  alt="PDV AnthoSystem — Tela do ponto de venda com produtos, pagamentos e atalhos"
                  className="w-full h-auto"
                  loading="eager"
                />
              </div>
              {/* Laptop base/hinge */}
              <div className="relative">
                <div className="h-3 bg-gradient-to-b from-[hsl(220,15%,18%)] to-[hsl(220,15%,14%)] rounded-b-lg border-2 border-t-0 border-[hsl(220,15%,20%)]" />
                <div className="mx-auto -mt-px w-[110%] -ml-[5%] h-2 bg-gradient-to-b from-[hsl(220,10%,16%)] to-[hsl(220,10%,12%)] rounded-b-xl" />
              </div>

              {/* Zoom hint */}
              <div className="absolute top-6 right-6 bg-background/70 backdrop-blur-sm rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity border border-border/50">
                <ZoomIn className="w-4 h-4 text-primary" />
              </div>

              {/* Subtle glow behind laptop */}
              <div className="absolute -inset-4 -z-10 bg-primary/5 rounded-3xl blur-2xl" />
            </div>

            {/* Floating cards */}
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="absolute -bottom-6 -left-4 bg-card border border-border rounded-xl p-3 shadow-lg flex items-center gap-3 z-20"
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
              className="absolute top-8 -right-4 bg-card border border-border rounded-xl p-3 shadow-lg flex items-center gap-3 z-20"
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
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", damping: 25 }}
              className="relative max-w-6xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setZoomed(false)}
                className="absolute -top-12 right-0 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 text-sm"
              >
                <X className="w-5 h-5" /> Fechar
              </button>
              <div className="rounded-xl border-2 border-border overflow-hidden shadow-2xl">
                <img
                  src={pdvScreen}
                  alt="PDV AnthoSystem — Visualização ampliada"
                  className="w-full h-auto"
                />
              </div>
              <p className="text-center text-sm text-muted-foreground mt-4">
                Tela real do PDV AnthoSystem — clique fora para fechar
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
