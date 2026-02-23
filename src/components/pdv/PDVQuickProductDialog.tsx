interface PDVQuickProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialBarcode?: string;
  onProductCreated?: () => void;
}

export function PDVQuickProductDialog({ open, onOpenChange }: PDVQuickProductDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => onOpenChange(false)}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-foreground mb-2">Cadastro Rápido</h2>
        <p className="text-sm text-muted-foreground">Módulo de cadastro rápido em desenvolvimento.</p>
        <button onClick={() => onOpenChange(false)} className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Fechar</button>
      </div>
    </div>
  );
}
