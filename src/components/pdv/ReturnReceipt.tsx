import { useCallback } from "react";
import { Printer } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface ReturnReceiptProps {
  saleId: string;
  saleDate: string;
  originalTotal: number;
  refundAmount: number;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
  }>;
  companyName?: string;
  companyCnpj?: string;
  operatorName?: string;
  onClose: () => void;
}

export function ReturnReceipt({
  saleId,
  saleDate,
  originalTotal,
  refundAmount,
  items,
  companyName,
  companyCnpj,
  operatorName,
  onClose,
}: ReturnReceiptProps) {
  const handlePrint = useCallback(() => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR");
    const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const itemsHtml = items
      .map(
        (i) =>
          `<div class="row"><span>${i.product_name}</span></div>
           <div class="row detail"><span>${i.quantity} x ${formatCurrency(i.unit_price)}</span><span>${formatCurrency(i.quantity * i.unit_price)}</span></div>`
      )
      .join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comprovante de Devolução</title>
<style>
  @page { margin: 0; size: 80mm auto; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { width: 80mm; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; max-width: 80mm; margin: 0; padding: 2mm 3mm; color: #000; line-height: 1.4; overflow-x: hidden; word-wrap: break-word; overflow-wrap: break-word; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; line-height: 1.6; gap: 4px; overflow: hidden; }
  .row span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
  .row span:last-child { text-align: right; white-space: nowrap; flex-shrink: 0; }
  .detail { font-size: 11px; color: #333; padding-left: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title { font-size: 14px; font-weight: bold; text-align: center; margin: 8px 0; letter-spacing: 1px; }
  .big { font-size: 16px; font-weight: bold; text-align: center; margin: 4px 0; }
  .small { font-size: 10px; color: #555; }
  @media print { html, body { width: 80mm; height: auto; margin: 0; padding: 2mm 3mm; } }
</style></head><body>
  ${companyName ? `<div class="center bold">${companyName}</div>` : ""}
  ${companyCnpj ? `<div class="center small">CNPJ: ${companyCnpj}</div>` : ""}
  <div class="title">⟳ COMPROVANTE DE DEVOLUÇÃO</div>
  <div class="sep"></div>
  <div class="row"><span>Venda Original:</span><span>#${saleId.substring(0, 8).toUpperCase()}</span></div>
  <div class="row"><span>Data da Venda:</span><span>${new Date(saleDate).toLocaleDateString("pt-BR")}</span></div>
  <div class="row"><span>Data Devolução:</span><span>${dateStr} ${timeStr}</span></div>
  ${operatorName ? `<div class="row"><span>Operador:</span><span>${operatorName}</span></div>` : ""}
  <div class="sep"></div>
  <div class="center bold" style="margin:4px 0">ITENS DEVOLVIDOS</div>
  ${itemsHtml}
  <div class="sep"></div>
  <div class="row"><span>Total Original:</span><span>${formatCurrency(originalTotal)}</span></div>
  <div class="big">ESTORNO: ${formatCurrency(refundAmount)}</div>
  <div class="sep"></div>
  <div class="center small" style="margin-top:8px">Documento não fiscal - Controle interno</div>
  <div class="center small">Emitido em ${dateStr} às ${timeStr}</div>
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
</body></html>`;

    const printWindow = window.open("", "_blank", "width=350,height=600");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    } else {
      toast.error("Pop-up bloqueado. Permita pop-ups para imprimir.");
    }
  }, [items, saleId, saleDate, originalTotal, refundAmount, companyName, companyCnpj, operatorName]);

  return (
    <button
      onClick={handlePrint}
      className="px-4 py-2 rounded-xl bg-muted text-foreground font-semibold text-sm flex items-center gap-2 hover:bg-muted/80 transition-colors"
    >
      <Printer className="w-4 h-4" />
      Imprimir
    </button>
  );
}
