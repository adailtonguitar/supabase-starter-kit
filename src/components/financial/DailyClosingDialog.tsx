interface DailyClosingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DailyClosingDialog({ open, onOpenChange }: DailyClosingDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => onOpenChange(false)}>
      <div className="bg-card rounded-xl p-6 border border-border max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-foreground mb-2">Fechamento Diário</h2>
        <p className="text-sm text-muted-foreground">Em desenvolvimento.</p>
        <button onClick={() => onOpenChange(false)} className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">Fechar</button>
      </div>
    </div>
  );
}
