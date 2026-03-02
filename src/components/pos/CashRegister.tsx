import { useState, useEffect, useCallback } from "react";
import { DollarSign, Lock, Unlock, ArrowDownCircle, ArrowUpCircle, Banknote, CreditCard, QrCode, X, Loader2, Clock, ShoppingCart, Wallet, TrendingUp, ChevronRight, Printer } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { CashSessionService } from "@/services";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { openCashDrawer } from "@/lib/escpos";

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
  const { companyId, companyName } = useCompany();
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
      try { localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(offlineSession)); } catch { }
      setSession(offlineSession as any); setView("status"); setSubmitting(false);
      toast.success("Caixa aberto offline (sem conexão)"); return;
    }
    try {
      const data = await CashSessionService.open({ companyId, userId: user.id, openingBalance: Number(openingBalance) || 0, terminalId });
      setSession(data); setView("status"); toast.success("Caixa aberto com sucesso");
    } catch {
      const offlineSession = makeOfflineSession(companyId, user.id, Number(openingBalance) || 0, terminalId);
      try { localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(offlineSession)); } catch { }
      setSession(offlineSession as any); setView("status"); toast.success("Caixa aberto offline (sem conexão)");
    } finally { setSubmitting(false); }
  };

  const handleClose = async () => {
    if (!companyId || !user || !session) return;
    setSubmitting(true);
    try {
      await CashSessionService.close({ sessionId: session.id, companyId, userId: user.id, countedDinheiro: Number(countedDinheiro) || 0, countedDebito: Number(countedDebito) || 0, countedCredito: Number(countedCredito) || 0, countedPix: Number(countedPix) || 0, notes: closingNotes || undefined });
      try { localStorage.removeItem(OFFLINE_SESSION_KEY); } catch {}
      setSession(null); setView("status"); toast.success("Caixa fechado com sucesso");
    } catch (err: any) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handlePrintClosing = useCallback(() => {
    const now = new Date();
    const html = `
      <html><head><title>Fechamento de Caixa</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 12px; padding: 8px; width: 80mm; color: #000; background: #fff; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; padding: 2px 0; }
        .section { margin-top: 8px; }
        h2 { font-size: 14px; margin-bottom: 4px; }
        .diff-ok { }
        .diff-warn { font-weight: bold; }
      </style></head><body>
        <div class="center bold"><h2>FECHAMENTO DE CAIXA</h2></div>
        <div class="center">${companyName || 'PDV'}</div>
        <div class="center">Terminal: T${session?.terminal_id || terminalId}</div>
        <div class="center">${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}</div>
        <div class="line"></div>
        ${session?.opened_at ? `<div class="row"><span>Abertura:</span><span>${new Date(session.opened_at).toLocaleString("pt-BR")}</span></div>` : ''}
        <div class="row"><span>Fechamento:</span><span>${now.toLocaleString("pt-BR")}</span></div>
        <div class="line"></div>
        <div class="section bold">RESUMO</div>
        <div class="row"><span>Fundo Inicial:</span><span>${formatCurrency(openBalance)}</span></div>
        <div class="row"><span>Total Vendas:</span><span>${formatCurrency(totalVendas)}</span></div>
        <div class="row"><span>Nº Vendas:</span><span>${salesCount}</span></div>
        <div class="line"></div>
        <div class="section bold">FORMAS DE PAGAMENTO</div>
        <div class="row"><span>Dinheiro:</span><span>${formatCurrency(totalDinheiro)}</span></div>
        <div class="row"><span>Débito:</span><span>${formatCurrency(totalDebito)}</span></div>
        <div class="row"><span>Crédito:</span><span>${formatCurrency(totalCredito)}</span></div>
        <div class="row"><span>PIX:</span><span>${formatCurrency(totalPix)}</span></div>
        <div class="line"></div>
        <div class="row"><span>Sangrias:</span><span>-${formatCurrency(totalSangria)}</span></div>
        <div class="row"><span>Suprimentos:</span><span>+${formatCurrency(totalSuprimento)}</span></div>
        <div class="line"></div>
        <div class="section bold">CONFERÊNCIA</div>
        <div class="row"><span>Esperado Total:</span><span>${formatCurrency(totalExpected)}</span></div>
        <div class="row"><span>Contado Total:</span><span>${formatCurrency(totalCounted)}</span></div>
        <div class="row bold ${Math.abs(difference) < 0.01 ? 'diff-ok' : 'diff-warn'}">
          <span>Diferença:</span><span>${difference >= 0 ? "+" : ""}${formatCurrency(difference)}</span>
        </div>
        ${closingNotes ? `<div class="line"></div><div class="section"><span class="bold">Obs:</span> ${closingNotes}</div>` : ''}
        <div class="line"></div>
        <div class="center" style="margin-top:8px;font-size:10px;">Documento não fiscal</div>
        <div style="margin-top:20px;border-top:1px dashed #000;"></div>
      </body></html>
    `;
    const w = window.open("", "_blank", "width=350,height=600");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => { w.print(); }, 300);
    }
  }, [session, companyName, terminalId, openBalance, totalVendas, salesCount, totalDinheiro, totalDebito, totalCredito, totalPix, totalSangria, totalSuprimento, totalExpected, totalCounted, difference, closingNotes]);

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

  const inputClass = "w-full px-4 py-3 rounded-xl bg-background border border-input text-foreground font-mono text-lg font-semibold text-center focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring";
  const btnSecondary = "flex-1 py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-secondary/80 active:scale-[0.98]";
  const btnPrimary = "flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50";

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card rounded-2xl border border-border shadow-2xl p-10 flex flex-col items-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Carregando caixa...</span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={preventClose ? undefined : onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-hidden flex flex-col border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Premium Header ── */}
        <div
          className="relative px-5 py-4 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, hsl(220 25% 14%), hsl(220 30% 20%))" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Controle de Caixa</h3>
              <p className="text-xs text-white/60">Terminal {session?.terminal_id || terminalId}</p>
            </div>
          </div>
          {!preventClose && (
            <button onClick={onClose} className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">
          {/* STATUS VIEW */}
          {view === "status" && (
            <div className="p-5 space-y-4">
              {/* Status pill */}
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                isOpen
                  ? "bg-success/5 border-success/20"
                  : "bg-muted border-border"
              }`}>
                {isOpen ? (
                  <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                    <Unlock className="w-4 h-4 text-success" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">{isOpen ? "Caixa Aberto" : "Caixa Fechado"}</p>
                  {isOpen && session?.opened_at && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      Desde {new Date(session.opened_at).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>
                {isOpen && <div className="w-2 h-2 rounded-full bg-success animate-pulse flex-shrink-0" />}
              </div>

              {isOpen ? (
                <>
                  {/* KPI Grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { label: "Fundo Inicial", value: formatCurrency(openBalance), icon: Wallet, accent: false },
                      { label: "Total Vendas", value: formatCurrency(totalVendas), icon: TrendingUp, accent: true },
                      { label: "Nº Vendas", value: String(salesCount), icon: ShoppingCart, accent: false },
                      { label: "Dinheiro Esperado", value: formatCurrency(expectedCash), icon: Banknote, accent: false },
                    ].map((kpi) => (
                      <div
                        key={kpi.label}
                        className={`rounded-xl p-3.5 border ${
                          kpi.accent
                            ? "bg-primary/5 border-primary/15"
                            : "bg-muted/50 border-border/60"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <kpi.icon className={`w-3.5 h-3.5 ${kpi.accent ? "text-primary" : "text-muted-foreground"}`} />
                          <span className={`text-[10px] font-semibold uppercase tracking-wider ${kpi.accent ? "text-primary" : "text-muted-foreground"}`}>
                            {kpi.label}
                          </span>
                        </div>
                        <p className={`text-lg font-black font-mono ${kpi.accent ? "text-primary" : "text-foreground"}`}>
                          {kpi.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Payment breakdown */}
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Formas de Pagamento</p>
                    </div>
                    <div className="divide-y divide-border/60">
                      {[
                        { label: "Dinheiro", value: totalDinheiro, icon: Banknote },
                        { label: "Débito", value: totalDebito, icon: CreditCard },
                        { label: "Crédito", value: totalCredito, icon: CreditCard },
                        { label: "PIX", value: totalPix, icon: QrCode },
                      ].map((pm) => (
                        <div key={pm.label} className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <pm.icon className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-foreground">{pm.label}</span>
                          </div>
                          <span className="font-mono font-bold text-sm text-foreground">{formatCurrency(pm.value)}</span>
                        </div>
                      ))}
                      {/* Sangria / Suprimento */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-destructive/[0.03]">
                        <div className="flex items-center gap-2.5">
                          <ArrowDownCircle className="w-4 h-4 text-destructive" />
                          <span className="text-sm text-foreground">Sangrias</span>
                        </div>
                        <span className="font-mono font-bold text-sm text-destructive">-{formatCurrency(totalSangria)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5 bg-primary/[0.03]">
                        <div className="flex items-center gap-2.5">
                          <ArrowUpCircle className="w-4 h-4 text-primary" />
                          <span className="text-sm text-foreground">Suprimentos</span>
                        </div>
                        <span className="font-mono font-bold text-sm text-primary">+{formatCurrency(totalSuprimento)}</span>
                      </div>
                    </div>
                  </div>

                  {preventClose && (
                    <button onClick={onClose} className={`${btnPrimary} w-full`}>
                      <Unlock className="w-4 h-4" /> Continuar para o PDV
                    </button>
                  )}

                  {/* Actions */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => { setMovementType("sangria"); setView("movement"); }}
                      className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-secondary hover:bg-secondary/80 active:scale-[0.97] border border-border/50"
                    >
                      <ArrowDownCircle className="w-5 h-5 text-destructive" />
                      <span className="text-[11px] font-semibold text-foreground">Sangria</span>
                    </button>
                    <button
                      onClick={() => { setMovementType("suprimento"); setView("movement"); }}
                      className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-secondary hover:bg-secondary/80 active:scale-[0.97] border border-border/50"
                    >
                      <ArrowUpCircle className="w-5 h-5 text-primary" />
                      <span className="text-[11px] font-semibold text-foreground">Suprimento</span>
                    </button>
                    <button
                      onClick={() => setView("close")}
                      className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.97] border border-destructive shadow-md shadow-destructive/20"
                    >
                      <Lock className="w-5 h-5" />
                      <span className="text-[11px] font-bold">Fechar Caixa</span>
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={() => setView("open")} className={`${btnPrimary} w-full`}>
                  <Unlock className="w-4 h-4" /> Abrir Caixa
                </button>
              )}
            </div>
          )}

          {/* OPEN VIEW */}
          {view === "open" && (
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Unlock className="w-5 h-5 text-primary" />
                </div>
                <h4 className="text-base font-bold text-foreground">Abertura de Caixa</h4>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Fundo de Troco (R$)</label>
                <input type="number" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} autoFocus className={inputClass} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setView("status")} className={btnSecondary}>Cancelar</button>
                <button onClick={handleOpen} disabled={submitting} className={btnPrimary}>
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Abrir Caixa
                </button>
              </div>
            </div>
          )}

          {/* MOVEMENT VIEW */}
          {view === "movement" && (
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${movementType === "sangria" ? "bg-destructive/10" : "bg-primary/10"}`}>
                  {movementType === "sangria" ? <ArrowDownCircle className="w-5 h-5 text-destructive" /> : <ArrowUpCircle className="w-5 h-5 text-primary" />}
                </div>
                <h4 className="text-base font-bold text-foreground">{movementType === "sangria" ? "Sangria" : "Suprimento"}</h4>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Valor (R$)</label>
                <input type="number" step="0.01" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} autoFocus className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Motivo</label>
                <input type="text" value={movementDesc} onChange={(e) => setMovementDesc(e.target.value)} placeholder="Ex: Troco para cliente..." className="w-full px-4 py-2.5 rounded-xl bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setView("status")} className={btnSecondary}>Cancelar</button>
                <button onClick={handleMovement} disabled={!movementAmount || Number(movementAmount) <= 0 || submitting} className={btnPrimary}>
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar
                </button>
              </div>
            </div>
          )}

          {/* CLOSE VIEW */}
          {view === "close" && (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-foreground">Fechamento de Caixa</h4>
                  <p className="text-xs text-muted-foreground">Informe os valores conferidos</p>
                </div>
              </div>

              <div className="space-y-2.5">
                {[
                  { label: "Dinheiro", expected: expectedCash, value: countedDinheiro, setter: setCountedDinheiro, icon: Banknote },
                  { label: "Débito", expected: totalDebito, value: countedDebito, setter: setCountedDebito, icon: CreditCard },
                  { label: "Crédito", expected: totalCredito, value: countedCredito, setter: setCountedCredito, icon: CreditCard },
                  { label: "PIX", expected: totalPix, value: countedPix, setter: setCountedPix, icon: QrCode },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <item.icon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">{item.label}</span>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground">Esp: {formatCurrency(item.expected)}</span>
                    </div>
                    <input
                      type="number" step="0.01" value={item.value}
                      onChange={(e) => item.setter(e.target.value)}
                      placeholder={formatCurrency(item.expected)}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-input text-foreground text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                    />
                  </div>
                ))}
              </div>

              {totalCounted > 0 && (
                <div className={`flex justify-between items-center p-4 rounded-xl border ${
                  Math.abs(difference) < 0.01
                    ? "bg-success/5 border-success/20"
                    : Math.abs(difference) < 5
                      ? "bg-warning/10 border-warning/20"
                      : "bg-destructive/5 border-destructive/20"
                }`}>
                  <span className="text-sm font-semibold text-foreground">Diferença</span>
                  <span className={`text-xl font-black font-mono ${
                    Math.abs(difference) < 0.01 ? "text-success" : Math.abs(difference) < 5 ? "text-warning" : "text-destructive"
                  }`}>
                    {difference >= 0 ? "+" : ""}{formatCurrency(difference)}
                  </span>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Observações</label>
                <textarea value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} placeholder="Observações do fechamento..." rows={2} className="w-full px-4 py-2.5 rounded-xl bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring resize-none" />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setView("status")} className={btnSecondary}>Voltar</button>
                <button onClick={handlePrintClosing} className="py-3 px-4 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-secondary/80 active:scale-[0.98] flex items-center justify-center gap-2 border border-border/50" title="Imprimir resumo">
                  <Printer className="w-4 h-4" />
                </button>
                <button onClick={handleClose} disabled={submitting} className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold hover:bg-destructive/90 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar Fechamento
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

