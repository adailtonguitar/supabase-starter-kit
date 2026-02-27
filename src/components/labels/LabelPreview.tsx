import { Button } from "@/components/ui/button";
import type { ProductLabel } from "@/hooks/useProductLabels";

interface Props {
  labels: ProductLabel[];
  onPrintDone: (ids: string[]) => void;
}

export function LabelPreview({ labels, onPrintDone }: Props) {
  const handlePrint = () => {
    window.print();
    onPrintDone(labels.map((l) => l.id));
  };

  return (
    <div className="print-label-zone space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 print:grid-cols-3 print:gap-4">
        {labels.map((label) => {
          const p = label.product;
          if (!p) return null;
          return (
            <div key={label.id} className="border border-border rounded-lg p-3 text-center space-y-1 break-inside-avoid">
              <p className="text-xs font-medium truncate">{p.name}</p>
              <p className="text-lg font-bold">R$ {p.price.toFixed(2).replace(".", ",")}</p>
              {p.barcode && <p className="text-[10px] text-muted-foreground font-mono">{p.barcode}</p>}
            </div>
          );
        })}
      </div>
      <Button onClick={handlePrint} className="w-full no-print">
        Imprimir {labels.length} etiqueta(s)
      </Button>
    </div>
  );
}
