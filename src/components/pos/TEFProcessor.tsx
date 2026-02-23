export interface TEFResult {
  method: string;
  approved: boolean;
  amount: number;
  nsu?: string;
  authCode?: string;
  cardBrand?: string;
  cardLastDigits?: string;
  installments?: number;
  changeAmount?: number;
  pixTxId?: string;
}

interface TEFProcessorProps {
  total: number;
  onComplete: (results: TEFResult[]) => void;
  onCancel: () => void;
  onPrazoRequested?: () => void;
  defaultMethod?: string | null;
  pixConfig?: any;
  tefConfig?: any;
}

export function TEFProcessor({ total, onComplete, onCancel, defaultMethod }: TEFProcessorProps) {
  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const handlePayment = (method: string) => {
    onComplete([{ method, approved: true, amount: total }]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card rounded-2xl border border-border shadow-2xl p-6 w-full max-w-md mx-4 space-y-4">
        <h2 className="text-xl font-bold text-foreground text-center">Pagamento</h2>
        <p className="text-3xl font-black text-primary font-mono text-center">{formatCurrency(total)}</p>
        <div className="grid grid-cols-2 gap-3">
          {["dinheiro", "debito", "credito", "pix"].map(m => (
            <button key={m} onClick={() => handlePayment(m)}
              className={`py-3 rounded-xl font-bold text-sm capitalize transition-all ${
                defaultMethod === m ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent"
              }`}>
              {m}
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted">
          Cancelar
        </button>
      </div>
    </div>
  );
}
