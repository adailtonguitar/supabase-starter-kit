import { useRef } from "react";
import { format } from "date-fns";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export interface CarneData {
  storeName: string;
  storeCnpj?: string;
  storePhone?: string;
  storeAddress?: string;
  clientName: string;
  clientDoc?: string;
  clientPhone?: string;
  totalAmount: number;
  installments: {
    number: number;
    dueDate: string;
    amount: number;
  }[];
  saleDate: string;
  description?: string;
}

interface CarnePrintProps {
  data: CarneData;
  onClose: () => void;
  format?: "matricial" | "a4";
}

function CarneMatricial({ data }: { data: CarneData }) {
  return (
    <div className="font-mono text-[11px] leading-tight" style={{ width: "80ch" }}>
      {data.installments.map((inst) => (
        <div key={inst.number} className="mb-1 border-b border-dashed border-foreground/30 pb-2">
          {/* Canhoto (lado esquerdo) + Via da loja */}
          <div className="flex">
            {/* Canhoto */}
            <div className="w-[28ch] border-r border-dashed border-foreground/30 pr-2 flex-shrink-0">
              <div className="font-bold text-center">{data.storeName}</div>
              <div className="text-center text-[9px]">CANHOTO</div>
              <div className="mt-1">Parcela: {inst.number}/{data.installments.length}</div>
              <div>Valor: {formatCurrency(inst.amount)}</div>
              <div>Venc.: {format(new Date(inst.dueDate), "dd/MM/yyyy")}</div>
              <div className="truncate">Cliente: {data.clientName}</div>
              <div className="mt-2 border-t border-dotted border-foreground/20 pt-1">
                <div className="text-[9px]">Assinatura: ________________</div>
              </div>
            </div>

            {/* Via principal */}
            <div className="flex-1 pl-3">
              <div className="font-bold text-center text-xs">{data.storeName}</div>
              {data.storeCnpj && <div className="text-center text-[9px]">CNPJ: {data.storeCnpj}</div>}
              {data.storePhone && <div className="text-center text-[9px]">Tel: {data.storePhone}</div>}
              {data.storeAddress && <div className="text-center text-[9px] truncate">{data.storeAddress}</div>}
              <div className="mt-1 text-center font-bold">
                CARNÊ - PARCELA {inst.number} de {data.installments.length}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-2">
                <div>Cliente: {data.clientName}</div>
                <div>Doc: {data.clientDoc || "-"}</div>
                <div>Total: {formatCurrency(data.totalAmount)}</div>
                <div>Data venda: {format(new Date(data.saleDate), "dd/MM/yyyy")}</div>
              </div>
              {data.description && <div className="mt-0.5">Ref: {data.description}</div>}
              <div className="mt-1 flex justify-between font-bold border-t border-dotted border-foreground/20 pt-1">
                <span>VALOR: {formatCurrency(inst.amount)}</span>
                <span>VENCIMENTO: {format(new Date(inst.dueDate), "dd/MM/yyyy")}</span>
              </div>
              <div className="mt-2 flex justify-between text-[9px]">
                <span>Ass. Cliente: ____________________________</span>
                <span>Data pgto: ____/____/________</span>
              </div>
            </div>
          </div>
          {/* Linha de corte */}
          <div className="text-center text-[8px] text-muted-foreground mt-1">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
        </div>
      ))}
    </div>
  );
}

function CarneA4({ data }: { data: CarneData }) {
  return (
    <div className="space-y-6 max-w-[210mm] mx-auto">
      {data.installments.map((inst) => (
        <div key={inst.number} className="border border-border rounded-lg p-4 break-inside-avoid">
          <div className="flex gap-4">
            {/* Canhoto */}
            <div className="w-48 border-r-2 border-dashed border-border pr-4 flex-shrink-0">
              <h3 className="font-bold text-sm text-foreground">{data.storeName}</h3>
              <p className="text-[10px] text-muted-foreground uppercase">Canhoto</p>
              <div className="mt-2 space-y-1 text-xs text-foreground">
                <p><strong>Parcela:</strong> {inst.number}/{data.installments.length}</p>
                <p><strong>Valor:</strong> {formatCurrency(inst.amount)}</p>
                <p><strong>Venc.:</strong> {format(new Date(inst.dueDate), "dd/MM/yyyy")}</p>
                <p className="truncate"><strong>Cliente:</strong> {data.clientName}</p>
              </div>
              <div className="mt-4 pt-2 border-t border-border">
                <p className="text-[10px] text-muted-foreground">Assinatura:</p>
                <div className="border-b border-foreground/30 mt-6" />
              </div>
            </div>

            {/* Via principal */}
            <div className="flex-1">
              <div className="text-center mb-3">
                <h3 className="font-bold text-base text-foreground">{data.storeName}</h3>
                {data.storeCnpj && <p className="text-xs text-muted-foreground">CNPJ: {data.storeCnpj}</p>}
                <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                  {data.storePhone && <span>Tel: {data.storePhone}</span>}
                </div>
                {data.storeAddress && <p className="text-xs text-muted-foreground">{data.storeAddress}</p>}
              </div>

              <div className="bg-muted/50 rounded-lg px-3 py-2 text-center mb-3">
                <span className="font-bold text-foreground">CARNÊ — PARCELA {inst.number} de {data.installments.length}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm text-foreground">
                <p><strong>Cliente:</strong> {data.clientName}</p>
                <p><strong>Doc:</strong> {data.clientDoc || "—"}</p>
                <p><strong>Valor total:</strong> {formatCurrency(data.totalAmount)}</p>
                <p><strong>Data da venda:</strong> {format(new Date(data.saleDate), "dd/MM/yyyy")}</p>
              </div>
              {data.description && <p className="text-sm text-muted-foreground mt-1">Ref: {data.description}</p>}

              <div className="mt-3 flex justify-between items-center bg-primary/5 rounded-lg px-3 py-2 border border-primary/10">
                <span className="font-bold text-lg text-foreground">{formatCurrency(inst.amount)}</span>
                <span className="text-sm font-semibold text-foreground">Venc.: {format(new Date(inst.dueDate), "dd/MM/yyyy")}</span>
              </div>

              <div className="mt-4 flex justify-between text-xs text-muted-foreground">
                <div>
                  <p>Assinatura do Cliente:</p>
                  <div className="border-b border-foreground/30 w-48 mt-6" />
                </div>
                <div>
                  <p>Data do pagamento:</p>
                  <div className="border-b border-foreground/30 w-32 mt-6" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CarnePrint({ data, onClose, format: printFormat = "a4" }: CarnePrintProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const isMatricial = printFormat === "matricial";

    printWindow.document.write(`
      <html>
        <head>
          <title>Carnê - ${data.clientName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: ${isMatricial ? "'Courier New', Courier, monospace" : "'Segoe UI', Arial, sans-serif"};
              font-size: ${isMatricial ? "11px" : "12px"};
              color: #000;
              padding: ${isMatricial ? "0" : "10mm"};
            }
            @page { 
              size: ${isMatricial ? "auto" : "A4"};
              margin: ${isMatricial ? "0" : "10mm"};
            }
            .page-break { page-break-after: always; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div>
          <h2 className="text-lg font-bold text-foreground">Pré-visualização do Carnê</h2>
          <p className="text-xs text-muted-foreground">
            {data.installments.length} parcelas • Formato: {printFormat === "matricial" ? "Matricial (Epson LX)" : "A4"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" /> Imprimir
          </Button>
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" /> Fechar
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-auto p-6">
        <div ref={printRef} className={`bg-white text-black ${printFormat === "matricial" ? "p-2" : "p-6"} rounded-lg shadow-lg mx-auto max-w-4xl`}>
          {printFormat === "matricial" ? (
            <CarneMatricial data={data} />
          ) : (
            <CarneA4 data={data} />
          )}
        </div>
      </div>
    </div>
  );
}
