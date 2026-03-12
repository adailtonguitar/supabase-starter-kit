import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";

export interface FiadoReceiptData {
  clientName: string;
  cpf?: string;
  total: number;
  items?: { name: string; qty?: number; quantity?: number; price: number; [key: string]: any }[];
  date?: string;
  companyName?: string;
  companyCnpj?: string;
  companyPhone?: string;
  storeSlogan?: string;
  mode?: string; // fiado | parcelado | sinal
  installments?: number;
  saleNumber?: number;
  downPayment?: number;
  operatorName?: string;
  [key: string]: any;
}

interface Props {
  data: FiadoReceiptData;
  onClose: () => void;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function SaleReceiptVia({ data, via }: { data: FiadoReceiptData; via: "cliente" | "comercio" }) {
  const now = new Date();
  const storeName = data.companyName || "Estabelecimento";
  const items = data.items || [];
  const modeLabel = data.mode === "sinal" ? "VENDA COM SINAL" : data.mode === "parcelado" ? "VENDA PARCELADA" : "VENDA A PRAZO (FIADO)";

  return (
    <div style={{ fontFamily: "monospace", fontSize: "11px", lineHeight: "1.4", maxWidth: "300px" }}>
      {/* Header */}
      <div className="center bold" style={{ fontSize: "13px", marginBottom: "2px" }}>{storeName}</div>
      {data.storeSlogan && <div className="center" style={{ fontSize: "9px", marginBottom: "2px" }}>{data.storeSlogan}</div>}
      {data.companyCnpj && <div className="center" style={{ fontSize: "9px" }}>CNPJ: {data.companyCnpj}</div>}
      {data.companyPhone && <div className="center" style={{ fontSize: "9px" }}>Tel: {data.companyPhone}</div>}

      <div className="line" />
      <div className="center bold" style={{ fontSize: "11px" }}>
        {modeLabel} - VIA {via === "cliente" ? "CLIENTE" : "COMÉRCIO"}
      </div>
      {data.saleNumber && <div className="center" style={{ fontSize: "9px" }}>Venda Nº {data.saleNumber}</div>}
      <div className="line" />

      {/* Client info */}
      <table>
        <tbody>
          <tr><td style={{ width: "80px" }}>Cliente:</td><td className="bold">{data.clientName}</td></tr>
          {data.cpf && <tr><td>CPF/CNPJ:</td><td>{data.cpf}</td></tr>}
          <tr><td>Data/Hora:</td><td>{data.date || format(now, "dd/MM/yyyy HH:mm")}</td></tr>
          {data.operatorName && <tr><td>Operador:</td><td>{data.operatorName}</td></tr>}
        </tbody>
      </table>

      <div className="line" />

      {/* Items */}
      <div className="bold" style={{ marginBottom: "4px" }}>ITENS</div>
      <table>
        <tbody>
          {items.map((item, i) => {
            const q = item.qty ?? item.quantity ?? 1;
            return (
              <tr key={i}>
                <td>{q}x {item.name}</td>
                <td style={{ textAlign: "right" }}>{fmt(item.price * q)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="line" />
      <div className="bold right" style={{ fontSize: "13px" }}>TOTAL: {fmt(data.total)}</div>

      {/* Conditions */}
      {data.mode === "sinal" && data.downPayment !== undefined && (
        <>
          <div className="line" />
          <table>
            <tbody>
              <tr><td style={{ width: "130px" }}>Sinal Pago:</td><td className="bold">{fmt(data.downPayment)}</td></tr>
              <tr><td>Saldo Restante:</td><td className="bold">{fmt(data.total - data.downPayment)}</td></tr>
            </tbody>
          </table>
        </>
      )}

      {data.mode === "parcelado" && data.installments && (
        <>
          <div className="line" />
          <div>Parcelamento: <span className="bold">{data.installments}x de {fmt(data.total / data.installments)}</span></div>
        </>
      )}

      <div className="line" />

      {/* Agreement text */}
      <div style={{ fontSize: "9px", fontStyle: "italic", marginBottom: "8px" }}>
        Declaro ter recebido as mercadorias acima descritas e comprometo-me a efetuar
        o pagamento na(s) data(s) acordada(s).
      </div>

      {/* Signatures */}
      <div style={{ marginTop: "24px" }}>
        <div style={{ borderTop: "1px solid #000", width: "80%", margin: "0 auto", paddingTop: "2px", textAlign: "center", fontSize: "10px" }}>
          Assinatura do Cliente
        </div>
        {data.cpf && (
          <div className="center" style={{ fontSize: "9px", marginTop: "2px" }}>CPF/CNPJ: {data.cpf}</div>
        )}
      </div>

      <div style={{ marginTop: "20px" }}>
        <div style={{ borderTop: "1px solid #000", width: "80%", margin: "0 auto", paddingTop: "2px", textAlign: "center", fontSize: "10px" }}>
          {via === "comercio" ? "Responsável pelo Cadastro" : "Carimbo / Assinatura do Comércio"}
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

export function PDVFiadoReceipt({ data, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = ref.current;
    if (!content) return;
    const w = window.open("", "_blank", "width=400,height=900");
    if (!w) return;
    w.document.write(`<html><head><title>Venda a Prazo</title><style>
      body{font-family:monospace;font-size:11px;padding:10px;margin:0}
      table{width:100%;border-collapse:collapse}
      td,th{padding:2px 0}
      .line{border-top:1px dashed #000;margin:6px 0}
      .center{text-align:center}
      .bold{font-weight:bold}
      .right{text-align:right}
      .cut-line{border-top:2px dashed #999;margin:16px 0;position:relative}
      @media print{.no-print{display:none}}
    </style></head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 my-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground">Comprovante de Venda a Prazo</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div ref={ref} className="space-y-0 text-sm font-mono max-h-[60vh] overflow-y-auto">
          {/* Via do Comércio */}
          <SaleReceiptVia data={data} via="comercio" />

          {/* Cut line */}
          <div style={{ borderTop: "2px dashed #999", margin: "16px 0", position: "relative" }}>
            <span style={{ position: "absolute", top: "-8px", left: "50%", transform: "translateX(-50%)", background: "#fff", padding: "0 6px", fontSize: "9px", color: "#999" }}>✂ Recorte aqui</span>
          </div>

          {/* Via do Cliente */}
          <SaleReceiptVia data={data} via="cliente" />
        </div>

        <div className="flex gap-2">
          <Button onClick={handlePrint} className="flex-1 gap-2"><Printer className="w-4 h-4" /> Imprimir</Button>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}
