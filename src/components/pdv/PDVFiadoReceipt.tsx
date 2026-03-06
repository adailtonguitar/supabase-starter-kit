import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";

export interface FiadoReceiptData {
  clientName: string;
  cpf?: string;
  total: number;
  items: { name: string; qty?: number; quantity?: number; price: number; [key: string]: any }[];
  date: string;
  companyName?: string;
  [key: string]: any;
}

interface Props {
  data: FiadoReceiptData;
  onClose: () => void;
}

export function PDVFiadoReceipt({ data, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = ref.current;
    if (!content) return;
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`<html><head><title>Fiado</title><style>body{font-family:monospace;font-size:12px;padding:10px}table{width:100%;border-collapse:collapse}td{padding:2px 0}.line{border-top:1px dashed #000;margin:8px 0}.center{text-align:center}.bold{font-weight:bold}.right{text-align:right}</style></head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground">Comprovante Fiado</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div ref={ref} className="space-y-2 text-sm font-mono">
          <div className="center bold">{data.companyName || "Comprovante"}</div>
          <div className="center">{data.date}</div>
          <div className="line" />
          <div>Cliente: <span className="bold">{data.clientName}</span></div>
          {data.cpf && <div>CPF: {data.cpf}</div>}
          <div className="line" />
          <table>
            <tbody>
              {data.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.qty}x {item.name}</td>
                  <td className="right">{fmt(item.price * item.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="line" />
          <div className="bold right">Total: {fmt(data.total)}</div>
          <div className="line" />
          <div style={{ marginTop: 40 }} className="center">
            ___________________________<br />
            Assinatura do Cliente
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handlePrint} className="flex-1 gap-2"><Printer className="w-4 h-4" /> Imprimir</Button>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}
