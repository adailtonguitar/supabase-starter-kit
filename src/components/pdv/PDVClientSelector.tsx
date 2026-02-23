export interface CreditClient {
  id: string;
  name: string;
  cpf?: string;
  credit_limit?: number;
  credit_used?: number;
}

interface PDVClientSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (client: CreditClient, mode: "fiado" | "parcelado", installments: number) => void;
  saleTotal: number;
}

export function PDVClientSelector({ open, onClose }: PDVClientSelectorProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-foreground mb-2">Venda a Prazo</h2>
        <p className="text-sm text-muted-foreground">Módulo de crédito em desenvolvimento.</p>
        <button onClick={onClose} className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Fechar</button>
      </div>
    </div>
  );
}
