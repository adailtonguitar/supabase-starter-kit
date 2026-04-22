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
  /** Ambiente da NFC-e conforme fiscal_configs (não hardcoded). */
  fiscalEnvironment?: "homologacao" | "producao";
  /**
   * Chave de acesso de 44 dígitos retornada pela SEFAZ/provedor.
   * Sem ela, o QR Code exibido não tem validade fiscal.
   */
  accessKey?: string;
  /**
   * URL completa do QR Code da NFC-e, conforme NT2015/002 da SEFAZ
   * (inclui chave + parâmetros CSC). Se presente, é usada no QR.
   */
  qrCodeUrl?: string;
  /** URL de consulta humana (exibida no rodapé do cupom). */
  consultaUrl?: string;
  items: NfceItem[];
  paymentValue: number;
  paymentMethod: string;
  change: number;
  customerName: string;
  customerDoc: string;
  paymentOptions: PaymentOption[];
  onClose: () => void;
}

/**
 * Dígitos 1-2 da chave = código UF (IBGE).
 * Usado como fallback quando o provedor não devolve `qrcode`/`url_consulta`.
 * NÃO substitui o QR oficial assinado por CSC — apenas aponta para o portal SEFAZ
 * correto para consulta manual por chave.
 */
const UF_CONSULTA_FALLBACK: Record<string, string> = {
  "11": "https://www.sefaz.ro.gov.br/nfce/consulta",
  "12": "https://portal.sefaz.ac.gov.br/Nfce/Consulta",
  "13": "https://sistemas.sefaz.am.gov.br/nfceweb/consultarNFCe.jsp",
  "14": "https://www.sefaz.rr.gov.br/nfce/servlet/wp_consulta_nfce",
  "15": "https://www.sefa.pa.gov.br/nfce/Consulta.aspx",
  "16": "https://www.sefaz.ap.gov.br/nfce/nfcep.php",
  "17": "https://www.sefaz.to.gov.br/nfce/consulta.jsp",
  "21": "https://www.nfce.sefaz.ma.gov.br/portal/consultaNFCe.jsp",
  "22": "https://www.sefaz.pi.gov.br/nfceweb/consultarNFCe.jsf",
  "23": "https://nfce.sefaz.ce.gov.br/pages/consultaNota.jsf",
  "24": "https://nfce.set.rn.gov.br/consultarNFCe.aspx",
  "25": "https://www.nfce.sefaz.pb.gov.br/nfce/qrcode",
  "26": "https://nfce.sefaz.pe.gov.br/nfce/consulta",
  "27": "http://www.sefaz.al.gov.br/nfce/qrcode",
  "28": "https://www.nfce.se.gov.br/portal/consultarNFCe.jsp",
  "29": "https://nfce.sefaz.ba.gov.br/modulos/consultaQRCode.aspx",
  "31": "https://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml",
  "32": "http://www4.fazenda.rj.gov.br/consultaNFCe/QRCode",
  "33": "http://www4.fazenda.rj.gov.br/consultaNFCe/QRCode",
  "35": "https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx",
  "41": "https://www.fazenda.pr.gov.br/nfce/qrcode",
  "42": "https://sat.sef.sc.gov.br/nfce/consulta",
  "43": "https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx",
  "50": "http://www.sefaz.ms.gov.br/nfce/consulta",
  "51": "https://www.sefaz.mt.gov.br/nfce/consultanfce",
  "52": "https://www.sefaz.go.gov.br/nfe/consulta",
  "53": "https://dec.fazenda.df.gov.br/ConsultarNFCe.aspx",
};

function isValidAccessKey(key: string | undefined | null): key is string {
  if (!key) return false;
  const digits = key.replace(/\D/g, "");
  return digits.length === 44;
}

function buildConsultaUrl(accessKey: string): string {
  const cUF = accessKey.substring(0, 2);
  const base = UF_CONSULTA_FALLBACK[cUF];
  if (!base) return `https://www.nfe.fazenda.gov.br/portal/consultaRecibo.aspx?chave=${accessKey}`;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}chave=${accessKey}`;
}

export function NfceSuccessStep({
  saleId,
  fiscalEnvironment = "producao",
  accessKey,
  qrCodeUrl,
  consultaUrl,
  items,
  paymentValue,
  paymentMethod,
  change,
  customerName,
  customerDoc,
  paymentOptions,
  onClose,
}: NfceSuccessStepProps) {
  const normalizedCustomerName = customerName.trim();
  const normalizedCustomerDoc = customerDoc.trim();
  const hasIdentifiedConsumer = !!normalizedCustomerDoc;
  const customerDocLabel = normalizedCustomerDoc.length === 14 ? "CNPJ" : "CPF";
  const ambienteLabel =
    fiscalEnvironment === "homologacao"
      ? "Ambiente: Homologação — sem valor fiscal"
      : "Ambiente: Produção";

  // Decide o que codificar no QR. Prioridade:
  // 1) qrCodeUrl oficial (NT2015/002, assinado por CSC) — fonte única de verdade
  // 2) chave de 44 dígitos → URL de consulta pública por UF
  // 3) sem chave válida → QR é escondido e cupom exibe aviso "SEM VALOR FISCAL"
  const hasValidKey = isValidAccessKey(accessKey);
  const qrValue = qrCodeUrl
    ? qrCodeUrl
    : hasValidKey
      ? consultaUrl && consultaUrl.startsWith("http")
        ? consultaUrl
        : buildConsultaUrl(accessKey)
      : null;
  const formattedKey = hasValidKey ? (accessKey as string).replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ") : "";

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
      ${hasIdentifiedConsumer ? `
        <div class="cupom-section">
          ${normalizedCustomerName ? `<div><strong>Consumidor:</strong> ${normalizedCustomerName}</div>` : ""}
          <div><strong>${customerDocLabel}:</strong> ${normalizedCustomerDoc}</div>
        </div>
      ` : `
        <div class="cupom-section">
          <div><strong>Consumidor:</strong> NÃO IDENTIFICADO</div>
        </div>
      `}
      <div class="qr-section">
        ${qrValue ? (document.getElementById("nfce-cupom")?.querySelector("svg")?.outerHTML || "") : ""}
        ${qrValue ? `<div class="qr-label">Consulte pelo QR Code</div>` : `<div class="qr-label" style="color:#c00;font-weight:bold">SEM VALOR FISCAL — SIMULAÇÃO</div>`}
        ${hasValidKey ? `<div class="qr-label" style="font-size:8px;word-break:break-all;margin-top:4px">Chave: ${formattedKey}</div>` : ""}
      </div>
      <div class="footer">
        <div>${fiscalEnvironment === "homologacao" ? "Ambiente: Homologação — sem valor fiscal" : "Ambiente: Produção"}</div>
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

        {hasIdentifiedConsumer ? (
          <div className="border-b border-dashed border-gray-400 pb-2">
            {normalizedCustomerName && <p><span className="font-bold">Consumidor:</span> {normalizedCustomerName}</p>}
            <p><span className="font-bold">{customerDocLabel}:</span> {normalizedCustomerDoc}</p>
          </div>
        ) : (
          <div className="border-b border-dashed border-gray-400 pb-2">
            <p><span className="font-bold">Consumidor:</span> NAO IDENTIFICADO</p>
          </div>
        )}

        <div className="flex flex-col items-center border-b border-dashed border-gray-400 pb-2">
          {qrValue ? (
            <>
              <QRCodeSVG value={qrValue} size={100} level="M" />
              <p className="text-[9px] text-gray-500 mt-1">Consulte pelo QR Code</p>
            </>
          ) : (
            <div className="text-center py-3 px-2 rounded border border-dashed border-red-400 bg-red-50">
              <p className="text-[10px] font-bold text-red-700">SEM VALOR FISCAL</p>
              <p className="text-[9px] text-red-600 mt-0.5">Simulação — sem autorização da SEFAZ</p>
            </div>
          )}
          {hasValidKey && (
            <p className="text-[8px] font-mono text-gray-600 mt-1 break-all max-w-[260px] text-center leading-tight">
              Chave: {formattedKey}
            </p>
          )}
        </div>

        <div className="text-center text-[9px] text-gray-500 pt-1">
          <p>{ambienteLabel}</p>
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
