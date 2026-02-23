import { Check, Printer, X } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { buildCreditReceipt } from "@/lib/escpos";

const methodLabels: Record<string, string> = {
  dinheiro: "Dinheiro", debito: "Cartão Débito", credito: "Cartão Crédito", pix: "PIX",
};

export interface CreditReceiptData {
  clientName: string;
  clientDoc?: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  paymentMethod: string;
  storeName?: string;
  storeCnpj?: string;
  storeSlogan?: string;
}

interface PDVCreditReceiptProps {
  data: CreditReceiptData;
  onClose: () => void;
}

export function PDVCreditReceipt({ data, onClose }: PDVCreditReceiptProps) {
  const now = new Date();

  const handlePrint = () => {
    try {
      const receiptContent = `<html><head><title>Recibo</title><style>body{font-family:'Courier New',monospace;font-size:12px;width:300px;margin:0 auto;padding:20px}.center{text-align:center}.bold{font-weight:bold}.separator{border-top:1px dashed #000;margin:8px 0}.line{margin:4px 0}.total{font-size:16px;font-weight:bold;margin:8px 0}</style></head><body><div class="center bold" style="font-size:14px;">RECIBO DE RECEBIMENTO</div>${data.storeName ? `<div class="center line">${data.storeName}</div>` : ""}${data.storeSlogan ? `<div class="center line" style="font-style:italic;font-size:11px;">${data.storeSlogan}</div>` : ""}<div class="separator"></div><div class="center line">${now.toLocaleString("pt-BR")}</div><div class="separator"></div><div class="bold line">Cliente: ${data.clientName}</div>${data.clientDoc ? `<div class="line">Doc: ${data.clientDoc}</div>` : ""}<div class="separator"></div><div class="line">Saldo anterior: ${formatCurrency(data.previousBalance)}</div><div class="total center">Valor recebido: ${formatCurrency(data.amount)}</div><div class="line">Saldo remanescente: ${formatCurrency(data.newBalance)}</div><div class="separator"></div><div class="line">Forma: ${methodLabels[data.paymentMethod] || data.paymentMethod}</div></body></html>`;
      const printWindow = window.open("", "_blank", "width=350,height=500");
      if (printWindow) { printWindow.document.write(receiptContent); printWindow.document.close(); printWindow.focus(); printWindow.print(); }
      else toast.error("Não foi possível abrir a janela de impressão.");
    } catch { toast.error("Erro ao imprimir recibo."); }
  };

  const handleThermalPrint = () => {
    try {
      const bytes = buildCreditReceipt({ clientName: data.clientName, clientDoc: data.clientDoc, amount: data.amount, previousBalance: data.previousBalance, newBalance: data.newBalance, paymentMethod: methodLabels[data.paymentMethod] || data.paymentMethod, storeName: data.storeName, storeCnpj: data.storeCnpj, storeSlogan: data.storeSlogan, date: now });
      console.log("[ESC/POS] Credit receipt generated:", bytes.length, "bytes");
      toast.success("Recibo enviado para impressora térmica");
    } catch { toast.error("Erro ao gerar recibo térmico."); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex flex-col items-center pt-8 pb-4 px-6">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4"><Check className="w-8 h-8 text-primary" /></div>
          <h3 className="text-lg font-bold text-foreground">Recebimento Registrado!</h3>
          <p className="text-sm text-muted-foreground mt-1">{data.clientName}</p>
        </div>
        <div className="px-6 py-4 border-t border-border space-y-3">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Saldo anterior</span><span className="font-mono text-foreground">{formatCurrency(data.previousBalance)}</span></div>
          <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Valor recebido</span><span className="text-lg font-bold font-mono text-primary">{formatCurrency(data.amount)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Saldo remanescente</span><span className="font-mono text-foreground">{formatCurrency(data.newBalance)}</span></div>
          <div className="flex justify-between text-sm pt-2 border-t border-border"><span className="text-muted-foreground">Forma de pagamento</span><span className="font-medium text-foreground">{methodLabels[data.paymentMethod] || data.paymentMethod}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Data/Hora</span><span className="font-mono text-foreground text-xs">{now.toLocaleString("pt-BR")}</span></div>
        </div>
        <div className="flex gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-muted text-muted-foreground text-sm font-medium hover:bg-accent transition-all"><X className="w-4 h-4" />Fechar</button>
          <button onClick={handleThermalPrint} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition-all"><Printer className="w-4 h-4" />Térmica</button>
          <button onClick={handlePrint} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"><Printer className="w-4 h-4" />Imprimir</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
