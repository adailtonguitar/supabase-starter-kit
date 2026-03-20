import { useState, useRef, useCallback, useEffect } from "react";
import { useCreateStockMovement } from "@/hooks/useStockMovements";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { Product } from "@/hooks/useProducts";

interface StockMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSuccess?: () => void;
}

export function StockMovementDialog({ open, onOpenChange, product, onSuccess }: StockMovementDialogProps) {
  const createMovement = useCreateStockMovement();
  const [type, setType] = useState<"entrada" | "saida">("entrada");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const qtyRef = useRef<HTMLInputElement>(null);

  // Reset fields when dialog opens
  useEffect(() => {
    if (open) {
      setQuantity("");
      setReason("");
      setType("entrada");
    }
  }, [open]);

  const handleSubmit = async () => {
    const normalized = quantity.replace(",", ".");
    const qty = parseFloat(normalized);
    if (!qty || qty <= 0 || isNaN(qty)) {
      toast.error("Informe uma quantidade válida");
      return;
    }
    if (!product) return;

    if (type === "saida" && qty > (product.stock_quantity || 0)) {
      toast.error("Quantidade maior que o estoque disponível");
      return;
    }

    try {
      await createMovement.mutateAsync({
        product_id: product.id,
        type,
        quantity: qty,
        reason: reason || (type === "entrada" ? "Entrada manual" : "Saída manual"),
      });
      setQuantity("");
      setReason("");
      onOpenChange(false);
      onSuccess?.();
    } catch {
      // error handled by hook toast
    }
  };

  // Block ALL event propagation from the entire dialog to prevent PDV interference
  const stopAll = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Movimentação de Estoque</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-sm font-semibold text-foreground">{product.name}</p>
            <p className="text-xs text-muted-foreground">
              SKU: {product.sku} · Estoque atual: <span className="font-mono font-bold">{product.stock_quantity ?? 0} {product.unit || "UN"}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label>Tipo de movimentação</Label>
            <Select value={type} onValueChange={(v) => setType(v as "entrada" | "saida")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">📥 Entrada</SelectItem>
                <SelectItem value="saida">📤 Saída</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quantidade</Label>
            <input
              ref={qtyRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              data-no-barcode-focus="true"
              value={quantity}
              onChange={(e) => {
                e.stopPropagation();
                const val = e.target.value.replace(/[^0-9.,]/g, "");
                setQuantity(val);
              }}
              onKeyDown={stopAll}
              onKeyUp={stopAll}
              onKeyPress={stopAll}
              placeholder="Ex: 10"
              className="flex h-12 w-full rounded-lg border border-input bg-background px-3 py-2 text-lg ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 box-border"
            />
          </div>

          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <input
              type="text"
              autoComplete="off"
              data-no-barcode-focus="true"
              value={reason}
              onChange={(e) => {
                e.stopPropagation();
                setReason(e.target.value);
              }}
              onKeyDown={stopAll}
              onKeyUp={stopAll}
              onKeyPress={stopAll}
              placeholder="Ex: Compra fornecedor, ajuste, etc."
              className="flex h-12 w-full rounded-lg border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm box-border"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={createMovement.isPending}>
              {createMovement.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
