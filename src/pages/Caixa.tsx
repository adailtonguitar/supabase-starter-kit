import { useState } from "react";
import { DollarSign, Lock, Unlock, Calendar, Loader2, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useCompany } from "@/hooks/useCompany";
import { CashRegister } from "@/components/pos/CashRegister";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function Caixa() {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const [showCashRegister, setShowCashRegister] = useState(false);

  const { data: sessions = [], isLoading: loading } = useQuery({
    queryKey: ["cash-sessions-history", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      if (!navigator.onLine) return [];
      const { data, error } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("company_id", companyId)
        .order("opened_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    retry: navigator.onLine ? 1 : 0,
  });

  const handleCashRegisterClose = () => {
    setShowCashRegister(false);
    qc.invalidateQueries({ queryKey: ["cash-sessions-history"] });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sessões de Caixa</h1>
          <p className="text-sm text-muted-foreground mt-1">Histórico de abertura e fechamento</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["cash-sessions-history"] })}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button
            onClick={() => setShowCashRegister(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"
          >
            <DollarSign className="w-4 h-4" />
            Gerenciar Caixa
          </button>
        </div>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Lock className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhuma sessão de caixa encontrada</p>
          <p className="text-xs text-muted-foreground mt-1">Clique em "Gerenciar Caixa" para abrir uma nova sessão</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session: any, i: number) => {
            const totalVendas = Number(session.total_vendas || 0);
            const totalDinheiro = Number(session.total_dinheiro || 0);
            const totalDebito = Number(session.total_debito || 0);
            const totalCredito = Number(session.total_credito || 0);
            const totalPix = Number(session.total_pix || 0);
            const totalSangria = Number(session.total_sangria || 0);
            const totalSuprimento = Number(session.total_suprimento || 0);
            const salesCount = Number(session.sales_count || 0);
            const difference = Number(session.difference || 0);
            const isOpen = session.status === "aberto";

            return (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="bg-card rounded-xl card-shadow border border-border overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isOpen ? "bg-success/10" : "bg-muted"
                      }`}>
                        {isOpen ? (
                          <Unlock className="w-5 h-5 text-success" />
                        ) : (
                          <Lock className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">Terminal {session.terminal_id}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            isOpen
                              ? "bg-success/10 text-success"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {isOpen ? "Aberto" : "Fechado"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Calendar className="w-3 h-3" />
                          {new Date(session.opened_at).toLocaleString("pt-BR")}
                          {session.closed_at && ` — ${new Date(session.closed_at).toLocaleTimeString("pt-BR")}`}
                        </div>
                      </div>
                    </div>
                    {isOpen && (
                      <button
                        onClick={() => setShowCashRegister(true)}
                        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all"
                      >
                        Gerenciar
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Vendas</p>
                      <p className="text-base font-bold font-mono text-primary">{formatCurrency(totalVendas)}</p>
                      <p className="text-[10px] text-muted-foreground">{salesCount} vendas</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Dinheiro</p>
                      <p className="text-base font-bold font-mono text-foreground">{formatCurrency(totalDinheiro)}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Cartões</p>
                      <p className="text-base font-bold font-mono text-foreground">{formatCurrency(totalDebito + totalCredito)}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">PIX</p>
                      <p className="text-base font-bold font-mono text-foreground">{formatCurrency(totalPix)}</p>
                    </div>
                  </div>

                  {!isOpen && (
                    <div className="mt-3 flex items-center justify-between pt-3 border-t border-border">
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Sangria: {formatCurrency(totalSangria)}</span>
                        <span>Suprimento: {formatCurrency(totalSuprimento)}</span>
                      </div>
                      <span className={`text-sm font-mono font-semibold ${
                        Math.abs(difference) < 0.01 ? "text-success" : "text-destructive"
                      }`}>
                        Dif: {difference >= 0 ? "+" : ""}{formatCurrency(difference)}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showCashRegister && (
          <CashRegister onClose={handleCashRegisterClose} />
        )}
      </AnimatePresence>
    </div>
  );
}
