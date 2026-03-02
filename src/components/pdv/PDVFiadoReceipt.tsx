import { Printer, X } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface FiadoItem {
  name: string;
  quantity: number;
  unit_price: number;
}

export interface FiadoReceiptData {
  clientName: string;
  clientCpf?: string;
  items: FiadoItem[];
  total: number;
  storeName?: string;
  storeCnpj?: string;
  saleNumber?: number;
}

interface PDVFiadoReceiptProps {
  data: FiadoReceiptData;
  onClose: () => void;
}

export function PDVFiadoReceipt({ data, onClose }: PDVFiadoReceiptProps) {
  const now = new Date();

  const handlePrint = () => {
    try {
      const itemsHtml = data.items
        .map(
          (item) =>
            `<div class="line" style="display:flex;justify-content:space-between;">
              <span>${item.quantity}x ${item.name}</span>
              <span>${formatCurrency(item.quantity * item.unit_price)}</span>
            </div>`
        )
        .join("");

      const receiptContent = `<html><head><title>Cupom Fiado</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          @media print { body { margin: 0; } }
          body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 16px; color: #000; background: #fff; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .separator { border-top: 1px dashed #000; margin: 8px 0; }
          .line { margin: 3px 0; font-size: 11px; }
          .total { font-size: 15px; font-weight: bold; margin: 8px 0; }
          .signature-area { margin-top: 40px; text-align: center; }
          .signature-line { border-top: 1px solid #000; width: 80%; margin: 0 auto 4px; }
        </style></head><body>
        <div class="center bold" style="font-size:14px;">CUPOM DE VENDA FIADO</div>
        ${data.storeName ? `<div class="center line">${data.storeName}</div>` : ""}
        ${data.storeCnpj ? `<div class="center line">CNPJ: ${data.storeCnpj}</div>` : ""}
        <div class="separator"></div>
        <div class="center line">${now.toLocaleString("pt-BR")}</div>
        ${data.saleNumber ? `<div class="center line">Venda #${data.saleNumber}</div>` : ""}
        <div class="separator"></div>
        <div class="bold line">Cliente: ${data.clientName}</div>
        ${data.clientCpf ? `<div class="line">CPF/CNPJ: ${data.clientCpf}</div>` : '<div class="line" style="color:#666;">CPF/CNPJ: ______________________________</div>'}
        <div class="separator"></div>
        <div class="bold line" style="margin-bottom:4px;">ITENS:</div>
        ${itemsHtml}
        <div class="separator"></div>
        <div class="total center">TOTAL: ${formatCurrency(data.total)}</div>
        <div class="separator"></div>
        <div class="center line" style="font-size:10px;margin-top:8px;">
          Declaro que recebi os produtos acima<br/>
          e me comprometo a efetuar o pagamento<br/>
          na data combinada.
        </div>
        <div class="signature-area">
          <div class="signature-line"></div>
          <div class="line">Assinatura do Cliente</div>
          <div class="line" style="font-size:10px;color:#666;">${data.clientName}</div>
        </div>
        <div class="separator" style="margin-top:20px;"></div>
        <div class="center line" style="font-size:9px;color:#666;">
          Este cupom não possui valor fiscal.<br/>
          Documento para controle financeiro interno.
        </div>
      </body></html>`;

      const printWindow = window.open("", "_blank", "width=350,height=600");
      if (printWindow) {
        printWindow.document.write(receiptContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 200);
      } else {
        toast.error("Não foi possível abrir a janela de impressão.");
      }
    } catch {
      toast.error("Erro ao imprimir cupom.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex flex-col items-center pt-6 pb-3 px-6">
          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mb-3">
            <span className="text-2xl">📝</span>
          </div>
          <h3 className="text-lg font-bold text-foreground">Venda Fiado Registrada!</h3>
          <p className="text-sm text-muted-foreground mt-1">{data.clientName}</p>
        </div>

        {/* Items */}
        <div className="px-6 py-3 border-t border-border overflow-y-auto flex-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Itens
          </p>
          <div className="space-y-1.5">
            {data.items.map((item, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-foreground truncate mr-2">
                  {item.quantity}x {item.name}
                </span>
                <span className="font-mono text-foreground flex-shrink-0">
                  {formatCurrency(item.quantity * item.unit_price)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center mt-3 pt-3 border-t border-border">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="text-lg font-bold font-mono text-primary">
              {formatCurrency(data.total)}
            </span>
          </div>

          {/* Client info */}
          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Cliente</span>
              <span className="font-medium text-foreground">{data.clientName}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">CPF/CNPJ</span>
              <span className="font-mono text-foreground">
                {data.clientCpf || "Não informado"}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Data/Hora</span>
              <span className="font-mono text-foreground">{now.toLocaleString("pt-BR")}</span>
            </div>
          </div>

          {/* Signature note */}
          <div className="mt-3 p-2.5 rounded-lg bg-muted/50 border border-border">
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              O cupom impresso incluirá campo para <span className="font-semibold">assinatura do cliente</span> e declaração de compromisso de pagamento.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-muted text-muted-foreground text-sm font-medium hover:bg-accent transition-all"
          >
            <X className="w-4 h-4" />
            Fechar
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
          >
            <Printer className="w-4 h-4" />
            Imprimir Cupom
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
