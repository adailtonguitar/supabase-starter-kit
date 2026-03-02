interface PDVQuickProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialBarcode?: string;
  onProductCreated?: () => void;
}

export function PDVQuickProductDialog({ open, onOpenChange }: PDVQuickProductDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={() => onOpenChange(false)}>
      <div className="bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl p-6 w-full sm:max-w-md max-h-[92vh] sm:max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sm:hidden mx-auto w-12 h-1.5 rounded-full bg-muted-foreground/30 -mt-2 mb-3" />
        <h2 className="text-lg font-bold text-foreground mb-2 pt-0.5">Cadastro Rápido</h2>
        <p className="text-sm text-muted-foreground">Módulo de cadastro rápido em desenvolvimento.</p>
        <button onClick={() => onOpenChange(false)} className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Fechar</button>
      </div>
    </div>
  );
}
