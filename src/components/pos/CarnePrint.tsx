import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";

export interface CarneData {
  clientName: string;
  cpf?: string;
  installments: { number: number; value?: number; amount?: number; dueDate: string; [key: string]: any }[];
  total?: number;
  totalAmount?: number;
  companyName?: string;
  [key: string]: any;
}

interface Props {
  data: CarneData;
  onClose: () => void;
  format?: "a4" | "thermal" | "matricial";
}

export function CarnePrint({ data, onClose, format = "a4" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = ref.current;
    if (!content) return;
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    w.document.write(`<html><head><title>Carnê</title><style>body{font-family:monospace;font-size:11px;padding:10px}table{width:100%;border-collapse:collapse}th,td{padding:4px;border:1px solid #ccc;text-align:left}.bold{font-weight:bold}.center{text-align:center}</style></head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground">Carnê de Pagamento</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div ref={ref} className="space-y-3 text-sm font-mono">
          <div className="center bold">{data.companyName || "Carnê"}</div>
          <div>Cliente: <span className="bold">{data.clientName}</span></div>
          {data.cpf && <div>CPF: {data.cpf}</div>}
          <div>Total: <span className="bold">{fmt(data.total)}</span></div>
          <table>
            <thead>
              <tr><th>#</th><th>Vencimento</th><th>Valor</th><th>Pago</th></tr>
            </thead>
            <tbody>
              {data.installments.map((inst) => (
                <tr key={inst.number}>
                  <td>{inst.number}</td>
                  <td>{inst.dueDate}</td>
                  <td>{fmt(inst.value ?? inst.amount ?? 0)}</td>
                  <td className="center">☐</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          <Button onClick={handlePrint} className="flex-1 gap-2"><Printer className="w-4 h-4" /> Imprimir</Button>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}
