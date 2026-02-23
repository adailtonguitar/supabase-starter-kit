import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Banknote, CreditCard, Wallet, QrCode, Ticket, ClockIcon, X, Check, ChevronLeft, Loader2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type PayMethod = "dinheiro" | "debito" | "credito" | "pix" | "voucher" | null;

const methods = [
  { id: "dinheiro" as const, label: "Dinheiro", icon: Banknote, color: "from-emerald-600 to-emerald-700", border: "border-emerald-500/30", bg: "bg-emerald-500/10" },
  { id: "debito" as const, label: "Débito", icon: CreditCard, color: "from-blue-600 to-blue-700", border: "border-blue-500/30", bg: "bg-blue-500/10" },
  { id: "credito" as const, label: "Crédito", icon: Wallet, color: "from-violet-600 to-violet-700", border: "border-violet-500/30", bg: "bg-violet-500/10" },
  { id: "pix" as const, label: "PIX", icon: QrCode, color: "from-teal-500 to-teal-600", border: "border-teal-500/30", bg: "bg-teal-500/10" },
  { id: "voucher" as const, label: "Voucher", icon: Ticket, color: "from-amber-600 to-amber-700", border: "border-amber-500/30", bg: "bg-amber-500/10" },
];

export function TEFProcessor({ total, onComplete, onCancel, onPrazoRequested, defaultMethod, pixConfig }: TEFProcessorProps) {
  const [selected, setSelected] = useState<PayMethod>((defaultMethod as PayMethod) || null);
  const [step, setStep] = useState<"select" | "process">(defaultMethod ? "process" : "select");

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

  const handleSelect = (method: PayMethod) => {
    setSelected(method);
    setStep("process");
  };

  const confirmPayment = (extra?: Partial<TEFResult>) => {
    if (!selected) return;
    onComplete([{
      method: selected,
      approved: true,
      amount: total,
      ...extra,
    }]);
  };

  const goBack = () => {
    setStep("select");
    setSelected(null);
    setCashReceived("");
    setInstallments(1);
    setPixCode(null);
    setPixWaiting(false);
    setVoucherCode("");
  };

  // --- Dinheiro ---
  const renderDinheiro = () => {
    const received = parseFloat(cashReceived.replace(",", ".")) || 0;
    const change = received - total;
    return (
      <div className="space-y-5">
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground font-medium">Total a pagar</p>
          <p className="text-3xl font-black text-primary font-mono">{fmt(total)}</p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Valor recebido</label>
          <Input
            ref={cashInputRef}
            type="text"
            inputMode="decimal"
            value={cashReceived}
            onChange={e => setCashReceived(e.target.value)}
            placeholder="0,00"
            className="text-center text-2xl font-bold font-mono h-14 bg-background"
            onKeyDown={e => { if (e.key === "Enter" && received >= total) confirmPayment({ changeAmount: change > 0 ? change : 0 }); }}
          />
        </div>
        {/* Quick values */}
        <div className="grid grid-cols-4 gap-2">
          {[5, 10, 20, 50, 100, 200].map(v => (
            <button key={v} onClick={() => setCashReceived(v.toFixed(2).replace(".", ","))}
              className="py-2 rounded-lg bg-muted hover:bg-accent text-foreground font-bold text-sm transition-colors">
              R$ {v}
            </button>
          ))}
          <button onClick={() => setCashReceived(total.toFixed(2).replace(".", ","))}
            className="col-span-2 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold text-sm transition-colors">
            Valor exato
          </button>
        </div>
        {received > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl p-4 text-center ${change >= 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-destructive/10 border border-destructive/20"}`}>
            <p className="text-xs font-medium text-muted-foreground">{change >= 0 ? "Troco" : "Falta"}</p>
            <p className={`text-2xl font-black font-mono ${change >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              {fmt(Math.abs(change))}
            </p>
          </motion.div>
        )}
        <Button onClick={() => confirmPayment({ changeAmount: change > 0 ? change : 0 })}
          disabled={received < total} size="lg" className="w-full h-13 text-base font-bold shadow-lg">
          <Check className="w-5 h-5 mr-2" /> Confirmar Pagamento
        </Button>
      </div>
    );
  };

  // --- Débito ---
  const renderDebito = () => (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground font-medium">Pagamento no Débito</p>
        <p className="text-3xl font-black text-primary font-mono">{fmt(total)}</p>
      </div>
      <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-6 text-center space-y-3">
        <CreditCard className="w-12 h-12 mx-auto text-blue-400" />
        <p className="text-sm text-muted-foreground">Insira ou aproxime o cartão na maquininha</p>
        <div className="flex items-center justify-center gap-2 text-blue-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs font-medium">Aguardando...</span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={goBack} className="flex-1">Voltar</Button>
        <Button onClick={() => confirmPayment()} className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold shadow-lg">
          <Check className="w-4 h-4 mr-2" /> Confirmar
        </Button>
      </div>
    </div>
  );

  // --- Crédito ---
  const renderCredito = () => {
    const installmentValue = total / installments;
    return (
      <div className="space-y-5">
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground font-medium">Pagamento no Crédito</p>
          <p className="text-3xl font-black text-primary font-mono">{fmt(total)}</p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parcelas</label>
          <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto">
            {Array.from({ length: maxInstallments }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setInstallments(n)}
                className={`py-2 rounded-lg text-xs font-bold transition-all ${
                  installments === n
                    ? "bg-violet-600 text-white shadow-md scale-105"
                    : "bg-muted text-foreground hover:bg-accent"
                }`}>
                {n}x
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-violet-500/5 border border-violet-500/20 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            {installments}x de <span className="text-foreground font-bold font-mono">{fmt(installmentValue)}</span>
          </p>
        </div>
        <div className="rounded-xl bg-violet-500/5 border border-violet-500/20 p-4 text-center space-y-2">
          <Wallet className="w-10 h-10 mx-auto text-violet-400" />
          <p className="text-sm text-muted-foreground">Insira ou aproxime o cartão</p>
        </div>
        <Button onClick={() => confirmPayment({ installments })}
          className="w-full h-13 text-base font-bold bg-gradient-to-r from-violet-600 to-violet-700 text-white shadow-lg">
          <Check className="w-5 h-5 mr-2" /> Confirmar {installments}x {fmt(installmentValue)}
        </Button>
      </div>
    );
  };

  // --- PIX ---
  const renderPix = () => (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground font-medium">Pagamento via PIX</p>
        <p className="text-3xl font-black text-primary font-mono">{fmt(total)}</p>
      </div>
      {pixCode ? (
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="bg-white rounded-2xl p-4 shadow-lg">
              <QRCodeSVG value={pixCode} size={200} level="M" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-center text-muted-foreground font-medium">Código Pix Copia e Cola</p>
            <div className="flex gap-2">
              <Input value={pixCode} readOnly className="text-[10px] font-mono bg-muted/50" />
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(pixCode); toast.success("Código copiado!"); }}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {pixWaiting && (
            <div className="flex items-center justify-center gap-2 text-teal-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs font-medium">Aguardando pagamento...</span>
            </div>
          )}
          <Button onClick={() => confirmPayment({ pixTxId: `PIX-${Date.now()}` })}
            className="w-full h-13 text-base font-bold bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg">
            <Check className="w-5 h-5 mr-2" /> Confirmar Recebimento
          </Button>
        </div>
      ) : (
        <div className="text-center space-y-4">
          <div className="rounded-xl bg-teal-500/5 border border-teal-500/20 p-6 space-y-3">
            <QrCode className="w-12 h-12 mx-auto text-teal-400" />
            <p className="text-sm text-muted-foreground">
              {pixConfig ? "Gerando QR Code..." : "Configure a chave PIX em Configurações para gerar QR Code automático"}
            </p>
          </div>
          <Button onClick={() => confirmPayment({ pixTxId: `PIX-${Date.now()}` })}
            className="w-full h-13 text-base font-bold bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg">
            <Check className="w-5 h-5 mr-2" /> Confirmar Pagamento PIX
          </Button>
        </div>
      )}
    </div>
  );

  // --- Voucher ---
  const renderVoucher = () => (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground font-medium">Pagamento com Voucher</p>
        <p className="text-3xl font-black text-primary font-mono">{fmt(total)}</p>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Código do voucher</label>
        <Input value={voucherCode} onChange={e => setVoucherCode(e.target.value)} placeholder="Digite ou escaneie o voucher"
          className="text-center text-lg font-mono h-12 bg-background" autoFocus
          onKeyDown={e => { if (e.key === "Enter" && voucherCode.trim()) confirmPayment({ nsu: voucherCode }); }} />
      </div>
      <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 text-center space-y-2">
        <Ticket className="w-10 h-10 mx-auto text-amber-400" />
        <p className="text-sm text-muted-foreground">Vale alimentação, vale refeição ou outro voucher</p>
      </div>
      <Button onClick={() => confirmPayment({ nsu: voucherCode || "VOUCHER" })} disabled={!voucherCode.trim()}
        className="w-full h-13 text-base font-bold bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-lg">
        <Check className="w-5 h-5 mr-2" /> Confirmar Voucher
      </Button>
    </div>
  );

  const renderProcess = () => {
    switch (selected) {
      case "dinheiro": return renderDinheiro();
      case "debito": return renderDebito();
      case "credito": return renderCredito();
      case "pix": return renderPix();
      case "voucher": return renderVoucher();
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            {step === "process" && (
              <button onClick={goBack} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <ChevronLeft className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
            <h2 className="text-lg font-bold text-foreground">
              {step === "select" ? "Forma de Pagamento" : methods.find(m => m.id === selected)?.label}
            </h2>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <AnimatePresence mode="wait">
            {step === "select" ? (
              <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-3">
                <div className="text-center mb-4">
                  <p className="text-3xl font-black text-primary font-mono">{fmt(total)}</p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {methods.map(({ id, label, icon: Icon, color, border, bg }) => (
                    <motion.button
                      key={id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleSelect(id)}
                      className={`flex items-center gap-4 p-4 rounded-xl ${bg} ${border} border transition-all hover:shadow-md`}
                    >
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <span className="text-sm font-bold text-foreground">{label}</span>
                    </motion.button>
                  ))}
                </div>
                {onPrazoRequested && (
                  <button onClick={onPrazoRequested}
                    className="w-full flex items-center gap-4 p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 transition-all hover:shadow-md mt-1">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-600 to-orange-700 flex items-center justify-center shadow-md">
                      <ClockIcon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-sm font-bold text-foreground">Venda a Prazo (Fiado)</span>
                  </button>
                )}
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
