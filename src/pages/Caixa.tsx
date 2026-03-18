import { useState, useMemo } from "react";
import { DollarSign, Lock, Unlock, Calendar, Loader2, RefreshCw, Printer, CalendarDays, Banknote, CreditCard, QrCode, ArrowDownCircle, ArrowUpCircle, HandCoins, TrendingUp, ShoppingCart } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useCompany } from "@/hooks/useCompany";
import { CashRegister } from "@/components/pos/CashRegister";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CashSessionRecord, CashMovementRecord } from "@/integrations/supabase/fiscal.types";

export default function Caixa() {
  const { companyId, companyName } = useCompany();
  const qc = useQueryClient();
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const isToday = format(new Date(), "yyyy-MM-dd") === dateStr;

  const { data: sessions = [], isLoading: loading } = useQuery({
    queryKey: ["cash-sessions-history", companyId, dateStr],
    queryFn: async () => {
      if (!companyId) return [];
      if (!navigator.onLine) {
        // Offline: try to load cached open session from localStorage
        try {
          const raw = localStorage.getItem("as_offline_cash_session");
          if (raw) {
            const cached = JSON.parse(raw);
            if (cached?.company_id === companyId && cached?.status === "aberto") {
              return [cached];
            }
          }
        } catch {}
        return [];
      }
      const dayStart = startOfDay(selectedDate).toISOString();
      const dayEnd = endOfDay(selectedDate).toISOString();
      const { data, error } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("company_id", companyId)
        .gte("opened_at", dayStart)
        .lte("opened_at", dayEnd)
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    retry: navigator.onLine ? 1 : 0,
  });

  // Query fiado movements for all sessions of the day
  const sessionIds = useMemo(() => sessions.map((s: CashSessionRecord) => s.id), [sessions]);
  const { data: fiadoMovements = [] } = useQuery({
    queryKey: ["cash-fiado-movements", sessionIds],
    queryFn: async () => {
      if (sessionIds.length === 0) return [];
      const { data } = await supabase
        .from("cash_movements")
        .select("session_id, amount")
        .in("session_id", sessionIds)
        .eq("type", "suprimento")
        .ilike("description", "Recebimento fiado%");
      return data || [];
    },
    enabled: sessionIds.length > 0,
  });

  const fiadoBySession = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    fiadoMovements.forEach((m: CashMovementRecord) => {
      if (!m.session_id) return;
      if (!map[m.session_id]) map[m.session_id] = { total: 0, count: 0 };
      map[m.session_id].total += Number(m.amount);
      map[m.session_id].count += 1;
    });
    return map;
  }, [fiadoMovements]);

  // Consolidated summary
  const summary = useMemo(() => {
    const s = {
      totalVendas: 0, salesCount: 0, totalDinheiro: 0, totalDebito: 0,
      totalCredito: 0, totalPix: 0, totalSangria: 0, totalSuprimento: 0,
      totalFiado: 0, fiadoCount: 0, sessionsCount: sessions.length,
    };
    sessions.forEach((session: CashSessionRecord) => {
      s.totalVendas += Number(session.total_vendas || 0);
      s.salesCount += Number(session.sales_count || 0);
      s.totalDinheiro += Number(session.total_dinheiro || 0);
      s.totalDebito += Number(session.total_debito || 0);
      s.totalCredito += Number(session.total_credito || 0);
      s.totalPix += Number(session.total_pix || 0);
      s.totalSangria += Number(session.total_sangria || 0);
      s.totalSuprimento += Number(session.total_suprimento || 0);
      const f = fiadoBySession[session.id];
      if (f) { s.totalFiado += f.total; s.fiadoCount += f.count; }
    });
    return s;
  }, [sessions, fiadoBySession]);

  const handleCashRegisterClose = () => {
    setShowCashRegister(false);
    qc.invalidateQueries({ queryKey: ["cash-sessions-history"] });
  };

  const handlePrintReport = () => {
    const now = new Date();
    const supManual = Math.max(0, summary.totalSuprimento - summary.totalFiado);
    const html = `<html><head><title>Relatório de Caixa</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        @media print { html, body { margin: 0; padding: 4px; } }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 12px; padding: 8px; width: 80mm; color: #000; background: #fff; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; padding: 2px 0; }
        .section { margin-top: 8px; }
        h2 { font-size: 14px; margin-bottom: 4px; }
      </style></head><body>
        <div class="center bold"><h2>RELATÓRIO DE CAIXA</h2></div>
        <div class="center">${companyName || 'PDV'}</div>
        <div class="center bold">${format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}</div>
        <div class="center" style="font-size:10px;">Emitido: ${now.toLocaleString("pt-BR")}</div>
        <div class="line"></div>
        <div class="section bold">RESUMO DO DIA</div>
        <div class="row"><span>Sessões:</span><span>${summary.sessionsCount}</span></div>
        <div class="row"><span>Nº Vendas:</span><span>${summary.salesCount}</span></div>
        <div class="row bold"><span>Total Vendas:</span><span>${formatCurrency(summary.totalVendas)}</span></div>
        <div class="line"></div>
        <div class="section bold">FORMAS DE PAGAMENTO</div>
        <div class="row"><span>Dinheiro:</span><span>${formatCurrency(summary.totalDinheiro)}</span></div>
        <div class="row"><span>Débito:</span><span>${formatCurrency(summary.totalDebito)}</span></div>
        <div class="row"><span>Crédito:</span><span>${formatCurrency(summary.totalCredito)}</span></div>
        <div class="row"><span>PIX:</span><span>${formatCurrency(summary.totalPix)}</span></div>
        <div class="line"></div>
        <div class="row"><span>Sangrias:</span><span>-${formatCurrency(summary.totalSangria)}</span></div>
        <div class="row"><span>Suprimentos:</span><span>+${formatCurrency(supManual)}</span></div>
        ${summary.totalFiado > 0 ? `<div class="row bold"><span>Receb. Fiado (${summary.fiadoCount}):</span><span>+${formatCurrency(summary.totalFiado)}</span></div>` : ''}
        <div class="line"></div>
        <div class="section bold">SESSÕES</div>
         ${sessions.map((s: CashSessionRecord) => {
          const opened = new Date(s.opened_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          const closed = s.closed_at ? new Date(s.closed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "Aberto";
          return `<div class="row"><span>T${s.terminal_id} ${opened}-${closed}</span><span>${formatCurrency(Number(s.total_vendas || 0))}</span></div>`;
        }).join("")}
        <div class="line"></div>
        <div class="center" style="margin-top:8px;font-size:10px;">Documento não fiscal</div>
      </body></html>`;
    const w = window.open("", "_blank", "width=350,height=600");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sessões de Caixa</h1>
          <p className="text-sm text-muted-foreground mt-1">Histórico de abertura e fechamento</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-start text-left font-medium gap-2", !selectedDate && "text-muted-foreground")}>
                <CalendarDays className="w-4 h-4" />
                {format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <CalendarComponent
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                disabled={(date) => date > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

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

      {/* Consolidated Summary */}
      {!loading && sessions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border card-shadow overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">
                Resumo — {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
              </h2>
              <span className="text-xs text-muted-foreground">({summary.sessionsCount} {summary.sessionsCount === 1 ? "sessão" : "sessões"})</span>
            </div>
            <button onClick={handlePrintReport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-all">
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-primary/5 rounded-xl p-3 border border-primary/15">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Total Vendas</span>
                </div>
                <p className="text-lg font-black font-mono text-primary">{formatCurrency(summary.totalVendas)}</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 border border-border/60">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nº Vendas</span>
                </div>
                <p className="text-lg font-black font-mono text-foreground">{summary.salesCount}</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 border border-border/60">
                <div className="flex items-center gap-1.5 mb-1">
                  <Banknote className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Dinheiro</span>
                </div>
                <p className="text-lg font-black font-mono text-foreground">{formatCurrency(summary.totalDinheiro)}</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 border border-border/60">
                <div className="flex items-center gap-1.5 mb-1">
                  <QrCode className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">PIX</span>
                </div>
                <p className="text-lg font-black font-mono text-foreground">{formatCurrency(summary.totalPix)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-muted/50 rounded-xl p-3 border border-border/60">
                <div className="flex items-center gap-1.5 mb-1">
                  <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Débito</span>
                </div>
                <p className="text-base font-bold font-mono text-foreground">{formatCurrency(summary.totalDebito)}</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 border border-border/60">
                <div className="flex items-center gap-1.5 mb-1">
                  <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Crédito</span>
                </div>
                <p className="text-base font-bold font-mono text-foreground">{formatCurrency(summary.totalCredito)}</p>
              </div>
              <div className="bg-destructive/5 rounded-xl p-3 border border-destructive/15">
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowDownCircle className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">Sangrias</span>
                </div>
                <p className="text-base font-bold font-mono text-destructive">-{formatCurrency(summary.totalSangria)}</p>
              </div>
              <div className="bg-primary/5 rounded-xl p-3 border border-primary/15">
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowUpCircle className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Suprimentos</span>
                </div>
                <p className="text-base font-bold font-mono text-primary">+{formatCurrency(Math.max(0, summary.totalSuprimento - summary.totalFiado))}</p>
              </div>
            </div>

            {summary.totalFiado > 0 && (
              <div className="mt-3 flex items-center justify-between px-4 py-3 rounded-xl bg-success/5 border border-success/20">
                <div className="flex items-center gap-2">
                  <HandCoins className="w-4 h-4 text-success" />
                  <span className="text-sm font-medium text-foreground">Recebimentos Fiado</span>
                  <span className="text-xs text-muted-foreground">({summary.fiadoCount})</span>
                </div>
                <span className="font-mono font-bold text-success">+{formatCurrency(summary.totalFiado)}</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {loading && sessions.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Lock className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhuma sessão encontrada em {format(selectedDate, "dd/MM/yyyy")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {isToday ? 'Clique em "Gerenciar Caixa" para abrir uma nova sessão' : "Selecione outra data para consultar"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sessões do dia</h3>
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
            const fiado = fiadoBySession[session.id];

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
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isOpen ? "bg-success/10" : "bg-muted"}`}>
                        {isOpen ? <Unlock className="w-5 h-5 text-success" /> : <Lock className="w-5 h-5 text-muted-foreground" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">Terminal {session.terminal_id}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isOpen ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
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
                      <button onClick={() => setShowCashRegister(true)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all">
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
                    <div className="mt-3 pt-3 border-t border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>Sangria: {formatCurrency(totalSangria)}</span>
                          <span>Suprimento: {formatCurrency(Math.max(0, totalSuprimento - (fiado?.total || 0)))}</span>
                        </div>
                        <span className={`text-sm font-mono font-semibold ${Math.abs(difference) < 0.01 ? "text-success" : "text-destructive"}`}>
                          Dif: {difference >= 0 ? "+" : ""}{formatCurrency(difference)}
                        </span>
                      </div>
                      {fiado && fiado.total > 0 && (
                        <div className="flex items-center gap-2 text-xs">
                          <HandCoins className="w-3.5 h-3.5 text-success" />
                          <span className="text-success font-medium">Receb. Fiado ({fiado.count}): {formatCurrency(fiado.total)}</span>
                        </div>
                      )}
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
