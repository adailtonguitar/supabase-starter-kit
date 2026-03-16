import { AlertTriangle, Printer, FileText, Receipt, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Map UF → SEFAZ NFC-e consultation URL
const SEFAZ_NFCE_URLS: Record<string, string> = {
  AC: "https://www.sefaznet.ac.gov.br/nfce",
  AL: "https://nfce.sefaz.al.gov.br",
  AM: "https://sistemas.sefaz.am.gov.br/nfceweb",
  AP: "https://www.sefaz.ap.gov.br/nfce",
  BA: "https://nfe.sefaz.ba.gov.br/servicos/nfce",
  CE: "https://nfce.sefaz.ce.gov.br",
  DF: "https://www.nfce.fazenda.df.gov.br",
  ES: "https://app.sefaz.es.gov.br/ConsultaNFCe",
  GO: "https://nfe.sefaz.go.gov.br/nfeweb/jsp/ConsultaDANFENFCe.jsf",
  MA: "https://www.sefaz.ma.gov.br/nfce",
  MG: "https://nfce.fazenda.mg.gov.br/portalnfce",
  MS: "https://www.dfe.ms.gov.br/nfce",
  MT: "https://www.sefaz.mt.gov.br/nfce/consultanfce",
  PA: "https://app.sefa.pa.gov.br/emissao-nfce",
  PB: "https://www.sefaz.pb.gov.br/nfce",
  PE: "https://nfce.sefaz.pe.gov.br/nfce-web",
  PI: "https://webas.sefaz.pi.gov.br/nfceweb",
  PR: "https://www.fazenda.pr.gov.br/nfce",
  RJ: "https://www.fazenda.rj.gov.br/nfce",
  RN: "https://nfce.set.rn.gov.br",
  RO: "https://www.sefin.ro.gov.br/nfce",
  RR: "https://www.sefaz.rr.gov.br/nfce",
  RS: "https://www.sefaz.rs.gov.br/NFCE",
  SC: "https://sat.sef.sc.gov.br/nfce",
  SE: "https://nfe.sefaz.se.gov.br/nfce",
  SP: "https://www.nfce.fazenda.sp.gov.br",
  TO: "https://www.sefaz.to.gov.br/nfce",
};

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
  companyUf?: string;
  isContingency?: boolean;
  isHomologacao?: boolean;
  customerCpf?: string;
  protocolNumber?: string;
  protocolDate?: string;
  tributosAprox?: number;
  onClose: () => void;
}

export function SaleReceipt({ items, total, payments, onClose, saleId, companyName, companyCnpj, companyIe, companyPhone, companyAddress, companyUf, nfceNumber: initialNfceNumber, accessKey: initialAccessKey, serie: initialSerie, isContingency, logoUrl, slogan, customerCpf, protocolNumber, protocolDate, isHomologacao, tributosAprox }: SaleReceiptProps) {
  const [nfceNumber, setNfceNumber] = useState(initialNfceNumber);
  const [accessKey, setAccessKey] = useState(initialAccessKey);
  const [serie, setSerie] = useState(initialSerie);
  const [fetchingFiscal, setFetchingFiscal] = useState(false);
  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const methodLabel = (m: string) => {
    const map: Record<string, string> = { dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito", pix: "PIX", voucher: "Voucher", prazo: "A Prazo", multi: "Múltiplas" };
    return map[m] || m;
  };

  const changeAmount = payments?.find(p => p.changeAmount > 0)?.changeAmount || 0;

  const handlePrint = useCallback(() => {
    // Filter out DIAG_TEST products
    const printableItems = (items || []).filter((item: any) => {
      const name = (item.name || "").toUpperCase();
      return !name.startsWith("DIAG_TEST") && !item.isTest;
    });

    // Calculate subtotal and total discount for summary
    let subtotal = 0;
    let totalDiscount = 0;
    const discountedItems: any[] = [];

    const itemsHtml = printableItems.map((item: any) => {
      const qty = item.quantity || 1;
      const unitPrice = item.price || 0;
      const totalItem = qty * unitPrice;
      const discount = item.discount || 0;
      subtotal += totalItem;
      totalDiscount += discount;
      if (discount > 0) discountedItems.push(item);

      return `<div class="item-name">${item.name}</div>
              <div class="row item-detail"><span>${qty} x ${formatCurrency(unitPrice)}</span><span>${formatCurrency(totalItem)}</span></div>${item.notes ? `<div class="obs">  📝 ${item.notes}</div>` : ""}`;
    }).join("");

    // Build subtotal/discount/total summary block
    const allHavePromoName = discountedItems.length > 0 && discountedItems.every((i: any) => !!i.promoName);
    const promoGroups: Record<string, number> = {};
    if (allHavePromoName) {
      discountedItems.forEach((i: any) => {
        promoGroups[i.promoName] = (promoGroups[i.promoName] || 0) + (i.discount || 0);
      });
    }

    let summaryHtml = "";
    if (totalDiscount > 0) {
      summaryHtml = `<div class="row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>`;
      if (allHavePromoName) {
        Object.entries(promoGroups).forEach(([name, value]) => {
          summaryHtml += `<div class="row" style="color:#666"><span>🏷️ ${name}</span><span>-${formatCurrency(value)}</span></div>`;
        });
      } else {
        summaryHtml += `<div class="row" style="color:#666"><span>Desconto</span><span>-${formatCurrency(totalDiscount)}</span></div>`;
      }
    }

    const paymentsHtml = (payments || []).map((p: any) =>
      `<div class="row"><span>${methodLabel(p.method)}</span><span>${formatCurrency(p.amount)}</span></div>`
    ).join("");

    const changeHtml = changeAmount > 0 ? `<div class="row bold"><span>Troco</span><span>${formatCurrency(changeAmount)}</span></div>` : "";

    const now = new Date().toLocaleString("pt-BR");
    const qtyTotal = printableItems.reduce((s: number, i: any) => s + (i.quantity || 1), 0);

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
            .item-name { font-size: 10px; font-weight: bold; margin-top: 2px; }
            .item-detail { font-size: 10px; }
            .obs { font-size: 9px; color: #666; }
            h2 { font-size: 13px; margin: 2px 0; }
            .cut { margin-top: 6px; text-align: center; font-size: 9px; letter-spacing: 2px; }
            .logo { max-height: 40px; max-width: 60mm; object-fit: contain; margin: 0 auto 4px; display: block; }
            .no-fiscal { border: 1px dashed #000; padding: 2px; text-align: center; font-size: 9px; font-weight: bold; margin: 3px 0; }
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
          <div class="no-fiscal">*** NÃO É DOCUMENTO FISCAL ***</div>
          <div class="dashed"></div>
          <div class="row bold"><span>DESCRIÇÃO</span><span>VALOR</span></div>
          <div class="row bold sm"><span>QTD x VL UNIT</span><span></span></div>
          <div class="dashed"></div>
          ${itemsHtml}
          <div class="dashed"></div>
          ${summaryHtml}
          <div class="row total-row"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>
          <div class="dashed"></div>
          ${paymentsHtml}
          ${changeHtml}
          <div class="dashed"></div>
          <p class="center sm">Qtd. total de itens: ${qtyTotal}</p>
          ${slogan ? `<p class="center sm" style="margin-top:4px; font-style:italic">${slogan}</p>` : ""}
          <p class="center sm" style="margin-top:4px">Obrigado pela preferência!</p>
          <p class="cut">--------------------------------</p>
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); window.close(); }, 200);
            }
          <\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }, [items, total, payments, changeAmount, companyName, companyCnpj, companyIe, companyPhone, companyAddress, logoUrl, saleId, slogan]);

  const handlePrintFiscal = useCallback(async () => {
    let currentNfceNumber = nfceNumber;
    let currentAccessKey = accessKey;
    let currentSerie = serie;

    // If no NFC-e number yet, try to fetch from DB (may have been processed async)
    if (!currentNfceNumber && saleId) {
      setFetchingFiscal(true);
      try {
        const { data: fiscalDoc } = await supabase
          .from("fiscal_documents")
          .select("number, access_key, serie, status")
          .eq("sale_id", saleId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fiscalDoc && (fiscalDoc as any).number) {
          const doc = fiscalDoc as any;
          const num = String(doc.number);
          const isSimulated = doc.status === "simulado";
          currentNfceNumber = isSimulated ? `SIM-${num}` : num;
          currentAccessKey = doc.access_key || undefined;
          currentSerie = doc.serie || undefined;
          // Update local state so next click works immediately
          setNfceNumber(currentNfceNumber);
          setAccessKey(currentAccessKey);
          setSerie(currentSerie);
          toast.success("NFC-e encontrada!", { duration: 2000 });
        }
      } catch (err) {
        console.warn("[SaleReceipt] Failed to fetch fiscal doc:", err);
      } finally {
        setFetchingFiscal(false);
      }
    }

    if (!currentNfceNumber) {
      toast.info("NFC-e ainda não disponível para esta venda. Aguarde o processamento ou emita manualmente em Vendas.", { duration: 5000 });
      return;
    }

    // Detect simulation/homologação from prefix or prop
    const isSimulation = currentNfceNumber.startsWith("SIM-") || currentNfceNumber.startsWith("TESTE-") || currentNfceNumber.startsWith("DEMO-");
    const isHomolog = isHomologacao ?? isSimulation;

    // Clean number: remove prefixes for display
    const cleanNumber = currentNfceNumber.replace(/^(SIM-|TESTE-|DEMO-|CONT-)/, "");
    const paddedNumber = cleanNumber.replace(/\D/g, "").padStart(9, "0");

    // Calculate subtotal and total discount
    let subtotal = 0;
    let totalDiscount = 0;
    // Filter out DIAG_TEST products from fiscal receipt too
    const printableItems = (items || []).filter((item: any) => {
      const name = (item.name || "").toUpperCase();
      return !name.startsWith("DIAG_TEST") && !item.isTest;
    });

    const itemsHtml = printableItems.map((item: any, idx: number) => {
      const qty = item.quantity || 1;
      const unitPrice = item.price || 0;
      const totalItem = qty * unitPrice;
      const unit = item.unit || "UN";
      const discount = item.discount || 0;
      subtotal += totalItem;
      totalDiscount += discount;
      return `<div class="item-desc">${String(idx + 1).padStart(3, '0')} ${item.name}</div>
              <div class="row item-detail"><span>${qty} ${unit} x ${formatCurrency(unitPrice)}</span><span>${formatCurrency(totalItem)}</span></div>`;
    }).join("");

    const paymentsHtml = (payments || []).map((p: any) =>
      `<div class="row"><span>${methodLabel(p.method)}</span><span>${formatCurrency(p.amount)}</span></div>`
    ).join("");

    const changeHtml = changeAmount > 0 ? `<div class="row bold"><span>Troco</span><span>${formatCurrency(changeAmount)}</span></div>` : "";
    const now = new Date().toLocaleString("pt-BR");
    const qtyTotal = printableItems.reduce((s: number, i: any) => s + (i.quantity || 1), 0);

    const formattedKey = currentAccessKey ? currentAccessKey.replace(/(\d{4})(?=\d)/g, "$1 ") : "";

    const consumerHtml = customerCpf 
      ? `<p class="center sm bold">CPF DO CONSUMIDOR: ${customerCpf}</p>`
      : `<p class="center sm bold">CONSUMIDOR NÃO IDENTIFICADO</p>`;

    const protocolHtml = protocolNumber 
      ? `<p class="center xs" style="margin-top:2px">Protocolo de Autorização: ${protocolNumber}</p>${protocolDate ? `<p class="center xs">${protocolDate}</p>` : ""}`
      : "";

    // Subtotal / Desconto / Total section
    // Check if all discounted items have a promo name (avoid duplicate discount lines)
    const discountedItems = (items || []).filter((i: any) => (i.discount || 0) > 0);
    const allHavePromoName = discountedItems.length > 0 && discountedItems.every((i: any) => !!i.promoName);
    // Group discounts by promo name for summary
    const promoGroups: Record<string, number> = {};
    if (allHavePromoName) {
      discountedItems.forEach((i: any) => {
        promoGroups[i.promoName] = (promoGroups[i.promoName] || 0) + (i.discount || 0);
      });
    }

    let subtotalHtml = "";
    if (totalDiscount > 0) {
      subtotalHtml = `<div class="row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>`;
      if (allHavePromoName) {
        // Show one line per promo name instead of generic "Desconto"
        Object.entries(promoGroups).forEach(([name, value]) => {
          subtotalHtml += `<div class="row" style="color:#666"><span>🏷️ ${name}</span><span>-${formatCurrency(value)}</span></div>`;
        });
      } else {
        // Manual discount without promo name
        subtotalHtml += `<div class="row" style="color:#666"><span>Desconto</span><span>-${formatCurrency(totalDiscount)}</span></div>`;
      }
      subtotalHtml += `<div class="row total-row"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>`;
    } else {
      subtotalHtml = `<div class="row total-row"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>`;
    }

    // SEFAZ consultation URL based on UF
    const uf = companyUf?.toUpperCase() || "";
    const sefazUrl = SEFAZ_NFCE_URLS[uf] || "https://www.nfe.fazenda.gov.br/portal";

    // Tributos aproximados (Lei 12.741/2012)
    const tributos = tributosAprox ?? (total * 0.32);
    const tributosHtml = `<div class="tax-info">
      Tributos aproximados: ${formatCurrency(tributos)} (Lei Federal 12.741/2012)
    </div>`;

    // Homologação message - only in homologação
    const homologHtml = isHomolog
      ? `<p class="center bold sm" style="margin-top:4px">EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO</p><p class="center xs">SEM VALOR FISCAL</p>`
      : "";

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
            .item-desc { font-size: 10px; font-weight: bold; margin-top: 2px; }
            .item-detail { font-size: 10px; }
            .total-row { font-size: 14px; font-weight: bold; margin: 4px 0; }
            .sm { font-size: 9px; }
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
            .tax-info { border: 1px solid #000; padding: 3px; margin: 3px 0; font-size: 8px; text-align: center; }
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
          <div class="fiscal-header">DANFE NFC-e - DOCUMENTO AUXILIAR</div>
          <div class="fiscal-header" style="font-size:8px; background:#333;">DA NOTA FISCAL DE CONSUMIDOR ELETRÔNICA</div>
          ${isSimulation ? `<div class="sim-badge">*** SIMULAÇÃO - SEM VALOR FISCAL ***</div>` : ""}
          <div class="dashed"></div>
          <div class="row bold"><span>DESCRIÇÃO</span><span>VALOR</span></div>
          <div class="row bold sm"><span>QTD UN x VL UNIT</span><span></span></div>
          <div class="dashed"></div>
          ${itemsHtml}
          <div class="dashed"></div>
          ${subtotalHtml}
          <div class="dashed"></div>
          <p class="center bold sm">FORMA DE PAGAMENTO</p>
          ${paymentsHtml}
          ${changeHtml}
          <div class="dashed"></div>
          ${consumerHtml}
          <div class="dashed"></div>
          ${tributosHtml}
          <div class="dashed"></div>
          <p class="center sm">Qtd. total de itens: ${qtyTotal}</p>
          <p class="center sm">${now}</p>
          <div class="dashed"></div>
          <p class="center bold sm">NFC-e nº ${paddedNumber}${currentSerie ? ` | Série ${currentSerie}` : ""}</p>
          ${protocolHtml}
          ${currentAccessKey ? `
            <p class="center xs" style="margin-top:2px">CHAVE DE ACESSO</p>
            <div class="key-box">${formattedKey}</div>
          ` : ""}
          <div class="qr-container">
            <div id="qrcode"></div>
            <p class="xs" style="margin-top:2px">Consulte pela chave de acesso em</p>
            <p class="xs bold">${sefazUrl}</p>
          </div>
          <div class="dashed"></div>
          ${homologHtml}
          ${saleId ? `<p class="center xs" style="margin-top:2px">Ref. Interna: #${saleId.substring(0, 8).toUpperCase()}</p>` : ""}
          <p class="center sm" style="margin-top:4px">Obrigado pela preferência!</p>
          <p class="cut">--------------------------------</p>
          <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
          <script>
            window.onload = function() {
              try {
                var qrUrl = "${currentAccessKey ? `https://www.nfce.fazenda.gov.br/portal/consultarNFCe.aspx?chNFe=${currentAccessKey}` : sefazUrl}";
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
  }, [items, total, payments, changeAmount, companyName, companyCnpj, companyIe, companyPhone, companyAddress, companyUf, nfceNumber, accessKey, serie, logoUrl, saleId, customerCpf, protocolNumber, protocolDate, isHomologacao, tributosAprox]);
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
              <div className="flex justify-between text-success font-bold">
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
