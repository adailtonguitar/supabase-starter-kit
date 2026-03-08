/**
 * SyncStatusPanel — Shows offline sync queue status.
 * Displays pending, syncing, synced, and failed items with manual retry.
 */
import { useState } from "react";
import { useSync } from "@/hooks/useSync";
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const entityLabels: Record<string, string> = {
  sale: "Venda",
  stock_movement: "Movimentação",
  cash_movement: "Caixa",
  fiscal_contingency: "NFC-e Contingência",
  fiscal_document: "Documento Fiscal",
};

export function SyncStatusPanel() {
  const { stats, isOnline, syncing, syncAll, failedErrors } = useSync();
  const [expanded, setExpanded] = useState(false);

  const hasPending = stats.pending > 0 || stats.failed > 0 || stats.syncing > 0;

  // Don't show if online and nothing pending
  if (isOnline && !hasPending) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-xs">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header — always visible */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {!isOnline ? (
              <CloudOff className="w-4 h-4 text-destructive" />
            ) : syncing ? (
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            ) : stats.failed > 0 ? (
              <AlertCircle className="w-4 h-4 text-destructive" />
            ) : hasPending ? (
              <Cloud className="w-4 h-4 text-warning" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-success" />
            )}
            <span className="text-sm font-medium text-foreground">
              {!isOnline
                ? "Modo Offline"
                : syncing
                ? "Sincronizando..."
                : stats.failed > 0
                ? `${stats.failed} falha${stats.failed > 1 ? "s" : ""}`
                : hasPending
                ? `${stats.pending} pendente${stats.pending > 1 ? "s" : ""}`
                : "Tudo sincronizado"}
            </span>
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>

        {/* Expanded details */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-border"
            >
              <div className="px-4 py-3 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                    <span className="text-muted-foreground">Pendentes</span>
                    <span className="font-mono font-bold text-warning">{stats.pending}</span>
                  </div>
                  <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                    <span className="text-muted-foreground">Sincronizando</span>
                    <span className="font-mono font-bold text-primary">{stats.syncing}</span>
                  </div>
                  <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                    <span className="text-muted-foreground">Concluídos</span>
                    <span className="font-mono font-bold text-success">{stats.synced}</span>
                  </div>
                  <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                    <span className="text-muted-foreground">Falhas</span>
                    <span className="font-mono font-bold text-destructive">{stats.failed}</span>
                  </div>
                </div>

                {/* Error details */}
                {failedErrors.length > 0 && (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {failedErrors.map((fe, i) => (
                      <div key={i} className="bg-destructive/10 rounded-lg px-3 py-2 text-[10px]">
                        <span className="font-semibold text-destructive">{entityLabels[fe.type] || fe.type}:</span>{" "}
                        <span className="text-muted-foreground">{fe.error.slice(0, 120)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(stats.pending > 0 || stats.failed > 0) && isOnline && (
                  <button
                    onClick={syncAll}
                    disabled={syncing}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                    {syncing ? "Sincronizando..." : stats.failed > 0 ? "Tentar novamente" : "Sincronizar agora"}
                  </button>
                )}

                {!isOnline && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    As operações serão sincronizadas automaticamente quando a conexão for restabelecida.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
