import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Play, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroDashboard from "@/assets/hero-dashboard.jpg";

const highlights = [
  "PDV com leitor e balança",
  "NFC-e / NF-e automática",
  "Funciona offline",
];

export function LandingHero() {
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
              Sistema #1 para supermercados
            </div>

            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-black tracking-tight leading-[1.1]">
              Gestão completa
              <br />
              para o seu{" "}
              <span className="relative">
                <span className="text-primary">supermercado</span>
                <svg className="absolute -bottom-1 left-0 w-full" viewBox="0 0 200 8" fill="none">
                  <path d="M2 6C50 2 150 2 198 6" stroke="hsl(168 72% 36%)" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </span>
            </h1>

            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-lg">
              PDV rápido, emissão fiscal, estoque com lotes e validade, financeiro completo.
              Tudo integrado e{" "}
              <strong className="text-foreground font-semibold">funcionando mesmo sem internet.</strong>
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
                  Começar grátis por 8 dias
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

            {/* Social proof */}
            <div className="mt-10 flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground"
                  >
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <div>
                <span className="font-semibold text-foreground">+500</span> supermercados ativos
              </div>
            </div>
          </motion.div>

          {/* Right — Hero Image */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-primary/10 border border-border/50">
              <img
                src={heroDashboard}
                alt="Dashboard AnthoSystem — PDV e gestão para supermercados"
                className="w-full h-auto"
                loading="eager"
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent pointer-events-none" />
            </div>
            {/* Floating stat card */}
            <div className="absolute -bottom-4 -left-4 bg-card border border-border rounded-xl p-3 shadow-lg flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-bold text-sm">📈</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vendas hoje</p>
                <p className="text-sm font-bold text-foreground">R$ 12.450,00</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
