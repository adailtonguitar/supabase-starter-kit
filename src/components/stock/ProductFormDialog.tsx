interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: any;
}

export function ProductFormDialog({ open, onOpenChange }: ProductFormDialogProps) {
  if (!open) return null;
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">Formulário de Produto</h2>
      <p className="text-sm text-muted-foreground">Em desenvolvimento.</p>
      <button onClick={() => onOpenChange(false)} className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">Voltar</button>
    </div>
  );
}
