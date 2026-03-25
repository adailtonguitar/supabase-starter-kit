import { useState } from "react";
import { AlertTriangle, CheckCircle, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface FiscalStockItem {
  name: string;
  quantity: number;
  cnpjStock: number;
  hasSufficientFiscalStock: boolean;
}

interface FiscalStockWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: FiscalStockItem[];
  onEmitAll: () => void;
  onEmitOnlyFiscal: () => void;
  onCancel: () => void;
}

export function FiscalStockWarningDialog({
  open,
  onOpenChange,
  items,
  onEmitAll,
  onEmitOnlyFiscal,
  onCancel,
}: FiscalStockWarningDialogProps) {
  if (!open) return null;

  const itemsWithIssue = items.filter((i) => !i.hasSufficientFiscalStock);
  const itemsOk = items.filter((i) => i.hasSufficientFiscalStock);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => onOpenChange(false)}>
      <div
        className="bg-card rounded-xl border border-border w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <h3 className="text-lg font-semibold text-foreground">Alerta de Lastro Fiscal</h3>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          {itemsWithIssue.length} de {items.length} item(ns) não possuem estoque suficiente com lastro fiscal (comprados com nota/CNPJ).
        </p>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Itens sem lastro fiscal:</p>
          {itemsWithIssue.map((item, i) => (
            <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  Vendendo: {item.quantity} · Estoque c/ nota: {item.cnpjStock}
                </p>
              </div>
              <Badge variant="destructive" className="text-[10px] shrink-0">Sem lastro</Badge>
            </div>
          ))}
        </div>

        {itemsOk.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Itens com lastro fiscal:</p>
            {itemsOk.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Vendendo: {item.quantity} · Estoque c/ nota: {item.cnpjStock}
                  </p>
                </div>
                <Badge variant="default" className="text-[10px] shrink-0">
                  <CheckCircle className="w-3 h-3 mr-1" /> OK
                </Badge>
              </div>
            ))}
          </div>
        )}

        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <strong>Atenção:</strong> Emitir NFC-e de produtos sem lastro fiscal pode gerar inconsistências com o fisco. A responsabilidade é do lojista.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={onEmitAll} className="w-full">
            <FileText className="w-4 h-4 mr-2" />
            Emitir NFC-e de todos mesmo assim
          </Button>
          {itemsOk.length > 0 && (
            <Button onClick={onEmitOnlyFiscal} variant="outline" className="w-full">
              <CheckCircle className="w-4 h-4 mr-2" />
              Emitir só dos {itemsOk.length} item(ns) com lastro
            </Button>
          )}
          <Button onClick={onCancel} variant="ghost" className="w-full">
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
