import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocalFinancialEntries } from "@/hooks/useLocalFinancial";
import { formatCurrency } from "@/lib/mock-data";
import {
  ArrowDownCircle, ArrowUpCircle, Wallet, CheckCircle2, Clock,
  TrendingUp, TrendingDown, CalendarDays,
} from "lucide-react";

interface DailyClosingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DailyClosingDialog({ open, onOpenChange }: DailyClosingDialogProps) {
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: entries = [], isLoading } = useLocalFinancialEntries({
    startDate: today,
    endDate: today,
  });

  if (!open) return null;

  const pagar = entries.filter((e) => e.type === "pagar");
  const receber = entries.filter((e) => e.type === "receber");
  const totalPagar = pagar.reduce((s, e) => s + Number(e.amount), 0);
  const totalReceber = receber.reduce((s, e) => s + Number(e.amount), 0);
  const pagos = entries.filter((e) => e.status === "pago");
  const pendentes = entries.filter((e) => e.status === "pendente");
  const totalPago = pagos.filter((e) => e.type === "pagar").reduce((s, e) => s + Number(e.paid_amount || e.amount), 0);
  const totalRecebido = pagos.filter((e) => e.type === "receber").reduce((s, e) => s + Number(e.paid_amount || e.amount), 0);
  const saldo = totalRecebido - totalPago;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={() => onOpenChange(false)}>
      <div
        className="bg-card rounded-xl p-5 sm:p-6 border border-border w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto space-y-5 mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Fechamento Diário</h2>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {format(new Date(), "dd/MM/yyyy", { locale: ptBR })}
          </span>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhum lançamento registrado hoje.
          </div>
        ) : (
          <>
            {/* KPI Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-destructive">
                  <TrendingDown className="w-4 h-4" />
                  <span className="text-[11px] font-medium">A Pagar</span>
                </div>
                <p className="text-base font-bold text-foreground">{formatCurrency(totalPagar)}</p>
                <p className="text-[10px] text-muted-foreground">Realizado: {formatCurrency(totalPago)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-primary">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-[11px] font-medium">A Receber</span>
                </div>
                <p className="text-base font-bold text-foreground">{formatCurrency(totalReceber)}</p>
                <p className="text-[10px] text-muted-foreground">Realizado: {formatCurrency(totalRecebido)}</p>
              </div>
            </div>

            {/* Saldo */}
            <div className={`flex items-center justify-between rounded-lg p-3 border ${saldo >= 0 ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
              <div className="flex items-center gap-2">
                <Wallet className={`w-4 h-4 ${saldo >= 0 ? "text-primary" : "text-destructive"}`} />
                <span className="text-sm font-medium text-foreground">Saldo do Dia</span>
              </div>
              <span className={`text-base font-bold ${saldo >= 0 ? "text-primary" : "text-destructive"}`}>
                {formatCurrency(saldo)}
              </span>
            </div>

            {/* Resumo */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resumo</h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Pagos / Recebidos
                  </span>
                  <span className="font-medium text-foreground">{pagos.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" /> Pendentes
                  </span>
                  <span className="font-medium text-foreground">{pendentes.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <ArrowUpCircle className="w-3.5 h-3.5 text-destructive" /> Contas a Pagar
                  </span>
                  <span className="font-medium text-foreground">{pagar.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <ArrowDownCircle className="w-3.5 h-3.5 text-primary" /> Contas a Receber
                  </span>
                  <span className="font-medium text-foreground">{receber.length}</span>
                </div>
              </div>
            </div>

            {/* Lista de lançamentos do dia */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lançamentos do Dia</h3>
              <div className="max-h-40 overflow-y-auto space-y-1.5">
                {entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-muted/50">
                    <div className="flex items-center gap-2 min-w-0">
                      {e.type === "pagar" ? (
                        <ArrowUpCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                      ) : (
                        <ArrowDownCircle className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                      <span className="truncate text-foreground">{e.description}</span>
                    </div>
                    <span className="font-mono font-medium text-foreground shrink-0 ml-2">
                      {formatCurrency(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <button
          onClick={() => onOpenChange(false)}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
