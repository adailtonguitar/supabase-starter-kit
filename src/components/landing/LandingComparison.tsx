import { motion } from "framer-motion";
import { Check, X, Minus } from "lucide-react";

type Status = "yes" | "no" | "partial";

interface Feature {
  name: string;
  antho: Status;
  bling: Status;
  tiny: Status;
  marketup: Status;
}

const features: Feature[] = [
  { name: "PDV Completo", antho: "yes", bling: "partial", tiny: "no", marketup: "partial" },
  { name: "Funciona Offline", antho: "yes", bling: "no", tiny: "no", marketup: "no" },
  { name: "Controle de Validade e Lotes", antho: "yes", bling: "partial", tiny: "partial", marketup: "no" },
  { name: "Balança Integrada", antho: "yes", bling: "no", tiny: "no", marketup: "no" },
  { name: "NFC-e / NF-e", antho: "yes", bling: "yes", tiny: "yes", marketup: "partial" },
  { name: "Inteligência Artificial", antho: "yes", bling: "no", tiny: "no", marketup: "no" },
  { name: "Gestão de Filiais", antho: "yes", bling: "partial", tiny: "no", marketup: "no" },
  { name: "Programa de Fidelidade", antho: "yes", bling: "no", tiny: "no", marketup: "no" },
  { name: "TEF Integrado (Cartão)", antho: "yes", bling: "partial", tiny: "partial", marketup: "no" },
  { name: "Sistema de Fiado", antho: "yes", bling: "no", tiny: "no", marketup: "no" },
  { name: "Etiquetas de Gôndola", antho: "yes", bling: "partial", tiny: "partial", marketup: "no" },
  { name: "A partir de", antho: "yes", bling: "yes", tiny: "yes", marketup: "yes" },
];

const StatusIcon = ({ status }: { status: Status }) => {
  if (status === "yes") return <Check className="w-5 h-5 text-emerald-500" />;
  if (status === "no") return <X className="w-5 h-5 text-destructive/60" />;
  return <Minus className="w-5 h-5 text-amber-500" />;
};

const prices: Record<string, string> = {
  antho: "R$ 149,90",
  bling: "R$ 199,90",
  tiny: "R$ 159,90",
  marketup: "R$ 299,90",
};

export function LandingComparison() {
  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">
              Comparativo
            </span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
              AnthoSystem vs. Concorrentes
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
              Veja por que somos a escolha certa para o varejo.
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-5xl mx-auto overflow-x-auto relative z-10"
          style={{ touchAction: "auto", WebkitOverflowScrolling: "touch" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-4 px-3 font-semibold text-muted-foreground">Recurso</th>
                <th className="text-center py-4 px-3">
                  <div className="font-bold text-primary text-base">AnthoSystem</div>
                </th>
                <th className="text-center py-4 px-3">
                  <div className="font-semibold text-foreground/70">Bling</div>
                </th>
                <th className="text-center py-4 px-3">
                  <div className="font-semibold text-foreground/70">Tiny</div>
                </th>
                <th className="text-center py-4 px-3">
                  <div className="font-semibold text-foreground/70">MarketUP</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((f, i) => (
                <tr
                  key={f.name}
                  className={`border-b border-border/50 ${i % 2 === 0 ? "bg-muted/20" : ""} ${f.name === "A partir de" ? "bg-primary/5 font-semibold" : ""}`}
                >
                  <td className="py-3.5 px-3 text-foreground/80">{f.name}</td>
                  <td className="py-3.5 px-3 text-center">
                    {f.name === "A partir de" ? (
                      <span className="font-bold text-primary">{prices.antho}</span>
                    ) : (
                      <div className="flex justify-center"><StatusIcon status={f.antho} /></div>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    {f.name === "A partir de" ? (
                      <span className="text-foreground/70">{prices.bling}</span>
                    ) : (
                      <div className="flex justify-center"><StatusIcon status={f.bling} /></div>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    {f.name === "A partir de" ? (
                      <span className="text-foreground/70">{prices.tiny}</span>
                    ) : (
                      <div className="flex justify-center"><StatusIcon status={f.tiny} /></div>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    {f.name === "A partir de" ? (
                      <span className="text-foreground/70">{prices.marketup}</span>
                    ) : (
                      <div className="flex justify-center"><StatusIcon status={f.marketup} /></div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center gap-6 mt-4 text-xs text-muted-foreground justify-center">
            <span className="flex items-center gap-1"><Check className="w-4 h-4 text-emerald-500" /> Incluso</span>
            <span className="flex items-center gap-1"><Minus className="w-4 h-4 text-amber-500" /> Parcial</span>
            <span className="flex items-center gap-1"><X className="w-4 h-4 text-destructive/60" /> Não disponível</span>
          </div>

          <p className="text-[11px] text-muted-foreground text-center mt-3">
            * Comparativo baseado em informações públicas de fevereiro/2026. Funcionalidades podem variar conforme o plano de cada fornecedor.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
