import { Printer, X, Check } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export interface FiadoReceiptData {
  clientName: string;
  clientDoc?: string;
  total: number;
  items: { name: string; quantity: number; price: number }[];
  mode: "fiado" | "parcelado" | "sinal";
  installments: number;
  saleNumber?: number;
  storeName?: string;
  storeCnpj?: string;
  storePhone?: string;
  storeAddress?: string;
  downPayment?: number;
}

interface Props {
  data: FiadoReceiptData;
  onClose: () => void;
}

export function PDVFiadoReceipt({ data, onClose }: Props) {
  const now = new Date();
  const isSignal = data.mode === "sinal" && data.downPayment && data.downPayment > 0;
  const remaining = isSignal ? data.total - data.downPayment! : data.total;
  const installmentValue = data.installments > 1 ? remaining / data.installments : remaining;

  const modeLabel = () => {
    if (isSignal) {
      const base = `Sinal: ${formatCurrency(data.downPayment!)} | Saldo: ${formatCurrency(remaining)}`;
      return data.installments > 1 ? `${base} (${data.installments}x de ${formatCurrency(installmentValue)})` : `${base} (na entrega)`;
    }
    return data.mode === "parcelado" ? `Parcelado ${data.installments}x de ${formatCurrency(installmentValue)}` : "Fiado (pagamento único)";
  };

  const buildHtml = () => `
<html><head><title>Comprovante Fiado</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  body { font-family: 'Courier New', monospace; font-size: 11px; width: 280px; margin: 0 auto; padding: 16px 8px; color: #000; background: #fff; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .line { margin: 3px 0; }
  .big { font-size: 14px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .right { text-align: right; }
  .sig-area { margin-top: 24px; }
  .sig-line { border-top: 1px solid #000; margin-top: 40px; padding-top: 4px; text-align: center; font-size: 10px; }
  .cpf-line { margin-top: 12px; }
  .cpf-field { border-bottom: 1px solid #000; display: inline-block; width: 180px; height: 16px; margin-left: 4px; }
  @media print { body { margin: 0; } @page { margin: 0; } }
</style></head><body>
  <div class="center bold big">COMPROVANTE DE VENDA A PRAZO</div>
  ${data.storeName ? `<div class="center line">${data.storeName}</div>` : ""}
  ${data.storeCnpj ? `<div class="center line">CNPJ: ${data.storeCnpj}</div>` : ""}
  <div class="center line" style="font-size:10px;">DOCUMENTO NÃO FISCAL</div>
  <div class="sep"></div>
  <div class="center line">${now.toLocaleString("pt-BR")}</div>
  ${data.saleNumber ? `<div class="center line">Venda #${data.saleNumber}</div>` : ""}
  <div class="sep"></div>
  <div class="bold line">Cliente: ${data.clientName}</div>
  ${data.clientDoc ? `<div class="line">CPF/CNPJ: ${data.clientDoc}</div>` : ""}
  <div class="sep"></div>
  <div class="bold line">ITENS:</div>
  <table>
    ${data.items.map(i => `<tr><td>${i.quantity}x ${i.name}</td><td class="right">${formatCurrency(i.price * i.quantity)}</td></tr>`).join("")}
  </table>
  <div class="sep"></div>
  <div class="big center">TOTAL: ${formatCurrency(data.total)}</div>
  <div class="center line">Modalidade: ${modeLabel()}</div>
  <div class="sep"></div>
  <div class="sig-area">
    <div class="sig-line">Assinatura do Cliente</div>
    <div class="cpf-line">CPF: <span class="cpf-field"></span></div>
  </div>
  <div class="sep" style="margin-top:20px;"></div>
  <div class="center bold" style="font-size:10px;margin-top:4px;">1ª VIA - ESTABELECIMENTO</div>

  <div style="margin-top:24px; border-top:2px dashed #000; padding-top:4px;">
    <div class="center" style="font-size:9px;">✂ Corte aqui</div>
  </div>

  <div class="center bold big" style="margin-top:16px;">COMPROVANTE DE VENDA A PRAZO</div>
  ${data.storeName ? `<div class="center line">${data.storeName}</div>` : ""}
  ${data.storeCnpj ? `<div class="center line">CNPJ: ${data.storeCnpj}</div>` : ""}
  <div class="center line" style="font-size:10px;">DOCUMENTO NÃO FISCAL</div>
  <div class="sep"></div>
  <div class="center line">${now.toLocaleString("pt-BR")}</div>
  ${data.saleNumber ? `<div class="center line">Venda #${data.saleNumber}</div>` : ""}
  <div class="sep"></div>
  <div class="bold line">Cliente: ${data.clientName}</div>
  ${data.clientDoc ? `<div class="line">CPF/CNPJ: ${data.clientDoc}</div>` : ""}
  <div class="sep"></div>
  <div class="bold line">ITENS:</div>
  <table>
    ${data.items.map(i => `<tr><td>${i.quantity}x ${i.name}</td><td class="right">${formatCurrency(i.price * i.quantity)}</td></tr>`).join("")}
  </table>
  <div class="sep"></div>
  <div class="big center">TOTAL: ${formatCurrency(data.total)}</div>
  <div class="center line">Modalidade: ${modeLabel()}</div>
  <div class="sep"></div>
  <div class="center bold" style="font-size:10px;margin-top:8px;">2ª VIA - CLIENTE</div>
  <div class="center" style="font-size:9px;margin-top:4px;">Guarde este comprovante para controle</div>
</body></html>`;

  const handlePrint = () => {
    try {
      const w = window.open("", "_blank", "width=350,height=600");
      if (w) {
        w.document.write(buildHtml());
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 200);
      } else {
        toast.error("Não foi possível abrir a janela de impressão.");
      }
    } catch {
      toast.error("Erro ao imprimir comprovante.");
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex flex-col items-center pt-8 pb-4 px-6">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
            <Check className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Venda a Prazo Registrada!</h3>
          <p className="text-sm text-muted-foreground mt-1">{data.clientName}</p>
        </div>

        {/* Details */}
        <div className="px-6 py-4 border-t border-border space-y-3">
           <div className="flex justify-between items-center">
             <span className="text-sm text-muted-foreground">Total</span>
             <span className="text-lg font-bold font-mono text-primary">{formatCurrency(data.total)}</span>
           </div>
           {isSignal && (
             <>
               <div className="flex justify-between text-sm">
                 <span className="text-muted-foreground">Sinal (entrada)</span>
                 <span className="font-bold font-mono text-emerald-500">{formatCurrency(data.downPayment!)}</span>
               </div>
               <div className="flex justify-between text-sm">
                 <span className="text-muted-foreground">Saldo restante</span>
                 <span className="font-bold font-mono text-foreground">{formatCurrency(remaining)}</span>
               </div>
             </>
           )}
           <div className="flex justify-between text-sm">
             <span className="text-muted-foreground">Modalidade</span>
             <span className="font-medium text-foreground">
               {isSignal
                 ? data.installments > 1
                   ? `Sinal + ${data.installments}x de ${formatCurrency(installmentValue)}`
                   : "Sinal + saldo na entrega"
                 : data.mode === "parcelado"
                 ? `${data.installments}x de ${formatCurrency(installmentValue)}`
                 : "Fiado"}
             </span>
           </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Data/Hora</span>
            <span className="font-mono text-foreground text-xs">{now.toLocaleString("pt-BR")}</span>
          </div>

          {/* Signature preview */}
          <div className="mt-4 p-3 rounded-xl bg-muted/50 border border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 text-center">
              O comprovante impresso inclui
            </p>
            <div className="flex items-center gap-3 justify-center text-xs text-foreground">
              <span className="flex items-center gap-1">✍️ Assinatura</span>
              <span className="text-muted-foreground">•</span>
              <span className="flex items-center gap-1">📋 CPF</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-4 border-t border-border">
          <button onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-muted text-muted-foreground text-sm font-medium hover:bg-accent transition-all">
            <X className="w-4 h-4" />Fechar
          </button>
          <button onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all">
            <Printer className="w-4 h-4" />Imprimir
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
