import { useState } from "react";
import { motion } from "framer-motion";
import { Calculator, TrendingDown, DollarSign, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function LandingCalculator() {
  const [faturamento, setFaturamento] = useState(80000);
  const [perdas, setPerdas] = useState(5);

  const perdaMensal = (faturamento * perdas) / 100;
  const perdaAnual = perdaMensal * 12;
  const economiaComSistema = perdaAnual * 0.7;

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <section className="py-24 bg-card/40">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            {/* Impact question before calculator */}
            <p className="text-xl sm:text-2xl font-bold text-foreground mb-6">
              Você sabe exatamente quanto está perdendo por mês?
            </p>

            <Calculator className="w-8 h-8 text-primary mx-auto mb-3" />
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">
              Calculadora de Economia
            </span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
              Quanto você perde sem controle?
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
              Comércios sem sistema perdem de 3% a 8% do faturamento com vencimentos, furtos e erros. Descubra quanto você pode economizar.
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
        >
          <div className="grid md:grid-cols-2 gap-8">
            {/* Inputs */}
            <div className="rounded-2xl border border-border bg-card p-7 space-y-6">
              <div>
                <label className="text-sm font-semibold text-foreground mb-2 block">
                  Faturamento mensal estimado
                </label>
                <div className="text-2xl font-black text-primary mb-2">
                  {formatCurrency(faturamento)}
                </div>
                <input
                  type="range"
                  min={10000}
                  max={500000}
                  step={5000}
                  value={faturamento}
                  onChange={(e) => setFaturamento(Number(e.target.value))}
                  className="w-full accent-primary h-2 rounded-full cursor-pointer"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>R$ 10 mil</span>
                  <span>R$ 500 mil</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-foreground mb-2 block">
                  Percentual estimado de perdas
                </label>
                <div className="text-2xl font-black text-primary mb-2">
                  {perdas}%
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={perdas}
                  onChange={(e) => setPerdas(Number(e.target.value))}
                  className="w-full accent-primary h-2 rounded-full cursor-pointer"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>1% (baixo)</span>
                  <span>10% (crítico)</span>
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 flex items-start gap-4">
                <AlertTriangle className="w-8 h-8 text-destructive flex-shrink-0 mt-1" />
                <div>
                  <p className="text-sm text-muted-foreground">Você perde por mês</p>
                  <p className="text-2xl font-black text-destructive">{formatCurrency(perdaMensal)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatCurrency(perdaAnual)} por ano indo pelo ralo
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 flex items-start gap-4">
                <DollarSign className="w-8 h-8 text-primary flex-shrink-0 mt-1" />
                <div>
                  <p className="text-sm text-muted-foreground">Com o AnthoSystem você economiza</p>
                  <p className="text-2xl font-black text-primary">{formatCurrency(economiaComSistema)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    por ano com controle de validade, estoque e alertas automáticos
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 flex items-start gap-4">
                <TrendingDown className="w-8 h-8 text-emerald-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="text-sm text-muted-foreground">ROI do sistema</p>
                  <p className="text-2xl font-black text-emerald-600">
                    {Math.round(economiaComSistema / (149.9 * 12))}x
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    O sistema se paga {Math.round(economiaComSistema / (149.9 * 12))} vezes por ano
                  </p>
                </div>
              </div>

              {/* Impact text after results */}
              <p className="text-center text-sm font-semibold text-destructive/80 italic pt-2">
                Cada mês sem controle é dinheiro indo embora.
              </p>

              <Button asChild size="lg" className="w-full h-12 font-semibold text-base shadow-lg shadow-primary/20 mt-2">
                <Link to="/auth">
                  Começar a economizar agora
                </Link>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
