import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Banknote, CreditCard, Wallet, QrCode, Ticket, Clock as ClockIcon, X, Check, ChevronLeft, Loader2, Copy, Layers, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { generatePixPayload } from "@/lib/pix-brcode";
import { QRCodeSVG } from "qrcode.react";

export interface TEFResult {
  method: string;
  approved: boolean;
  amount: number;
  nsu?: string;
  authCode?: string;
  cardBrand?: string;
  cardLastDigits?: string;
  installments?: number;
  changeAmount?: number;
  pixTxId?: string;
}

interface TEFProcessorProps {
  total: number;
  onComplete: (results: TEFResult[]) => void;
  onCancel: () => void;
  onPrazoRequested?: () => void;
  defaultMethod?: string | null;
  pixConfig?: {
    pixKey: string;
    pixKeyType?: string;
    merchantName: string;
    merchantCity: string;
  } | null;
  tefConfig?: any;
}

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type PayMethod = "dinheiro" | "debito" | "credito" | "pix" | "voucher" | "multi" | null;

const methods = [
  { id: "dinheiro" as const, label: "Dinheiro", shortcut: "1", icon: Banknote, bgClass: "bg-emerald-600 hover:bg-emerald-500", borderClass: "border-emerald-400/40" },
  { id: "debito" as const, label: "Débito", shortcut: "2", icon: CreditCard, bgClass: "bg-blue-600 hover:bg-blue-500", borderClass: "border-blue-400/40" },
  { id: "credito" as const, label: "Crédito", shortcut: "3", icon: Wallet, bgClass: "bg-violet-600 hover:bg-violet-500", borderClass: "border-violet-400/40" },
  { id: "pix" as const, label: "PIX", shortcut: "4", icon: QrCode, bgClass: "bg-teal-600 hover:bg-teal-500", borderClass: "border-teal-400/40" },
  { id: "voucher" as const, label: "Voucher", shortcut: "5", icon: Ticket, bgClass: "bg-amber-600 hover:bg-amber-500", borderClass: "border-amber-400/40" },
  { id: "multi" as const, label: "Múltiplas", shortcut: "6", icon: Layers, bgClass: "bg-orange-600 hover:bg-orange-500", borderClass: "border-orange-400/40" },
];

export function TEFProcessor({ total, onComplete, onCancel, onPrazoRequested, defaultMethod, pixConfig }: TEFProcessorProps) {
  const [selected, setSelected] = useState<PayMethod>((defaultMethod as PayMethod) || null);
  const [step, setStep] = useState<"select" | "process">(defaultMethod ? "process" : "select");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Dinheiro
  const [cashReceived, setCashReceived] = useState("");
  const cashInputRef = useRef<HTMLInputElement>(null);

  // Crédito
  const [installments, setInstallments] = useState(1);
  const maxInstallments = 12;

  // PIX
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [pixWaiting, setPixWaiting] = useState(false);

  // Voucher
  const [voucherCode, setVoucherCode] = useState("");

  // Multi-payment sub-form state
  const [multiMethod, setMultiMethod] = useState<PayMethod>(null);
  const [multiAmount, setMultiAmount] = useState("");
  // Multi-payment
  const [multiPayments, setMultiPayments] = useState<TEFResult[]>([]);
  const multiPaid = multiPayments.reduce((s, p) => s + p.amount, 0);
  const multiRemaining = total - multiPaid;

  useEffect(() => {
    if (defaultMethod) {
      setSelected(defaultMethod as PayMethod);
      setStep("process");
    }
  }, [defaultMethod]);

  useEffect(() => {
    if (step === "process" && selected === "dinheiro") {
      setTimeout(() => cashInputRef.current?.focus(), 100);
    }
    if (step === "process" && selected === "pix" && pixConfig?.pixKey) {
      try {
        const code = generatePixPayload({ pixKey: pixConfig.pixKey, merchantName: pixConfig.merchantName, merchantCity: pixConfig.merchantCity, amount: total });
        setPixCode(code);
        setPixWaiting(true);
      } catch {
        setPixCode(null);
      }
    }
  }, [step, selected]);

  // Keyboard shortcut for method selection
  useEffect(() => {
    if (step !== "select") return;
    const handler = (e: KeyboardEvent) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= 6) {
        e.preventDefault();
        const method = methods[num - 1];
        if (method) handleSelect(method.id);
      }
      if (e.key === "7" && onPrazoRequested) {
        e.preventDefault();
        onPrazoRequested();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, onCancel, onPrazoRequested]);

  const handleSelect = (method: PayMethod) => {
    setSelected(method);
    setStep("process");
    setError(null);
    setCashReceived("");
    setInstallments(1);
    setPixCode(null);
    setPixWaiting(false);
    setVoucherCode("");
  };

  const confirmPayment = useCallback((extra?: Partial<TEFResult>) => {
    if (!selected) return;
    setProcessing(true);
    setError(null);
    // Simulate brief TEF authorization
    setTimeout(() => {
      setProcessing(false);
      onComplete([{
        method: selected,
        approved: true,
        amount: total,
        ...extra,
      }]);
    }, 300);
  }, [selected, total, onComplete]);

  const goBack = () => {
    setStep("select");
    setSelected(null);
    setCashReceived("");
    setInstallments(1);
    setPixCode(null);
    setPixWaiting(false);
    setVoucherCode("");
    setError(null);
    setProcessing(false);
    setMultiMethod(null);
    setMultiAmount("");
    setMultiPayments([]);
  };

  const parseCash = (v: string) => parseFloat(v.replace(",", ".")) || 0;

  // Quick cash values
  const quickCashValues = [5, 10, 20, 50, 100, 200];

  // ── DINHEIRO ──
  const renderDinheiro = () => {
    const received = parseCash(cashReceived);
    const change = received - total;
    const canConfirm = received >= total;

    return (
      <div className="flex flex-col gap-2">
        {/* Total + Input lado a lado */}
        <div className="flex gap-3 items-stretch">
          <div className="rounded-xl p-3 text-center flex-1" style={{ backgroundColor: "hsl(0, 72%, 40%)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">TOTAL</p>
            <p className="text-2xl font-black font-mono text-white">{fmt(total)}</p>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Recebido</label>
            <input
              ref={cashInputRef}
              type="text"
              inputMode="decimal"
              value={cashReceived}
              onChange={e => setCashReceived(e.target.value)}
              placeholder="0,00"
              className="w-full text-center text-2xl font-black font-mono h-12 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-foreground"
              onKeyDown={e => { if (e.key === "Enter" && canConfirm) confirmPayment({ changeAmount: change > 0 ? change : 0 }); }}
            />
          </div>
        </div>

        {/* Quick values */}
        <div className="grid grid-cols-5 gap-1">
          {quickCashValues.map(v => (
            <button key={v} onClick={() => setCashReceived(v.toFixed(2).replace(".", ","))}
              className="py-2 rounded-lg bg-muted hover:bg-accent text-foreground font-bold text-xs font-mono transition-all active:scale-95 border border-border">
              R${v}
            </button>
          ))}
          <button onClick={() => setCashReceived(total.toFixed(2).replace(".", ","))}
            className="col-span-2 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-bold text-xs transition-all active:scale-95 border border-emerald-500/30">
            Exato
          </button>
        </div>

        {/* Troco / Falta */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: received > 0 ? 1 : 0.3 }}
          className={`rounded-xl p-3 text-center border-2 ${
            canConfirm
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-destructive/10 border-destructive/30"
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {canConfirm ? "TROCO" : "FALTA"}
          </p>
          <p className={`text-2xl font-black font-mono ${canConfirm ? "text-emerald-500" : "text-destructive"}`}>
            {fmt(Math.abs(change))}
          </p>
        </motion.div>

        {/* Confirm */}
        <button
          onClick={() => confirmPayment({ changeAmount: change > 0 ? change : 0 })}
          disabled={!canConfirm || processing}
          className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-muted disabled:text-muted-foreground text-white text-base font-black transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-emerald-400/40 disabled:border-border shadow-lg"
        >
          {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          {processing ? "Processando..." : "Confirmar Pagamento"}
        </button>
      </div>
    );
  };

  // ── DÉBITO ──
  const renderDebito = () => (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="rounded-2xl p-4 text-center w-full" style={{ backgroundColor: "hsl(217, 72%, 40%)" }}>
        <p className="text-xs font-bold uppercase tracking-widest text-white/70">DÉBITO</p>
        <p className="text-4xl lg:text-5xl font-black font-mono text-white" style={{ textShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>{fmt(total)}</p>
      </div>
      <div className="rounded-2xl bg-blue-500/5 border-2 border-blue-500/20 p-8 text-center space-y-4 w-full max-w-sm">
        <CreditCard className="w-16 h-16 mx-auto text-blue-400" />
        <p className="text-base font-medium text-muted-foreground">Insira ou aproxime o cartão na maquininha</p>
        <div className="flex items-center justify-center gap-2 text-blue-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-bold">Aguardando autorização TEF...</span>
        </div>
      </div>
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm font-medium w-full max-w-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}
      <div className="flex gap-3 w-full max-w-sm">
        <button onClick={goBack} className="flex-1 h-14 rounded-2xl border-2 border-border text-foreground font-bold text-sm hover:bg-muted transition-all active:scale-95">
          Voltar
        </button>
        <button onClick={() => confirmPayment()} disabled={processing}
          className="flex-1 h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 border border-blue-400/40 disabled:opacity-50">
          {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          Confirmar
        </button>
      </div>
    </div>
  );

  // ── CRÉDITO ──
  const renderCredito = () => {
    const installmentValue = total / installments;
    return (
      <div className="flex flex-col items-center gap-5 py-4">
        <div className="rounded-2xl p-4 text-center w-full" style={{ backgroundColor: "hsl(270, 72%, 40%)" }}>
          <p className="text-xs font-bold uppercase tracking-widest text-white/70">CRÉDITO</p>
          <p className="text-4xl lg:text-5xl font-black font-mono text-white" style={{ textShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>{fmt(total)}</p>
        </div>

        {/* Parcelas */}
        <div className="w-full space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Parcelas</label>
          <div className="grid grid-cols-4 lg:grid-cols-6 gap-1.5">
            {Array.from({ length: maxInstallments }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setInstallments(n)}
                className={`h-12 lg:h-14 rounded-xl text-sm font-black font-mono transition-all active:scale-95 border ${
                  installments === n
                    ? "bg-violet-600 text-white border-violet-400/40 shadow-lg scale-105"
                    : "bg-muted text-foreground hover:bg-accent border-border"
                }`}>
                {n}x
              </button>
            ))}
          </div>
        </div>

        {/* Valor parcela */}
        <div className="rounded-2xl bg-violet-500/10 border-2 border-violet-500/20 p-5 text-center w-full">
          <p className="text-xs text-muted-foreground font-bold uppercase">Valor da Parcela</p>
          <p className="text-2xl font-black font-mono text-foreground mt-1">
            {installments}x de {fmt(installmentValue)}
          </p>
        </div>

        <div className="rounded-2xl bg-violet-500/5 border border-violet-500/20 p-6 text-center space-y-3 w-full max-w-sm">
          <Wallet className="w-12 h-12 mx-auto text-violet-400" />
          <p className="text-sm text-muted-foreground font-medium">Insira ou aproxime o cartão</p>
          {processing && (
            <div className="flex items-center justify-center gap-2 text-violet-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs font-bold">Autorizando...</span>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm font-medium w-full">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        <button onClick={() => confirmPayment({ installments })} disabled={processing}
          className="w-full h-14 lg:h-16 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-lg font-black transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-violet-400/40 disabled:opacity-50 shadow-lg">
          {processing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check className="w-6 h-6" />}
          Confirmar {installments}x {fmt(installmentValue)}
        </button>
      </div>
    );
  };

  // ── PIX ──
  const renderPix = () => (
    <div className="flex flex-col items-center gap-5 py-4">
      <div className="rounded-2xl p-4 text-center w-full" style={{ backgroundColor: "hsl(174, 72%, 32%)" }}>
        <p className="text-xs font-bold uppercase tracking-widest text-white/70">PIX</p>
        <p className="text-4xl lg:text-5xl font-black font-mono text-white" style={{ textShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>{fmt(total)}</p>
      </div>

      {pixCode ? (
        <div className="space-y-4 w-full flex flex-col items-center">
          <div className="bg-white rounded-2xl p-5 shadow-xl">
            <QRCodeSVG value={pixCode} size={220} level="M" />
          </div>
          <div className="w-full space-y-2">
            <p className="text-xs text-center text-muted-foreground font-bold uppercase">Pix Copia e Cola</p>
            <div className="flex gap-2">
              <input value={pixCode} readOnly className="flex-1 px-3 py-2 rounded-xl bg-muted border border-border text-[10px] font-mono text-foreground" />
              <button onClick={() => { navigator.clipboard.writeText(pixCode); toast.success("Código PIX copiado!"); }}
                className="px-3 py-2 rounded-xl bg-muted hover:bg-accent border border-border transition-all active:scale-95">
                <Copy className="w-4 h-4 text-foreground" />
              </button>
            </div>
          </div>
          {pixWaiting && (
            <div className="flex items-center justify-center gap-2 text-teal-400 py-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-bold">Aguardando pagamento PIX...</span>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-teal-500/5 border-2 border-teal-500/20 p-8 text-center space-y-3 w-full max-w-sm">
          <QrCode className="w-16 h-16 mx-auto text-teal-400" />
          <p className="text-sm text-muted-foreground font-medium">
            {pixConfig ? "Gerando QR Code..." : "Configure a chave PIX em Configurações para QR Code automático"}
          </p>
        </div>
      )}

      <button onClick={() => confirmPayment({ pixTxId: `PIX-${Date.now()}` })} disabled={processing}
        className="w-full max-w-sm h-14 lg:h-16 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-lg font-black transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-teal-400/40 disabled:opacity-50 shadow-lg">
        {processing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check className="w-6 h-6" />}
        Confirmar Recebimento PIX
      </button>
    </div>
  );

  // ── VOUCHER ──
  const renderVoucher = () => (
    <div className="flex flex-col items-center gap-5 py-4">
      <div className="rounded-2xl p-4 text-center w-full" style={{ backgroundColor: "hsl(38, 72%, 40%)" }}>
        <p className="text-xs font-bold uppercase tracking-widest text-white/70">VOUCHER</p>
        <p className="text-4xl lg:text-5xl font-black font-mono text-white" style={{ textShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>{fmt(total)}</p>
      </div>

      <div className="w-full space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Código do Voucher</label>
        <input value={voucherCode} onChange={e => setVoucherCode(e.target.value)}
          placeholder="Digite ou escaneie o voucher" autoFocus
          className="w-full text-center text-xl font-mono h-14 bg-background border-2 border-border rounded-2xl focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 text-foreground"
          onKeyDown={e => { if (e.key === "Enter" && voucherCode.trim()) confirmPayment({ nsu: voucherCode }); }}
        />
      </div>

      <div className="rounded-2xl bg-amber-500/5 border-2 border-amber-500/20 p-6 text-center space-y-3 w-full max-w-sm">
        <Ticket className="w-12 h-12 mx-auto text-amber-400" />
        <p className="text-sm text-muted-foreground font-medium">Vale alimentação, vale refeição ou outro voucher</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm font-medium w-full">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <button onClick={() => confirmPayment({ nsu: voucherCode || "VOUCHER" })} disabled={!voucherCode.trim() || processing}
        className="w-full max-w-sm h-14 lg:h-16 rounded-2xl bg-amber-600 hover:bg-amber-500 disabled:bg-muted disabled:text-muted-foreground text-white text-lg font-black transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-amber-400/40 disabled:border-border shadow-lg">
        {processing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check className="w-6 h-6" />}
        Confirmar Voucher
      </button>
    </div>
  );

  // ── MÚLTIPLAS FORMAS ──
  const renderMulti = () => {

    const addMultiPayment = (method: string, amount: number, extra?: Partial<TEFResult>) => {
      const newPayment: TEFResult = { method, approved: true, amount, ...extra };
      const updated = [...multiPayments, newPayment];
      setMultiPayments(updated);
      setMultiMethod(null);
      setMultiAmount("");

      const newPaid = updated.reduce((s, p) => s + p.amount, 0);
      if (newPaid >= total - 0.01) {
        // All paid
        onComplete(updated);
      }
    };

    const remaining = total - multiPayments.reduce((s, p) => s + p.amount, 0);

    return (
      <div className="flex flex-col gap-4">
        {/* Resumo */}
        <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: "hsl(25, 72%, 40%)" }}>
          <p className="text-xs font-bold uppercase tracking-widest text-white/70">TOTAL DA VENDA</p>
          <p className="text-3xl font-black font-mono text-white">{fmt(total)}</p>
        </div>

        {/* Pagamentos já registrados */}
        {multiPayments.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-muted-foreground uppercase">Pagamentos Registrados</p>
            {multiPayments.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-sm font-bold text-foreground capitalize">{p.method}</span>
                <span className="text-sm font-black font-mono text-emerald-500">{fmt(p.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Saldo restante */}
        <div className={`rounded-2xl p-4 text-center border-2 ${remaining <= 0.01 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-destructive/10 border-destructive/30"}`}>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SALDO RESTANTE</p>
          <p className={`text-3xl font-black font-mono ${remaining <= 0.01 ? "text-emerald-500" : "text-destructive"}`}>
            {fmt(Math.max(0, remaining))}
          </p>
        </div>

        {remaining > 0.01 && !multiMethod && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "dinheiro", label: "Dinheiro", icon: Banknote, cls: "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/40" },
              { id: "debito", label: "Débito", icon: CreditCard, cls: "bg-blue-600 hover:bg-blue-500 text-white border-blue-400/40" },
              { id: "credito", label: "Crédito", icon: Wallet, cls: "bg-violet-600 hover:bg-violet-500 text-white border-violet-400/40" },
              { id: "pix", label: "PIX", icon: QrCode, cls: "bg-teal-600 hover:bg-teal-500 text-white border-teal-400/40" },
              { id: "voucher", label: "Voucher", icon: Ticket, cls: "bg-amber-600 hover:bg-amber-500 text-white border-amber-400/40" },
            ].map(({ id, label, icon: Icon, cls }) => (
              <button key={id} onClick={() => { setMultiMethod(id as PayMethod); setMultiAmount(remaining.toFixed(2).replace(".", ",")); }}
                className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl font-bold text-xs transition-all active:scale-95 border ${cls}`}>
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Input do valor parcial */}
        {multiMethod && remaining > 0.01 && (
          <div className="space-y-3 p-4 rounded-2xl bg-muted/50 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground capitalize">{multiMethod}</span>
              <button onClick={() => setMultiMethod(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={multiAmount}
              onChange={e => setMultiAmount(e.target.value)}
              autoFocus
              className="w-full text-center text-2xl font-black font-mono h-14 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground"
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const val = parseCash(multiAmount);
                  if (val > 0) addMultiPayment(multiMethod!, Math.min(val, remaining));
                }
              }}
            />
            <button
              onClick={() => {
                const val = parseCash(multiAmount);
                if (val > 0) addMultiPayment(multiMethod!, Math.min(val, remaining));
              }}
              disabled={parseCash(multiAmount) <= 0}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" /> Registrar {multiMethod}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderProcess = () => {
    switch (selected) {
      case "dinheiro": return renderDinheiro();
      case "debito": return renderDebito();
      case "credito": return renderCredito();
      case "pix": return renderPix();
      case "voucher": return renderVoucher();
      case "multi": return renderMulti();
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch lg:items-center justify-center bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="bg-card border border-border shadow-2xl w-full h-full lg:h-auto lg:max-h-[95vh] lg:max-w-md lg:mx-4 lg:rounded-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 lg:px-6 py-3 lg:py-4 border-b-2 border-border bg-muted/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            {step === "process" && (
              <button onClick={goBack} className="p-2 rounded-xl hover:bg-muted transition-all active:scale-95 border border-border">
                <ChevronLeft className="w-5 h-5 text-foreground" />
              </button>
            )}
            <h2 className="text-lg lg:text-xl font-black text-foreground">
              {step === "select" ? "Forma de Pagamento" : methods.find(m => m.id === selected)?.label || "Pagamento"}
            </h2>
          </div>
          <button onClick={onCancel} className="p-2 rounded-xl hover:bg-destructive/10 transition-all active:scale-95 border border-border text-muted-foreground hover:text-destructive">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading overlay */}
        {processing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="text-lg font-bold text-foreground">Autorizando pagamento...</p>
              <p className="text-sm text-muted-foreground">Aguarde a resposta do TEF</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <AnimatePresence mode="wait">
            {step === "select" ? (
              <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4">
                {/* Total em destaque */}
                <div className="rounded-2xl p-4 lg:p-5 text-center" style={{ backgroundColor: "hsl(0, 72%, 40%)" }}>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/70">TOTAL A PAGAR</p>
                  <p className="text-4xl lg:text-5xl font-black font-mono text-white mt-1" style={{ textShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
                    {fmt(total)}
                  </p>
                </div>

                {/* Payment method grid */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-3">
                  {methods.map(({ id, label, shortcut, icon: Icon, bgClass, borderClass }) => (
                    <motion.button
                      key={id}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSelect(id)}
                      className={`flex flex-col items-center justify-center gap-2 p-4 lg:p-5 rounded-2xl ${bgClass} text-white font-bold transition-all border ${borderClass} shadow-lg hover:shadow-xl`}
                    >
                      <Icon className="w-8 h-8 lg:w-10 lg:h-10" />
                      <span className="text-sm lg:text-base font-black">{label}</span>
                      <span className="text-[10px] font-mono opacity-60 bg-black/20 px-2 py-0.5 rounded-full">{shortcut}</span>
                    </motion.button>
                  ))}
                </div>

                {/* A Prazo */}
                {onPrazoRequested && (
                  <button onClick={onPrazoRequested}
                    className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-black transition-all border border-orange-400/40 shadow-lg active:scale-[0.98]">
                    <ClockIcon className="w-6 h-6" />
                    <span className="text-sm lg:text-base">Venda a Prazo (Fiado)</span>
                    <span className="text-[10px] font-mono opacity-60 bg-black/20 px-2 py-0.5 rounded-full">7</span>
                  </button>
                )}

                <p className="text-center text-xs text-muted-foreground">
                  Pressione <span className="font-mono font-bold">1-7</span> para selecionar • <span className="font-mono font-bold">ESC</span> para cancelar
                </p>
              </motion.div>
            ) : (
              <motion.div key="process" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                {renderProcess()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
