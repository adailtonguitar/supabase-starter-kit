import { useState } from "react";
import { useCreateStockMovement } from "@/hooks/useStockMovements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StockMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: any;
  onSuccess?: () => void;
}

export function StockMovementDialog({ open, onOpenChange, product, onSuccess }: StockMovementDialogProps) {
  const createMovement = useCreateStockMovement();
  const [type, setType] = useState<"entrada" | "saida">("entrada");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = async () => {
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
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

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
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
            <Input
              type="text"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => {
                e.stopPropagation();
                const val = e.target.value.replace(/[^0-9.,]/g, "");
                setQuantity(val);
              }}
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
              onKeyPress={(e) => e.stopPropagation()}
              placeholder="Ex: 10"
              className="text-lg h-12"
            />
          </div>

          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Compra fornecedor, ajuste, etc."
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
