interface MovementHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
}

export function MovementHistoryDialog({ open, onOpenChange }: MovementHistoryDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={() => onOpenChange(false)}>
      <div className="bg-card rounded-t-2xl sm:rounded-xl p-6 border border-border w-full sm:max-w-md max-h-[92vh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sm:hidden mx-auto w-12 h-1.5 rounded-full bg-muted-foreground/30 -mt-2 mb-3" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Histórico de Movimentações</h2>
        <p className="text-sm text-muted-foreground">Em desenvolvimento.</p>
        <button onClick={() => onOpenChange(false)} className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">Fechar</button>
      </div>
    </div>
  );
}
