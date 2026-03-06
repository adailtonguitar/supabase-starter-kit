import { Check, Printer, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { buildCreditReceipt } from "@/lib/escpos";

const methodLabels: Record<string, string> = {
  dinheiro: "Dinheiro", debito: "Cartão Débito", credito: "Cartão Crédito", pix: "PIX",
};

export interface CreditReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

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
  storePhone?: string;
  storeAddress?: string;
  storeCity?: string;
  storeState?: string;
  items?: CreditReceiptItem[];
  receiptNumber?: number;
}

interface PDVCreditReceiptProps {
  data: CreditReceiptData;
  onClose: () => void;
}

// --- Valor por extenso ---
function valorPorExtenso(valor: number): string {
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
    "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function porExtenso(n: number): string {
    if (n === 0) return "zero";
    if (n === 100) return "cem";
    let parts: string[] = [];
    if (n >= 100) { parts.push(centenas[Math.floor(n / 100)]); n %= 100; }
    if (n >= 20) { parts.push(dezenas[Math.floor(n / 10)]); n %= 10; }
    if (n >= 1 && n <= 19) { parts.push(unidades[n]); }
    return parts.filter(Boolean).join(" e ");
  }

  const inteiro = Math.floor(Math.abs(valor));
  const centavos = Math.round((Math.abs(valor) - inteiro) * 100);

  let result = "";
  if (inteiro > 0) {
    if (inteiro >= 1000) {
      const milhares = Math.floor(inteiro / 1000);
      const resto = inteiro % 1000;
      result = (milhares === 1 ? "mil" : porExtenso(milhares) + " mil");
      if (resto > 0) result += " e " + porExtenso(resto);
    } else {
      result = porExtenso(inteiro);
    }
    result += inteiro === 1 ? " real" : " reais";
  }
  if (centavos > 0) {
    if (result) result += " e ";
    result += porExtenso(centavos) + (centavos === 1 ? " centavo" : " centavos");
  }
  if (!result) result = "zero reais";

  return result.charAt(0).toUpperCase() + result.slice(1);
}

function dataExtenso(date: Date, city?: string, state?: string): string {
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const dia = String(date.getDate()).padStart(2, "0");
  const mes = meses[date.getMonth()];
  const ano = date.getFullYear();
  const local = city && state ? `${city} - ${state}, ` : city ? `${city}, ` : "";
  return `${local}${dia} de ${mes} de ${ano}`;
}

function padReceiptNumber(n?: number): string {
  return String(n || 1).padStart(6, "0");
}

export function PDVCreditReceipt({ data, onClose }: PDVCreditReceiptProps) {
  const now = new Date();
  const extenso = valorPorExtenso(data.amount);
  const localData = dataExtenso(now, data.storeCity, data.storeState);
  const recNum = padReceiptNumber(data.receiptNumber);

  const formalText = `Recebemos de ${data.clientName}${data.clientDoc ? `, CPF ${data.clientDoc}` : ""}, a quantia de ${formatCurrency(data.amount)} referente à quitação de débito anterior.`;

  const handlePrint = () => {
    try {
      const receiptContent = `<html><head><title>Recibo</title><style>
        @page { size: 80mm auto; margin: 0; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 300px; margin: 0 auto; padding: 20px; color: #000; background: #fff; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .separator { border-top: 1px dashed #000; margin: 8px 0; }
        .line { margin: 4px 0; }
        .total { font-size: 16px; font-weight: bold; margin: 8px 0; }
        .no-fiscal { font-size: 11px; font-weight: bold; margin: 4px 0; border: 1px solid #000; padding: 2px 0; text-align: center; }
        .sig-area { margin-top: 28px; }
        .sig-line { border-top: 1px solid #000; margin-top: 44px; padding-top: 4px; text-align: center; font-size: 10px; }
        .formal { font-size: 11px; margin: 8px 0; text-align: justify; }
        .extenso { font-size: 10px; font-style: italic; margin: 2px 0; }
        .local-data { text-align: center; font-size: 10px; margin-top: 20px; }
        @media print { body { margin: 0; } @page { margin: 0; } }
      </style></head><body>
        <div class="center bold" style="font-size:14px;">RECIBO DE QUITAÇÃO</div>
        <div class="center bold" style="font-size:12px;">Nº ${recNum}</div>
        ${data.storeName ? `<div class="center line">${data.storeName}</div>` : ""}
        ${data.storeSlogan ? `<div class="center line" style="font-style:italic;font-size:11px;">${data.storeSlogan}</div>` : ""}
        ${data.storeCnpj ? `<div class="center line">CNPJ: ${data.storeCnpj}</div>` : ""}
        ${data.storeAddress ? `<div class="center line" style="font-size:10px;">${data.storeAddress}</div>` : ""}
        ${data.storePhone ? `<div class="center line" style="font-size:10px;">Fone: ${data.storePhone}</div>` : ""}
        <div class="no-fiscal">*** NÃO É DOCUMENTO FISCAL ***</div>
        <div class="separator"></div>
        <div class="center line">${now.toLocaleString("pt-BR")}</div>
        <div class="separator"></div>
        <div class="formal">${formalText}</div>
        <div class="separator"></div>
        <div class="bold line">Cliente: ${data.clientName}</div>
        ${data.clientDoc ? `<div class="line">CPF: ${data.clientDoc}</div>` : ""}
        <div class="separator"></div>
        <div class="line">Saldo anterior: ${formatCurrency(data.previousBalance)}</div>
        <div class="total center">Valor recebido: ${formatCurrency(data.amount)}</div>
        <div class="extenso center">( ${extenso} )</div>
        <div class="line">Saldo remanescente: ${formatCurrency(data.newBalance)}</div>
        <div class="separator"></div>
        <div class="line">Forma: ${methodLabels[data.paymentMethod] || data.paymentMethod}</div>
        <div class="separator"></div>
        ${data.items && data.items.length > 0 ? `
        <div class="center bold line" style="font-size:12px;">ITENS DA VENDA</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <tr style="border-bottom:1px dashed #000;">
            <th style="text-align:left;padding:2px 0;">Produto</th>
            <th style="text-align:center;padding:2px 0;width:30px;">Qtd</th>
            <th style="text-align:right;padding:2px 0;width:55px;">Unit</th>
            <th style="text-align:right;padding:2px 0;width:60px;">Total</th>
          </tr>
          ${data.items.map(i => `
          <tr>
            <td style="padding:2px 0;word-break:break-word;">${i.name}</td>
            <td style="text-align:center;padding:2px 0;">${i.quantity}</td>
            <td style="text-align:right;padding:2px 0;">${formatCurrency(i.unitPrice)}</td>
            <td style="text-align:right;padding:2px 0;">${formatCurrency(i.unitPrice * i.quantity)}</td>
          </tr>`).join("")}
        </table>
        <div class="separator"></div>
        <div class="bold center" style="font-size:13px;">TOTAL DA VENDA: ${formatCurrency(data.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0))}</div>
        <div class="separator"></div>
        ` : ""}
        <div class="local-data">${localData}</div>
        <div class="sig-area">
          <div class="sig-line">Assinatura do Cliente</div>
        </div>
        <div class="sig-area" style="margin-top:16px;">
          <div class="sig-line">Responsável pelo Recebimento</div>
        </div>
        <div class="separator" style="margin-top:20px;"></div>
        <div class="no-fiscal">*** NÃO É DOCUMENTO FISCAL ***</div>
        <div class="center" style="font-size:9px;margin-top:4px;">Obrigado pela preferência!</div>
      </body></html>`;
      const printWindow = window.open("", "_blank", "width=350,height=600");
      if (printWindow) { printWindow.document.write(receiptContent); printWindow.document.close(); printWindow.focus(); setTimeout(() => printWindow.print(), 200); }
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
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col items-center pt-8 pb-4 px-6">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4"><Check className="w-8 h-8 text-primary" /></div>
          <h3 className="text-lg font-bold text-foreground">Recibo de Quitação</h3>
          <p className="text-xs font-mono text-muted-foreground">Nº {recNum}</p>
          <p className="text-sm text-muted-foreground mt-1">{data.clientName}</p>
        </div>
        <div className="px-6 py-2">
          <p className="text-xs text-muted-foreground italic leading-relaxed">{formalText}</p>
        </div>
        <div className="px-6 py-4 border-t border-border space-y-3">
          {data.items && data.items.length > 0 && (
            <div className="space-y-1.5 pb-3 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Produtos</p>
              {data.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-foreground truncate mr-2">{item.quantity}x {item.name}</span>
                  <span className="font-mono text-foreground flex-shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Saldo anterior</span><span className="font-mono text-foreground">{formatCurrency(data.previousBalance)}</span></div>
          <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Valor recebido</span><span className="text-lg font-bold font-mono text-primary">{formatCurrency(data.amount)}</span></div>
          <p className="text-xs italic text-muted-foreground text-right">( {extenso} )</p>
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
