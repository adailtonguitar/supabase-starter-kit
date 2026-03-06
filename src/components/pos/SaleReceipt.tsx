import { AlertTriangle, Printer, FileText, Receipt } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

interface SaleReceiptProps {
  items: any[];
  total: number;
  payments: any[];
  saleId?: string;
  nfceNumber?: string;
  accessKey?: string;
  serie?: string;
  slogan?: string;
  logoUrl?: string;
  companyName?: string;
  companyCnpj?: string;
  companyIe?: string;
  companyPhone?: string;
  companyAddress?: string;
  isContingency?: boolean;
  customerCpf?: string;
  protocolNumber?: string;
  protocolDate?: string;
  onClose: () => void;
}

export function SaleReceipt({ items, total, payments, onClose, saleId, companyName, companyCnpj, companyIe, companyPhone, companyAddress, nfceNumber, accessKey, serie, isContingency, logoUrl }: SaleReceiptProps) {
  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const methodLabel = (m: string) => {
    const map: Record<string, string> = { dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito", pix: "PIX", voucher: "Voucher", prazo: "A Prazo", multi: "Múltiplas" };
    return map[m] || m;
  };

  const changeAmount = payments?.find(p => p.changeAmount > 0)?.changeAmount || 0;

  const handlePrint = useCallback(() => {
    const itemsHtml = (items || []).map((item: any) =>
      `<div class="row"><span>${item.quantity || 1}x ${item.name}</span><span>${formatCurrency((item.quantity || 1) * item.price)}</span></div>${item.notes ? `<div class="obs">  📝 ${item.notes}</div>` : ""}`
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
            @media print {
              html, body { width: 80mm; height: auto; margin: 0; padding: 0; }
              body { page-break-after: avoid; }
              title { display: none; }
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            html { width: 80mm; }
            body { font-family: 'Courier New', monospace; font-size: 11px; width: 80mm; max-width: 80mm; margin: 0; padding: 3mm 4mm; line-height: 1.4; color: #000; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .dashed { border-top: 1px dashed #000; margin: 3px 0; }
            .row { display: flex; justify-content: space-between; gap: 4px; }
            .row span:last-child { text-align: right; white-space: nowrap; }
            .total-row { font-size: 14px; font-weight: bold; margin: 4px 0; }
            .sm { font-size: 9px; }
            .obs { font-size: 9px; font-style: italic; padding-left: 8px; color: #555; }
            h2 { font-size: 13px; margin: 2px 0; }
            .cut { margin-top: 6px; text-align: center; font-size: 9px; letter-spacing: 2px; }
            .logo { max-height: 40px; max-width: 60mm; object-fit: contain; margin: 0 auto 4px; display: block; }
          </style>
        </head>
        <body>
          <div class="center">
            ${logoUrl ? `<img src="${logoUrl}" class="logo" alt="Logo" />` : ""}
            <h2>${companyName || "CUPOM DE VENDA"}</h2>
            ${companyCnpj ? `<p class="sm">CNPJ: ${companyCnpj}</p>` : ""}
            ${companyIe ? `<p class="sm">IE: ${companyIe}</p>` : ""}
            ${companyAddress ? `<p class="sm">${companyAddress}</p>` : ""}
            ${companyPhone ? `<p class="sm">Fone: ${companyPhone}</p>` : ""}
            <p class="sm">${now}</p>
            ${saleId ? `<p class="bold" style="margin-top:3px; font-size:12px;">Venda #${saleId.substring(0, 8).toUpperCase()}</p>` : ""}
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
          <p class="cut">--------------------------------</p>
          <script>
            window.onload = function() {
              // Pequeno delay para renderizar antes de imprimir
              setTimeout(function() { window.print(); window.close(); }, 200);
            }
          <\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }, [items, total, payments, changeAmount, companyName, companyCnpj, companyIe, companyPhone, companyAddress, nfceNumber, logoUrl, saleId]);

  const handlePrintFiscal = useCallback(() => {
    if (!nfceNumber) {
      toast.info("NFC-e não disponível para esta venda.", { duration: 3000 });
      return;
    }

    const itemsHtml = (items || []).map((item: any, idx: number) =>
      `<div class="row"><span>${String(idx + 1).padStart(3, '0')} ${(item.quantity || 1)}x ${item.name}</span><span>${formatCurrency((item.quantity || 1) * item.price)}</span></div>`
    ).join("");

    const paymentsHtml = (payments || []).map((p: any) =>
      `<div class="row"><span>${methodLabel(p.method)}</span><span>${formatCurrency(p.amount)}</span></div>`
    ).join("");

    const changeHtml = changeAmount > 0 ? `<div class="row bold"><span>Troco</span><span>${formatCurrency(changeAmount)}</span></div>` : "";
    const now = new Date().toLocaleString("pt-BR");
    const qtyTotal = (items || []).reduce((s: number, i: any) => s + (i.quantity || 1), 0);

    const formattedKey = accessKey ? accessKey.replace(/(\d{4})(?=\d)/g, "$1 ") : "";
    const isSimulation = nfceNumber.startsWith("SIM-");

    const printWindow = window.open("", "_blank", "width=320,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Cupom Fiscal NFC-e</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            @media print {
              html, body { width: 80mm; height: auto; margin: 0; padding: 0; }
              body { page-break-after: avoid; }
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            html { width: 80mm; }
            body { font-family: 'Courier New', monospace; font-size: 11px; width: 80mm; max-width: 80mm; margin: 0; padding: 3mm 4mm; line-height: 1.4; color: #000; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .dashed { border-top: 1px dashed #000; margin: 3px 0; }
            .row { display: flex; justify-content: space-between; gap: 4px; }
            .row span:last-child { text-align: right; white-space: nowrap; }
            .total-row { font-size: 14px; font-weight: bold; margin: 4px 0; }
            .sm { font-size: 9px; }
            .obs { font-size: 9px; font-style: italic; padding-left: 8px; color: #555; }
            .xs { font-size: 7px; }
            h2 { font-size: 13px; margin: 2px 0; }
            .cut { margin-top: 6px; text-align: center; font-size: 9px; letter-spacing: 2px; }
            .logo { max-height: 40px; max-width: 60mm; object-fit: contain; margin: 0 auto 4px; display: block; }
            .fiscal-header { background: #000; color: #fff; padding: 2px 4px; font-size: 10px; font-weight: bold; text-align: center; margin: 3px 0; }
            .key-box { border: 1px solid #000; padding: 3px; margin: 3px 0; font-family: monospace; font-size: 7px; word-break: break-all; text-align: center; line-height: 1.5; }
            .sim-badge { border: 2px dashed #000; padding: 3px; text-align: center; font-size: 9px; font-weight: bold; margin: 3px 0; }
            .qr-container { text-align: center; margin: 6px 0; }
            .qr-container canvas, .qr-container img { margin: 0 auto; }
            #qrcode { display: inline-block; }
          </style>
        </head>
        <body>
          <div class="center">
            ${logoUrl ? `<img src="${logoUrl}" class="logo" alt="Logo" />` : ""}
            <h2>${companyName || "CUPOM FISCAL ELETRÔNICO"}</h2>
            ${companyCnpj ? `<p class="sm">CNPJ: ${companyCnpj}</p>` : ""}
            ${companyIe ? `<p class="sm">IE: ${companyIe}</p>` : ""}
            ${companyAddress ? `<p class="sm">${companyAddress}</p>` : ""}
            ${companyPhone ? `<p class="sm">Fone: ${companyPhone}</p>` : ""}
          </div>
          ${saleId ? `<p class="center bold" style="margin-top:3px; font-size:11px;">Venda #${saleId.substring(0, 8).toUpperCase()}</p>` : ""}
          <div class="fiscal-header">DANFE NFC-e - DOCUMENTO AUXILIAR</div>
          <div class="fiscal-header" style="font-size:8px; background:#333;">DA NOTA FISCAL DE CONSUMIDOR ELETRÔNICA</div>
          ${isSimulation ? `<div class="sim-badge">*** SIMULAÇÃO - SEM VALOR FISCAL ***</div>` : ""}
          <div class="dashed"></div>
          <div class="row bold"><span>#  QTD DESCRIÇÃO</span><span>VALOR</span></div>
          <div class="dashed"></div>
          ${itemsHtml}
          <div class="dashed"></div>
          <div class="row total-row"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>
          <div class="dashed"></div>
          <p class="center bold sm">FORMA DE PAGAMENTO</p>
          ${paymentsHtml}
          ${changeHtml}
          <div class="dashed"></div>
          <p class="center sm">Qtd. total de itens: ${qtyTotal}</p>
          <p class="center sm">${now}</p>
          <div class="dashed"></div>
          <p class="center bold sm">NFC-e Nº ${nfceNumber}${serie ? ` | Série ${serie}` : ""}</p>
          ${accessKey ? `
            <p class="center xs" style="margin-top:2px">CHAVE DE ACESSO</p>
            <div class="key-box">${formattedKey}</div>
          ` : ""}
          <div class="qr-container">
            <div id="qrcode"></div>
            <p class="xs" style="margin-top:2px">Consulte pela chave de acesso em</p>
            <p class="xs">www.nfe.fazenda.gov.br/portal</p>
          </div>
          <div class="dashed"></div>
          ${isSimulation
            ? `<p class="center bold sm" style="margin-top:4px">EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO</p><p class="center xs">SEM VALOR FISCAL</p>`
            : ""
          }
          <p class="center sm" style="margin-top:4px">Obrigado pela preferência!</p>
          <p class="cut">--------------------------------</p>
          <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
          <script>
            window.onload = function() {
              try {
                var qrUrl = "${accessKey ? `https://www.nfce.fazenda.gov.br/portal/consultarNFCe.aspx?chNFe=${accessKey}` : `https://www.nfe.fazenda.gov.br/portal`}";
                var qr = qrcode(0, 'M');
                qr.addData(qrUrl);
                qr.make();
                document.getElementById('qrcode').innerHTML = qr.createImgTag(3, 0);
              } catch(e) { console.warn('QR generation failed', e); }
              setTimeout(function() { window.print(); window.close(); }, 500);
            }
          <\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }, [items, total, payments, changeAmount, companyName, companyCnpj, companyIe, companyPhone, companyAddress, nfceNumber, accessKey, serie, logoUrl, saleId]);
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
          {saleId && (
            <p className="text-xs font-mono text-muted-foreground mt-2 bg-muted px-3 py-1.5 rounded-lg inline-block">
              Venda <span className="font-bold text-foreground">#{saleId.substring(0, 8).toUpperCase()}</span>
            </p>
          )}
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
        <div className="mt-5 space-y-2">
          {/* Print options */}
          <div className="flex gap-2">
            <button
              onClick={handlePrintFiscal}
              className="flex-1 py-2.5 rounded-xl border-2 border-primary/30 text-primary text-xs font-bold hover:bg-primary/10 transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              Cupom Fiscal
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 py-2.5 rounded-xl border-2 border-border text-foreground text-xs font-bold hover:bg-muted transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              <Receipt className="w-4 h-4" />
              Não Fiscal
            </button>
          </div>
          {/* New sale */}
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold active:scale-95 transition-all">
            Nova Venda (F1)
          </button>
        </div>

      </div>
    </div>
  );
}
