import { CheckCircle, Clock, Loader2, AlertTriangle, Zap, Skull, Timer, Percent, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { FiscalMetrics, FiscalQueueEntry } from "@/hooks/useFiscalDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface FiscalDashboardProps {
  metrics: FiscalMetrics;
  isLoading: boolean;
  isProcessing: boolean;
  onProcessQueue: () => void;
  deadLetterItems?: FiscalQueueEntry[];
  recentErrors?: FiscalQueueEntry[];
  onRetryItem?: (queueId: string, saleId: string) => void;
}

const cards = [
  { key: "emittedToday" as const, label: "Emitidas Hoje", icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
  { key: "pending" as const, label: "Pendentes", icon: Clock, color: "text-warning", bg: "bg-warning/10" },
  { key: "processing" as const, label: "Processando", icon: Loader2, color: "text-primary", bg: "bg-primary/10" },
  { key: "errors" as const, label: "Erros", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
  { key: "deadLetter" as const, label: "Dead Letter", icon: Skull, color: "text-destructive", bg: "bg-destructive/10" },
];

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

export function FiscalDashboard({
  metrics,
  isLoading,
  isProcessing,
  onProcessQueue,
  deadLetterItems = [],
  recentErrors = [],
  onRetryItem,
}: FiscalDashboardProps) {
  return (
    <div className="space-y-4">
      {metrics.criticalErrors && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            ⚠ Existem erros fiscais críticos que precisam de atenção{metrics.deadLetter > 0 ? ` (${metrics.deadLetter} em dead letter)` : ""}.
          </AlertDescription>
        </Alert>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
                <span className="text-xl font-bold font-mono text-foreground">
                  {metrics[card.key]}
                </span>
              )}
              <p className="text-[11px] text-muted-foreground leading-tight">{card.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Métricas operacionais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
          <Timer className="w-5 h-5 text-muted-foreground" />
          <div>
            <span className="text-lg font-bold font-mono text-foreground">
              {isLoading ? <Skeleton className="h-5 w-12 inline-block" /> : formatDuration(metrics.avgProcessingMs)}
            </span>
            <p className="text-[11px] text-muted-foreground">Tempo médio</p>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
          <Percent className="w-5 h-5 text-muted-foreground" />
          <div>
            <span className="text-lg font-bold font-mono text-foreground">
              {isLoading ? <Skeleton className="h-5 w-12 inline-block" /> : `${metrics.errorRate}%`}
            </span>
            <p className="text-[11px] text-muted-foreground">Taxa de erro</p>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <div>
            <span className="text-lg font-bold font-mono text-foreground">
              {isLoading ? <Skeleton className="h-5 w-12 inline-block" /> : metrics.queueSize}
            </span>
            <p className="text-[11px] text-muted-foreground">Tamanho da fila</p>
          </div>
        </div>
      </div>

      <Button
        onClick={onProcessQueue}
        disabled={isProcessing}
        className="flex items-center gap-2"
      >
        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
        Processar Fila Agora
      </Button>

      {/* Erros recentes + Dead Letter */}
      {recentErrors.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Últimas falhas</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {recentErrors.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-muted/50 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={item.status === "dead_letter" ? "destructive" : "secondary"} className="text-[10px]">
                      {item.status === "dead_letter" ? "DEAD LETTER" : "ERRO"}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{formatRelativeTime(item.created_at)}</span>
                    <span className="text-[11px] text-muted-foreground">({item.attempts} tentativas)</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate" title={item.last_error || ""}>
                    {item.last_error || "Sem detalhes"}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">venda: {item.sale_id?.slice(0, 8)}…</p>
                </div>
                {onRetryItem && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-7 text-xs"
                    onClick={() => onRetryItem(item.id, item.sale_id)}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Reemitir
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
