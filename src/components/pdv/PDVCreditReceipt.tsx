import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";

export interface CreditReceiptData {
  clientName: string;
  cpf?: string;
  clientDoc?: string;
  installmentNumber: string;
  value: number;
  dueDate: string;
  paidDate?: string;
  paymentMethod?: string;
  companyName?: string;
  [key: string]: any;
}

interface Props {
  data: CreditReceiptData;
  onClose: () => void;
}

export function PDVCreditReceipt({ data, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = ref.current;
    if (!content) return;
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`<html><head><title>Recibo</title><style>body{font-family:monospace;font-size:12px;padding:10px}table{width:100%;border-collapse:collapse}td{padding:4px 0}.line{border-top:1px dashed #000;margin:8px 0}.center{text-align:center}.bold{font-weight:bold}</style></head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground">Recibo de Pagamento</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div ref={ref} className="space-y-2 text-sm font-mono">
          <div className="center bold">{data.companyName || "Recibo"}</div>
          <div className="line" />
          <table>
            <tbody>
              <tr><td>Cliente:</td><td className="bold">{data.clientName}</td></tr>
              {data.cpf && <tr><td>CPF:</td><td>{data.cpf}</td></tr>}
              <tr><td>Parcela:</td><td>{data.installmentNumber}</td></tr>
              <tr><td>Valor:</td><td className="bold">{fmt(data.value)}</td></tr>
              <tr><td>Vencimento:</td><td>{data.dueDate}</td></tr>
              {data.paidDate && <tr><td>Pago em:</td><td>{data.paidDate}</td></tr>}
              {data.paymentMethod && <tr><td>Forma:</td><td>{data.paymentMethod}</td></tr>}
            </tbody>
          </table>
          <div className="line" />
          <div className="center">Obrigado!</div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handlePrint} className="flex-1 gap-2"><Printer className="w-4 h-4" /> Imprimir</Button>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}
