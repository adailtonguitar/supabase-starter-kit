interface PDVReceiveCreditDialogProps {
  open: boolean;
  onClose: () => void;
}

export function PDVReceiveCreditDialog({ open, onClose }: PDVReceiveCreditDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-foreground mb-2">Receber Crédito</h2>
        <p className="text-sm text-muted-foreground">Módulo de recebimento em desenvolvimento.</p>
        <button onClick={onClose} className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Fechar</button>
      </div>
    </div>
  );
}
