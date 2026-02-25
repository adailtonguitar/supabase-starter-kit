import { CheckCircle, Clock, Loader2, AlertTriangle, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { FiscalMetrics } from "@/hooks/useFiscalDashboard";
import { Skeleton } from "@/components/ui/skeleton";

interface FiscalDashboardProps {
  metrics: FiscalMetrics;
  isLoading: boolean;
  isProcessing: boolean;
  onProcessQueue: () => void;
}

const cards = [
  { key: "emittedToday" as const, label: "Emitidas Hoje", icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
  { key: "pending" as const, label: "Pendentes", icon: Clock, color: "text-warning", bg: "bg-warning/10" },
  { key: "processing" as const, label: "Processando", icon: Loader2, color: "text-primary", bg: "bg-primary/10" },
  { key: "errors" as const, label: "Erros", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
];

export function FiscalDashboard({ metrics, isLoading, isProcessing, onProcessQueue }: FiscalDashboardProps) {
  return (
    <div className="space-y-3">
      {metrics.criticalErrors && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            ⚠ Existem erros fiscais pendentes que precisam de atenção.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card rounded-xl border border-border p-4 flex items-center gap-3"
          >
            <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
              <card.icon className={`w-5 h-5 ${card.color} ${card.key === "processing" && metrics.processing > 0 ? "animate-spin" : ""}`} />
            </div>
            <div>
              {isLoading ? (
                <Skeleton className="h-6 w-8" />
              ) : (
                <span className="text-xl font-bold font-mono text-foreground">{metrics[card.key]}</span>
              )}
              <p className="text-[11px] text-muted-foreground leading-tight">{card.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <button
        onClick={onProcessQueue}
        disabled={isProcessing}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
      >
        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
        Processar Fila Agora
      </button>
    </div>
  );
}
