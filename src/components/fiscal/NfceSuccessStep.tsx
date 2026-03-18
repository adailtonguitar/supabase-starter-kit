import { CheckCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { formatCurrency } from "@/lib/utils";

interface NfceItem {
  name: string;
  ncm: string;
  cfop: string;
  cst: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discount: number;
  total: number;
  pisCst: string;
  cofinsCst: string;
  icmsAliquota: number;
}

interface PaymentOption {
  value: string;
  label: string;
}

interface NfceSuccessStepProps {
  saleId?: string;
  items: NfceItem[];
  paymentValue: number;
  paymentMethod: string;
  change: number;
  customerName: string;
  customerDoc: string;
  paymentOptions: PaymentOption[];
  onClose: () => void;
}

export function NfceSuccessStep({
  saleId,
  items,
  paymentValue,
  paymentMethod,
  change,
  customerName,
  customerDoc,
  paymentOptions,
  onClose,
}: NfceSuccessStepProps) {
  const handlePrint = () => {
    const cupom = document.getElementById("nfce-cupom");
    if (!cupom) return;
    const win = window.open("", "_blank", "width=320,height=600");
    if (!win) return;
    win.document.write(`
      <html><head><title>Cupom NFC-e</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        @media print { @page { size: 80mm auto; margin: 0; } html, body { width: 80mm !important; padding: 2mm !important; } .print-tip { display: none; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.4; padding: 8px; max-width: 302px; margin: 0 auto; color: #000; background: #fff !important; color-scheme: light; }
        .cupom-header { text-align: center; border-bottom: 1px dashed #999; padding-bottom: 8px; margin-bottom: 8px; }
        .cupom-header .title { font-weight: bold; font-size: 12px; }
        .cupom-header .subtitle { font-size: 10px; }
        .cupom-header .venda { font-size: 9px; color: #666; margin-top: 4px; }
        .cupom-section { border-bottom: 1px dashed #999; padding-bottom: 8px; margin-bottom: 8px; }
        .cupom-section .label { font-weight: bold; margin-bottom: 4px; }
        .item-row { display: flex; justify-content: space-between; gap: 4px; }
        .item-row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .item-row .value { white-space: nowrap; }
        .item-meta { display: flex; justify-content: space-between; font-size: 10px; color: #666; margin-top: 2px; }
        .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; }
        .pay-row { display: flex; justify-content: space-between; }
        .qr-section { text-align: center; border-bottom: 1px dashed #999; padding-bottom: 8px; margin-bottom: 8px; }
        .qr-section svg { margin: 0 auto; }
        .qr-section .qr-label { font-size: 9px; color: #666; margin-top: 4px; }
        .footer { text-align: center; font-size: 9px; color: #666; padding-top: 4px; }
        .cut-line { border-top: 1px dashed #000; margin-top: 8px; padding-top: 4px; text-align: center; font-size: 8px; color: #999; }
      </style></head><body>
      <div class="cupom-header">
        <div class="title">CUPOM FISCAL ELETRÔNICO</div>
        <div class="subtitle">NFC-e - Documento Auxiliar</div>
        ${saleId ? `<div class="venda">Venda: ${saleId.substring(0, 8).toUpperCase()}</div>` : ""}
      </div>
      <div class="cupom-section">
        <div class="label">ITENS</div>
        ${items.map((item, i) => `
          <div class="item-row">
            <span class="name">${i + 1}. ${item.name}</span>
            <span class="value">R$ ${item.total.toFixed(2)}</span>
          </div>
        `).join("")}
        <div class="item-meta">
          <span>${items.length} item(ns)</span>
          <span>Qtd: ${items.reduce((s, it) => s + it.qty, 0)}</span>
        </div>
      </div>
      <div class="cupom-section">
        <div class="total-row"><span>TOTAL</span><span>R$ ${paymentValue.toFixed(2)}</span></div>
        <div class="pay-row"><span>Pagamento</span><span>${paymentOptions.find(p => p.value === paymentMethod)?.label || paymentMethod}</span></div>
        ${change > 0 ? `<div class="pay-row"><span>Troco</span><span>R$ ${change.toFixed(2)}</span></div>` : ""}
      </div>
      ${customerName ? `
        <div class="cupom-section">
          <div><strong>Cliente:</strong> ${customerName}</div>
          ${customerDoc ? `<div><strong>CPF/CNPJ:</strong> ${customerDoc}</div>` : ""}
        </div>
      ` : ""}
      <div class="qr-section">
        ${document.getElementById("nfce-cupom")?.querySelector("svg")?.outerHTML || ""}
        <div class="qr-label">Consulte pelo QR Code</div>
      </div>
      <div class="footer">
        <div>Ambiente: Homologação - Sem valor fiscal</div>
        <div>${new Date().toLocaleString("pt-BR")}</div>
      </div>
      <div class="cut-line">✂ --------------------------------- ✂</div>
      <div class="print-tip" style="text-align:center;font-size:9px;color:#aaa;margin-top:12px;border-top:1px solid #eee;padding-top:8px;">
        💡 Dica: No diálogo de impressão, selecione a impressora térmica<br>
        e escolha o tamanho de papel "80mm" ou "Personalizado (80x297mm)"
      </div>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };

  return (
    <div className="p-4 flex flex-col items-center overflow-y-auto">
      <CheckCircle className="w-10 h-10 text-success mb-2" />
      <h3 className="text-base font-semibold text-foreground">NFC-e Emitida!</h3>
      <p className="text-xs text-muted-foreground mt-1 mb-4">Documento fiscal emitido com sucesso.</p>

      {/* Mini DANFE NFC-e */}
      <div id="nfce-cupom" className="w-full max-w-xs bg-white text-black rounded border border-gray-300 p-3 text-[11px] font-mono leading-tight space-y-2">
        <div className="text-center border-b border-dashed border-gray-400 pb-2">
          <p className="font-bold text-xs">CUPOM FISCAL ELETRÔNICO</p>
          <p className="text-[10px]">NFC-e - Documento Auxiliar</p>
          {saleId && <p className="text-[9px] text-gray-500 mt-1">Venda: {saleId.substring(0, 8).toUpperCase()}</p>}
        </div>

        <div className="border-b border-dashed border-gray-400 pb-2">
          <p className="font-bold mb-1">ITENS</p>
          {items.map((item, i) => (
            <div key={i} className="flex justify-between gap-1">
              <span className="truncate flex-1">{i + 1}. {item.name}</span>
              <span className="whitespace-nowrap">{formatCurrency(item.total)}</span>
            </div>
          ))}
          {items.length > 0 && (
            <div className="flex justify-between gap-1 text-[10px] text-gray-500 mt-0.5">
              <span>{items.length} item(ns)</span>
              <span>Qtd: {items.reduce((s, it) => s + it.qty, 0)}</span>
            </div>
          )}
        </div>

        <div className="border-b border-dashed border-gray-400 pb-2 space-y-0.5">
          <div className="flex justify-between font-bold text-xs">
            <span>TOTAL</span>
            <span>{formatCurrency(paymentValue)}</span>
          </div>
          <div className="flex justify-between">
            <span>Pagamento</span>
            <span>{paymentOptions.find(p => p.value === paymentMethod)?.label || paymentMethod}</span>
          </div>
          {change > 0 && (
            <div className="flex justify-between">
              <span>Troco</span>
              <span>{formatCurrency(change)}</span>
            </div>
          )}
        </div>

        {customerName && (
          <div className="border-b border-dashed border-gray-400 pb-2">
            <p><span className="font-bold">Cliente:</span> {customerName}</p>
            {customerDoc && <p><span className="font-bold">CPF/CNPJ:</span> {customerDoc}</p>}
          </div>
        )}

        <div className="flex flex-col items-center border-b border-dashed border-gray-400 pb-2">
          <QRCodeSVG
            value={`https://www.nfce.fazenda.sp.gov.br/consulta?chave=${saleId || "SIMULACAO"}`}
            size={100}
            level="M"
          />
          <p className="text-[9px] text-gray-500 mt-1">Consulte pelo QR Code</p>
        </div>

        <div className="text-center text-[9px] text-gray-500 pt-1">
          <p>Ambiente: Homologação - Sem valor fiscal</p>
          <p className="mt-0.5">{new Date().toLocaleString("pt-BR")}</p>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={handlePrint}
          className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          🖨️ Imprimir
        </button>
        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all">
          Fechar
        </button>
      </div>
    </div>
  );
}
