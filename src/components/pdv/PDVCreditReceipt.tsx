import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";

export interface CreditReceiptData {
  clientName: string;
  cpf?: string;
  clientDoc?: string;
  installmentNumber?: string;
  value?: number;
  amount?: number;
  previousBalance?: number;
  newBalance?: number;
  dueDate?: string;
  paidDate?: string;
  paymentMethod?: string;
  companyName?: string;
  companyCnpj?: string;
  companyPhone?: string;
  storeName?: string;
  storeSlogan?: string;
  operatorName?: string;
  pendingInstallments?: { number: number; dueDate: string; amount: number }[];
  saleItems?: { name: string; qty: number; price: number }[];
  [key: string]: any;
}

interface Props {
  data: CreditReceiptData;
  onClose: () => void;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const paymentMethodLabel: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão Débito",
  credito: "Cartão Crédito",
};

function ReceiptVia({ data, via }: { data: CreditReceiptData; via: "cliente" | "comercio" }) {
  const now = new Date();
  const storeName = data.storeName || data.companyName || "Estabelecimento";
  const amount = data.amount ?? data.value ?? 0;
  const doc = data.clientDoc || data.cpf;

  return (
    <div className="receipt-via" style={{ fontFamily: "monospace", fontSize: "11px", lineHeight: "1.4", maxWidth: "300px" }}>
      {/* Header */}
      <div className="center bold" style={{ fontSize: "13px", marginBottom: "2px" }}>{storeName}</div>
      {data.storeSlogan && <div className="center" style={{ fontSize: "9px", marginBottom: "2px" }}>{data.storeSlogan}</div>}
      {data.companyCnpj && <div className="center" style={{ fontSize: "9px" }}>CNPJ: {data.companyCnpj}</div>}
      {data.companyPhone && <div className="center" style={{ fontSize: "9px" }}>Tel: {data.companyPhone}</div>}
      
      <div className="line" />
      <div className="center bold" style={{ fontSize: "11px" }}>
        RECIBO DE QUITAÇÃO - VIA {via === "cliente" ? "CLIENTE" : "COMÉRCIO"}
      </div>
      <div className="line" />

      {/* Client info */}
      <table>
        <tbody>
          <tr><td style={{ width: "90px" }}>Cliente:</td><td className="bold">{data.clientName}</td></tr>
          {doc && <tr><td>CPF/CNPJ:</td><td>{doc}</td></tr>}
          <tr><td>Data/Hora:</td><td>{format(now, "dd/MM/yyyy HH:mm")}</td></tr>
          {data.operatorName && <tr><td>Operador:</td><td>{data.operatorName}</td></tr>}
        </tbody>
      </table>

      <div className="line" />

      {/* Financial details */}
      <div className="bold" style={{ marginBottom: "4px" }}>DETALHES DO RECEBIMENTO</div>
      <table>
        <tbody>
          {data.previousBalance !== undefined && (
            <tr><td style={{ width: "130px" }}>Saldo Anterior:</td><td className="bold">{fmt(data.previousBalance)}</td></tr>
          )}
          <tr><td>Valor Recebido:</td><td className="bold" style={{ fontSize: "13px" }}>{fmt(amount)}</td></tr>
          {data.newBalance !== undefined && (
            <tr><td>Saldo Remanescente:</td><td className="bold">{fmt(data.newBalance)}</td></tr>
          )}
          {data.paymentMethod && (
            <tr><td>Forma Pagamento:</td><td>{paymentMethodLabel[data.paymentMethod] || data.paymentMethod}</td></tr>
          )}
          {data.installmentNumber && (
            <tr><td>Parcela:</td><td>{data.installmentNumber}</td></tr>
          )}
          {data.dueDate && (
            <tr><td>Vencimento:</td><td>{data.dueDate}</td></tr>
          )}
          {data.paidDate && (
            <tr><td>Data Pagamento:</td><td>{data.paidDate}</td></tr>
          )}
        </tbody>
      </table>

      {/* Sale items if available */}
      {data.saleItems && data.saleItems.length > 0 && (
        <>
          <div className="line" />
          <div className="bold" style={{ marginBottom: "4px" }}>ITENS DA VENDA VINCULADA</div>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontSize: "10px" }}>Item</th>
                <th style={{ textAlign: "right", fontSize: "10px" }}>Unit.</th>
                <th style={{ textAlign: "right", fontSize: "10px" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.saleItems.map((item, i) => (
                <tr key={i}>
                  <td>{item.qty}x {item.name}</td>
                  <td style={{ textAlign: "right" }}>{fmt(item.price)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(item.price * item.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Pending installments */}
      {data.pendingInstallments && data.pendingInstallments.length > 0 && (
        <>
          <div className="line" />
          <div className="bold" style={{ marginBottom: "4px" }}>PARCELAS PENDENTES ({data.pendingInstallments.length})</div>
          <table>
            <thead>
              <tr><th style={{ textAlign: "left" }}>#</th><th style={{ textAlign: "left" }}>Vencimento</th><th style={{ textAlign: "right" }}>Valor</th></tr>
            </thead>
            <tbody>
              {data.pendingInstallments.map((inst) => (
                <tr key={inst.number}>
                  <td>{inst.number}</td>
                  <td>{inst.dueDate}</td>
                  <td style={{ textAlign: "right" }}>{fmt(inst.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="line" />

      {/* Signatures */}
      <div style={{ marginTop: "24px" }}>
        <div style={{ borderTop: "1px solid #000", width: "80%", margin: "0 auto", paddingTop: "2px", textAlign: "center", fontSize: "10px" }}>
          {via === "comercio" ? "Assinatura do Cliente" : "Assinatura do Responsável"}
        </div>
        {doc && via === "comercio" && (
          <div className="center" style={{ fontSize: "9px", marginTop: "2px" }}>CPF/CNPJ: {doc}</div>
        )}
      </div>

      <div style={{ marginTop: "20px" }}>
        <div style={{ borderTop: "1px solid #000", width: "80%", margin: "0 auto", paddingTop: "2px", textAlign: "center", fontSize: "10px" }}>
          {via === "comercio" ? "Assinatura do Responsável / Cadastrante" : "Carimbo / Assinatura do Comércio"}
        </div>
      </div>

      <div className="line" />
      <div className="center" style={{ fontSize: "9px", fontStyle: "italic" }}>
        NÃO É DOCUMENTO FISCAL
      </div>
      <div className="center" style={{ fontSize: "8px", marginTop: "2px" }}>
        Emitido em {format(now, "dd/MM/yyyy")} às {format(now, "HH:mm:ss")}
      </div>
    </div>
  );
}

export function PDVCreditReceipt({ data, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = ref.current;
    if (!content) return;
    const w = window.open("", "_blank", "width=400,height=900");
    if (!w) return;
    w.document.write(`<html><head><title>Recibo de Fiado</title><style>
      @page{size:80mm auto;margin:0}
      *{box-sizing:border-box;margin:0;padding:0}
      html{width:80mm}
      body{font-family:'Courier New',monospace;font-size:11px;width:80mm;max-width:80mm;padding:2mm 3mm;margin:0;line-height:1.4;color:#000;overflow-x:hidden;word-wrap:break-word;overflow-wrap:break-word}
      table{width:100%;border-collapse:collapse}
      td,th{padding:2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0}
      td:last-child,th:last-child{text-align:right;white-space:nowrap;width:auto;max-width:none}
      .line{border-top:1px dashed #000;margin:6px 0}
      .center{text-align:center}
      .bold{font-weight:bold}
      .cut-line{border-top:2px dashed #999;margin:16px 0;position:relative}
      .cut-label{position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:#fff;padding:0 6px;font-size:9px;color:#999}
      @media print{html,body{width:80mm;height:auto;margin:0;padding:2mm 3mm}.no-print{display:none}}
    </style></head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 my-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground">Recibo de Quitação (Fiado)</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div ref={ref} className="space-y-0 text-sm font-mono max-h-[60vh] overflow-y-auto">
          {/* Via do Comércio */}
          <ReceiptVia data={data} via="comercio" />

          {/* Cut line */}
          <div className="cut-line" style={{ borderTop: "2px dashed #999", margin: "16px 0", position: "relative" }}>
            <span style={{ position: "absolute", top: "-8px", left: "50%", transform: "translateX(-50%)", background: "#fff", padding: "0 6px", fontSize: "9px", color: "#999" }}>✂ Recorte aqui</span>
          </div>

          {/* Via do Cliente */}
          <ReceiptVia data={data} via="cliente" />
        </div>

        <div className="flex gap-2">
          <Button onClick={handlePrint} className="flex-1 gap-2"><Printer className="w-4 h-4" /> Imprimir</Button>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}
