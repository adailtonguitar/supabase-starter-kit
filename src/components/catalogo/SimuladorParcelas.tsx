import { Badge } from "@/components/ui/badge";
import { CreditCard, Receipt } from "lucide-react";

interface Props {
  total: number;
  className?: string;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const installmentOptions = [
  { n: 3, rate: 0, label: "3x sem juros" },
  { n: 6, rate: 0, label: "6x sem juros" },
  { n: 10, rate: 0, label: "10x sem juros" },
  { n: 12, rate: 1.99, label: "12x c/ juros" },
];

function calcInstallment(total: number, n: number, monthlyRate: number) {
  if (monthlyRate === 0) return total / n;
  const r = monthlyRate / 100;
  return total * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export default function SimuladorParcelas({ total, className }: Props) {
  if (total <= 0) return null;

  // Carnê (boleto) options — always interest-free up to 6x, 1.5% for longer
  const carneOptions = [
    { n: 3, rate: 0 },
    { n: 6, rate: 0 },
    { n: 10, rate: 1.5 },
    { n: 12, rate: 1.5 },
  ];

  return (
    <div className={className}>
      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
        💳 Simulação de Parcelas
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Cartão */}
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <CreditCard className="w-3.5 h-3.5 text-primary" /> Cartão de Crédito
          </div>
          <div className="space-y-1">
            {installmentOptions.map(opt => {
              const value = calcInstallment(total, opt.n, opt.rate);
              return (
                <div key={opt.n} className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">{opt.label}</span>
                  <span className="font-semibold">{fmt(value)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between items-center text-xs pt-1 border-t border-border">
            <span className="text-muted-foreground">À vista (5% desc)</span>
            <span className="font-bold text-primary">{fmt(total * 0.95)}</span>
          </div>
        </div>

        {/* Carnê */}
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Receipt className="w-3.5 h-3.5 text-primary" /> Carnê / Boleto
          </div>
          <div className="space-y-1">
            {carneOptions.map(opt => {
              const value = calcInstallment(total, opt.n, opt.rate);
              return (
                <div key={`carne-${opt.n}`} className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">
                    {opt.n}x {opt.rate === 0 ? "sem juros" : `(${opt.rate}% a.m.)`}
                  </span>
                  <span className="font-semibold">{fmt(value)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between items-center text-xs pt-1 border-t border-border">
            <span className="text-muted-foreground">PIX (7% desc)</span>
            <span className="font-bold text-primary">{fmt(total * 0.93)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
