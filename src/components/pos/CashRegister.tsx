import { useState, useEffect, useCallback } from "react";
import { DollarSign, Lock, Unlock, ArrowDownCircle, ArrowUpCircle, Banknote, CreditCard, QrCode, X, Loader2, Clock, ShoppingCart, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { CashSessionService } from "@/services";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { openCashDrawer } from "@/lib/escpos";
import { motion, AnimatePresence } from "framer-motion";

const OFFLINE_SESSION_KEY = "as_offline_cash_session";

async function canReachServer(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1000);
    await fetch(`${import.meta.env.VITE_SUPABASE_URL || ""}/rest/v1/`, { method: "HEAD", signal: ctrl.signal, cache: "no-store", mode: "no-cors" });
    clearTimeout(t);
    return true;
  } catch { return false; }
}

function makeOfflineSession(companyId: string, userId: string, openingBalance: number, terminalId: string) {
  return {
    id: `offline_${Date.now()}`, company_id: companyId, opened_by: userId,
    opening_balance: openingBalance, terminal_id: terminalId, status: "aberto" as const,
    opened_at: new Date().toISOString(), closed_at: null, closed_by: null, closing_balance: null,
    counted_dinheiro: null, counted_debito: null, counted_credito: null, counted_pix: null,
    difference: null, notes: null, sales_count: 0, total_vendas: 0, total_dinheiro: 0,
    total_debito: 0, total_credito: 0, total_pix: 0, total_voucher: 0, total_outros: 0,
    total_sangria: 0, total_suprimento: 0, created_at: new Date().toISOString(),
  };
}

function getCachedSession(companyId: string): any | null {
  try { const raw = localStorage.getItem(OFFLINE_SESSION_KEY); if (!raw) return null; const s = JSON.parse(raw); return s?.company_id === companyId && s?.status === "aberto" ? s : null; } catch { return null; }
}

type CashView = "status" | "open" | "close" | "movement";

export interface CashRegisterProps {
  onClose: () => void;
  terminalId?: string;
  preventClose?: boolean;
  initialSession?: any | null;
  skipInitialLoad?: boolean;
}

export function CashRegister({ onClose, terminalId = "01", preventClose = false, initialSession, skipInitialLoad = false }: CashRegisterProps) {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const [view, setView] = useState<CashView>("status");
  const [session, setSession] = useState<any | null>(initialSession ?? null);
  const [loading, setLoading] = useState(!skipInitialLoad);
  const [submitting, setSubmitting] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("200");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDesc, setMovementDesc] = useState("");
  const [movementType, setMovementType] = useState<"sangria" | "suprimento">("sangria");
  const [countedDinheiro, setCountedDinheiro] = useState("");
  const [countedDebito, setCountedDebito] = useState("");
  const [countedCredito, setCountedCredito] = useState("");
  const [countedPix, setCountedPix] = useState("");
  const [closingNotes, setClosingNotes] = useState("");

  const loadSession = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    const online = await canReachServer();
    if (!online) { const cached = getCachedSession(companyId); if (cached) setSession(cached); setLoading(false); return; }
    try { const data = await CashSessionService.getCurrentSession(companyId, terminalId); setSession(data); }
    catch { const cached = getCachedSession(companyId); if (cached) setSession(cached); }
    finally { setLoading(false); }
  }, [companyId, terminalId]);

  useEffect(() => { if (!skipInitialLoad) loadSession(); }, [loadSession, skipInitialLoad]);

  const isOpen = session?.status === "aberto";
  const totalDinheiro = Number(session?.total_dinheiro || 0);
  const totalDebito = Number(session?.total_debito || 0);
  const totalCredito = Number(session?.total_credito || 0);
  const totalPix = Number(session?.total_pix || 0);
  const totalSangria = Number(session?.total_sangria || 0);
  const totalSuprimento = Number(session?.total_suprimento || 0);
  const totalVendas = Number(session?.total_vendas || 0);
  const salesCount = Number(session?.sales_count || 0);
  const openBalance = Number(session?.opening_balance || 0);
  const expectedCash = openBalance + totalDinheiro + totalSuprimento - totalSangria;
  const totalCounted = (Number(countedDinheiro) || 0) + (Number(countedDebito) || 0) + (Number(countedCredito) || 0) + (Number(countedPix) || 0);
  const totalExpected = openBalance + totalDinheiro + totalDebito + totalCredito + totalPix + totalSuprimento - totalSangria;
  const difference = totalCounted - totalExpected;

  const handleOpen = async () => {
    if (!companyId || !user) return;
    setSubmitting(true);
    const online = await canReachServer();
    if (!online) {
      const offlineSession = makeOfflineSession(companyId, user.id, Number(openingBalance) || 0, terminalId);
      try { localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(offlineSession)); } catch {}
      setSession(offlineSession as any); setView("status"); setSubmitting(false);
      toast.success("Caixa aberto offline (sem conexão)"); return;
    }
    try {
      const data = await CashSessionService.open({ companyId, userId: user.id, openingBalance: Number(openingBalance) || 0, terminalId });
      setSession(data); setView("status"); toast.success("Caixa aberto com sucesso");
    } catch {
      const offlineSession = makeOfflineSession(companyId, user.id, Number(openingBalance) || 0, terminalId);
      try { localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(offlineSession)); } catch {}
      setSession(offlineSession as any); setView("status"); toast.success("Caixa aberto offline (sem conexão)");
    } finally { setSubmitting(false); }
  };

  const handleClose = async () => {
    if (!companyId || !user || !session) return;
    setSubmitting(true);
    try {
      await CashSessionService.close({ sessionId: session.id, companyId, userId: user.id, countedDinheiro: Number(countedDinheiro) || 0, countedDebito: Number(countedDebito) || 0, countedCredito: Number(countedCredito) || 0, countedPix: Number(countedPix) || 0, notes: closingNotes || undefined });
      setSession(null); setView("status"); toast.success("Caixa fechado com sucesso");
    } catch (err: any) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleMovement = async () => {
    if (!companyId || !user || !session) return;
    const amount = Number(movementAmount);
    if (amount <= 0) return;
    setSubmitting(true);
    try {
      await CashSessionService.registerMovement({ companyId, userId: user.id, sessionId: session.id, type: movementType, amount, description: movementDesc || undefined });
      setMovementAmount(""); setMovementDesc(""); openCashDrawer();
      toast.success(`${movementType === "sangria" ? "Sangria" : "Suprimento"} registrado — gaveta aberta`);
      await loadSession(); setView("status");
    } catch (err: any) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl border border-border shadow-2xl p-12 flex flex-col items-center gap-3"
      >
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Carregando caixa...</span>
      </motion.div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={preventClose ? undefined : onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", duration: 0.4 }}
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Controle de Caixa</h3>
              <p className="text-xs text-muted-foreground">Terminal {session?.terminal_id || terminalId}</p>
            </div>
          </div>
          {!preventClose && (
            <button onClick={onClose} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* STATUS VIEW */}
          {view === "status" && (
            <motion.div
              key="status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-5 space-y-5"
            >
              {/* Status badge */}
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                isOpen
                  ? "bg-primary/5 border-primary/20"
                  : "bg-muted/50 border-border"
              }`}>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  isOpen ? "bg-primary/10" : "bg-muted"
                }`}>
                  {isOpen ? <Unlock className="w-4.5 h-4.5 text-primary" /> : <Lock className="w-4.5 h-4.5 text-muted-foreground" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground">
                    {isOpen ? "Caixa Aberto" : "Caixa Fechado"}
                  </p>
                  {isOpen && session?.opened_at && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Clock className="w-3 h-3" />
                      Desde {new Date(session.opened_at).toLocaleString("pt-BR")}
                    </div>
                  )}
                </div>
                {isOpen && (
                  <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                )}
              </div>

              {isOpen && (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Fundo Inicial</p>
                      </div>
                      <p className="text-xl font-black font-mono text-foreground">{formatCurrency(openBalance)}</p>
                    </div>
                    <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                      <div className="flex items-center gap-1.5 mb-2">
                        <ShoppingCart className="w-3.5 h-3.5 text-primary" />
                        <p className="text-[11px] font-medium text-primary uppercase tracking-wide">Total Vendas</p>
                      </div>
                      <p className="text-xl font-black font-mono text-primary">{formatCurrency(totalVendas)}</p>
                    </div>
                    <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Nº Vendas</p>
                      <p className="text-xl font-black font-mono text-foreground">{salesCount}</p>
                    </div>
                    <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Dinheiro Esperado</p>
                      <p className="text-xl font-black font-mono text-foreground">{formatCurrency(expectedCash)}</p>
                    </div>
                  </div>

                  {/* Payment methods */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Formas de Pagamento</p>
                    {[
                      { label: "Dinheiro", value: totalDinheiro, icon: Banknote },
                      { label: "Débito", value: totalDebito, icon: CreditCard },
                      { label: "Crédito", value: totalCredito, icon: CreditCard },
                      { label: "PIX", value: totalPix, icon: QrCode },
                    ].map((pm) => (
                      <div key={pm.label} className="flex items-center justify-between py-2.5 px-3.5 rounded-lg hover:bg-muted/40 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <pm.icon className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-foreground">{pm.label}</span>
                        </div>
                        <span className="font-mono font-bold text-sm text-foreground">{formatCurrency(pm.value)}</span>
                      </div>
                    ))}

                    <div className="border-t border-border my-1" />

                    <div className="flex items-center justify-between py-2.5 px-3.5 rounded-lg bg-destructive/5">
                      <div className="flex items-center gap-2.5">
                        <ArrowDownCircle className="w-4 h-4 text-destructive" />
                        <span className="text-sm text-foreground">Sangrias</span>
                      </div>
                      <span className="font-mono font-bold text-sm text-destructive">-{formatCurrency(totalSangria)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2.5 px-3.5 rounded-lg bg-primary/5">
                      <div className="flex items-center gap-2.5">
                        <ArrowUpCircle className="w-4 h-4 text-primary" />
                        <span className="text-sm text-foreground">Suprimentos</span>
                      </div>
                      <span className="font-mono font-bold text-sm text-primary">+{formatCurrency(totalSuprimento)}</span>
                    </div>
                  </div>

                  {/* Continue to PDV button */}
                  {preventClose && (
                    <button
                      onClick={onClose}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                    >
                      <Unlock className="w-4 h-4" />
                      Continuar para o PDV
                    </button>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2.5 pt-1">
                    <button
                      onClick={() => { setMovementType("sangria"); setView("movement"); }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary text-secondary-foreground text-xs font-semibold hover:opacity-90 transition-all border border-border/50"
                    >
                      <ArrowDownCircle className="w-4 h-4" />
                      Sangria
                    </button>
                    <button
                      onClick={() => { setMovementType("suprimento"); setView("movement"); }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary text-secondary-foreground text-xs font-semibold hover:opacity-90 transition-all border border-border/50"
                    >
                      <ArrowUpCircle className="w-4 h-4" />
                      Suprimento
                    </button>
                    <button
                      onClick={() => setView("close")}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold hover:opacity-90 transition-all shadow-sm"
                    >
                      <Lock className="w-4 h-4" />
                      Fechar
                    </button>
                  </div>
                </>
              )}

              {!isOpen && (
                <button
                  onClick={() => setView("open")}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                >
                  <Unlock className="w-4 h-4" />
                  Abrir Caixa
                </button>
              )}
            </motion.div>
          )}

          {/* OPEN VIEW */}
          {view === "open" && (
            <motion.div
              key="open"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-5 space-y-5"
            >
              <h4 className="text-base font-bold text-foreground">Abertura de Caixa</h4>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Fundo de Troco (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  autoFocus
                  className="w-full px-4 py-3.5 rounded-xl bg-background border-2 border-border text-foreground text-2xl font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setView("status")} className="flex-1 py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold border border-border/50 hover:opacity-90 transition-all">
                  Cancelar
                </button>
                <button onClick={handleOpen} disabled={submitting} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Abrir Caixa
                </button>
              </div>
            </motion.div>
          )}

          {/* MOVEMENT VIEW */}
          {view === "movement" && (
            <motion.div
              key="movement"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-5 space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  movementType === "sangria" ? "bg-destructive/10" : "bg-primary/10"
                }`}>
                  {movementType === "sangria"
                    ? <ArrowDownCircle className="w-4.5 h-4.5 text-destructive" />
                    : <ArrowUpCircle className="w-4.5 h-4.5 text-primary" />
                  }
                </div>
                <h4 className="text-base font-bold text-foreground">
                  {movementType === "sangria" ? "Sangria" : "Suprimento"}
                </h4>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  autoFocus
                  className="w-full px-4 py-3.5 rounded-xl bg-background border-2 border-border text-foreground text-2xl font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Motivo</label>
                <input
                  type="text"
                  value={movementDesc}
                  onChange={(e) => setMovementDesc(e.target.value)}
                  placeholder="Ex: Troco para cliente..."
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setView("status")} className="flex-1 py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold border border-border/50 hover:opacity-90 transition-all">
                  Cancelar
                </button>
                <button onClick={handleMovement} disabled={!movementAmount || Number(movementAmount) <= 0 || submitting} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar
                </button>
              </div>
            </motion.div>
          )}

          {/* CLOSE VIEW */}
          {view === "close" && (
            <motion.div
              key="close"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-5 space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Lock className="w-4.5 h-4.5 text-destructive" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-foreground">Fechamento de Caixa</h4>
                  <p className="text-xs text-muted-foreground">Informe os valores conferidos</p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { label: "Dinheiro", expected: expectedCash, value: countedDinheiro, setter: setCountedDinheiro, icon: Banknote },
                  { label: "Débito", expected: totalDebito, value: countedDebito, setter: setCountedDebito, icon: CreditCard },
                  { label: "Crédito", expected: totalCredito, value: countedCredito, setter: setCountedCredito, icon: CreditCard },
                  { label: "PIX", expected: totalPix, value: countedPix, setter: setCountedPix, icon: QrCode },
                ].map((item) => (
                  <div key={item.label} className="bg-muted/30 rounded-xl p-3.5 border border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <item.icon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">{item.label}</span>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        Esperado: {formatCurrency(item.expected)}
                      </span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={item.value}
                      onChange={(e) => item.setter(e.target.value)}
                      placeholder={formatCurrency(item.expected)}
                      className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                ))}
              </div>

              {totalCounted > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex justify-between items-center p-4 rounded-xl border ${
                    Math.abs(difference) < 0.01
                      ? "bg-primary/5 border-primary/20"
                      : Math.abs(difference) < 5
                        ? "bg-warning/10 border-warning/20"
                        : "bg-destructive/5 border-destructive/20"
                  }`}
                >
                  <span className="text-sm font-semibold text-foreground">Diferença</span>
                  <span className={`text-xl font-black font-mono ${
                    Math.abs(difference) < 0.01 ? "text-primary" : Math.abs(difference) < 5 ? "text-warning" : "text-destructive"
                  }`}>
                    {difference >= 0 ? "+" : ""}{formatCurrency(difference)}
                  </span>
                </motion.div>
              )}

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Observações</label>
                <textarea
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="Observações do fechamento..."
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition-all"
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setView("status")} className="flex-1 py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold border border-border/50 hover:opacity-90 transition-all">
                  Voltar
                </button>
                <button onClick={handleClose} disabled={submitting} className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm transition-all">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar Fechamento
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
