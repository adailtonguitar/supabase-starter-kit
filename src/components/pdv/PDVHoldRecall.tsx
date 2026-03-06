import { useState, useEffect } from "react";
import { Pause, Play, Trash2, X, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

export interface HeldSale {
  id: string;
  items: Array<{ id: string; name: string; sku: string; price: number; quantity: number; unit: string; ncm: string; barcode: string; stock_quantity: number; image_url?: string }>;
  itemDiscounts: Record<string, number>;
  globalDiscountPercent: number;
  clientName?: string;
  total: number;
  heldAt: string;
  label?: string;
}

const STORAGE_KEY = "pdv_held_sales";

export function getHeldSales(): HeldSale[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

export function saveHeldSale(sale: HeldSale) {
  const sales = getHeldSales();
  sales.push(sale);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
}

export function removeHeldSale(id: string) {
  const sales = getHeldSales().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
}

interface PDVHoldRecallProps {
  open: boolean;
  onClose: () => void;
  onRecall: (sale: HeldSale) => void;
}

export function PDVHoldRecallDialog({ open, onClose, onRecall }: PDVHoldRecallProps) {
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);

  useEffect(() => {
    if (open) setHeldSales(getHeldSales());
  }, [open]);

  if (!open) return null;

  const handleDelete = (id: string) => {
    removeHeldSale(id);
    setHeldSales(prev => prev.filter(s => s.id !== id));
    toast.info("Venda suspensa removida", { duration: 1200 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Pause className="w-5 h-5 text-primary" /> Vendas Suspensas
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <div className="p-4 max-h-[400px] overflow-y-auto space-y-2">
          {heldSales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <ShoppingCart className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nenhuma venda suspensa</p>
            </div>
          ) : (
            heldSales.map(sale => (
              <div key={sale.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-muted/50 border border-border hover:bg-muted transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">
                    {sale.label || `Venda suspensa`}
                    {sale.clientName && <span className="ml-2 text-muted-foreground font-normal">— {sale.clientName}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {sale.items.length} item(ns) · {new Date(sale.heldAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className="text-base font-black text-primary font-mono whitespace-nowrap">
                  {formatCurrency(sale.total)}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => { onRecall(sale); removeHeldSale(sale.id); onClose(); }}
                    className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                    title="Retomar"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(sale.id)}
                    className="p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
