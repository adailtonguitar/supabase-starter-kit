import { AlertTriangle, Printer } from "lucide-react";
import { useCallback } from "react";

interface SaleReceiptProps {
  items: any[];
  total: number;
  payments: any[];
  nfceNumber?: string;
  slogan?: string;
  logoUrl?: string;
  companyName?: string;
  isContingency?: boolean;
  onClose: () => void;
}

export function SaleReceipt({ items, total, payments, onClose, companyName, nfceNumber, isContingency }: SaleReceiptProps) {
  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const methodLabel = (m: string) => {
    const map: Record<string, string> = { dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito", pix: "PIX", voucher: "Voucher", prazo: "A Prazo", multi: "Múltiplas" };
    return map[m] || m;
  };

  const changeAmount = payments?.find(p => p.changeAmount > 0)?.changeAmount || 0;

  const handlePrint = useCallback(() => {
    const itemsHtml = (items || []).map((item: any) =>
      `<div class="row"><span>${item.quantity || 1}x ${item.name}</span><span>${formatCurrency((item.quantity || 1) * item.price)}</span></div>`
    ).join("");

    const paymentsHtml = (payments || []).map((p: any) =>
      `<div class="row"><span>${methodLabel(p.method)}</span><span>${formatCurrency(p.amount)}</span></div>`
    ).join("");

    const changeHtml = changeAmount > 0 ? `<div class="row bold"><span>Troco</span><span>${formatCurrency(changeAmount)}</span></div>` : "";
    const nfceHtml = nfceNumber ? `<p class="center">NFC-e: ${nfceNumber}</p>` : "";

    const now = new Date().toLocaleString("pt-BR");
    const qtyTotal = (items || []).reduce((s: number, i: any) => s + (i.quantity || 1), 0);

    const printWindow = window.open("", "_blank", "width=320,height=600");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Cupom</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Courier New', monospace; font-size: 11px; width: 72mm; max-width: 72mm; margin: 0 auto; padding: 2mm; line-height: 1.4; color: #000; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .dashed { border-top: 1px dashed #000; margin: 3px 0; }
            .row { display: flex; justify-content: space-between; gap: 4px; }
            .row span:last-child { text-align: right; white-space: nowrap; }
            .item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .total-row { font-size: 14px; font-weight: bold; margin: 4px 0; }
            .sm { font-size: 9px; }
            h2 { font-size: 13px; margin: 2px 0; }
          </style>
        </head>
        <body>
          <div class="center">
            <h2>${companyName || "CUPOM DE VENDA"}</h2>
            <p class="sm">${now}</p>
          </div>
          <div class="dashed"></div>
          <div class="row bold"><span>QTD ITEM</span><span>VALOR</span></div>
          <div class="dashed"></div>
          ${itemsHtml}
          <div class="dashed"></div>
          <div class="row total-row"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>
          <div class="dashed"></div>
          ${paymentsHtml}
          ${changeHtml}
          <div class="dashed"></div>
          <p class="center sm">Qtd. total de itens: ${qtyTotal}</p>
          ${nfceHtml}
          <p class="center sm" style="margin-top:4px">Obrigado pela preferência!</p>
          <script>window.onload = function() { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }, [items, total, payments, changeAmount, companyName, nfceNumber]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        {/* Visual receipt */}
        <div className="text-center">
          <div className="text-4xl mb-3">{isContingency ? "⚠️" : "✅"}</div>
          <h2 className="text-xl font-bold text-foreground">
            {isContingency ? "Venda em Contingência" : "Venda Finalizada!"}
          </h2>
          {companyName && <p className="text-sm text-muted-foreground mt-1">{companyName}</p>}
          <p className="text-3xl font-black text-primary font-mono mt-3">{formatCurrency(total)}</p>
        </div>

        {/* Payment details */}
        {payments && payments.length > 0 && (
          <div className="mt-4 space-y-1 text-sm">
            {payments.map((p: any, i: number) => (
              <div key={i} className="flex justify-between text-muted-foreground">
                <span>{methodLabel(p.method)}</span>
                <span className="font-mono">{formatCurrency(p.amount)}</span>
              </div>
            ))}
            {changeAmount > 0 && (
              <div className="flex justify-between text-emerald-500 font-bold">
                <span>Troco</span>
                <span className="font-mono">{formatCurrency(changeAmount)}</span>
              </div>
            )}
          </div>
        )}

        {/* Items summary */}
        {items && items.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1">{items.reduce((s: number, i: any) => s + (i.quantity || 1), 0)} itens</p>
          </div>
        )}

        {nfceNumber && (
          <p className="text-xs font-mono text-muted-foreground mt-2 text-center">
            NFC-e: {nfceNumber}
          </p>
        )}

        {isContingency && (
          <div className="mt-4 p-3 rounded-xl bg-warning/10 border border-warning/30 text-left">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-warning">EMITIDA EM CONTINGÊNCIA</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Esta venda será transmitida automaticamente à SEFAZ quando a conexão for restaurada. 
                  Prazo máximo: 24 horas.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex gap-2">
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 rounded-xl border-2 border-border text-foreground text-sm font-bold hover:bg-muted transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Imprimir Cupom
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold active:scale-95 transition-all">
            Nova Venda (ESC)
          </button>
        </div>

      </div>
    </div>
  );
}
