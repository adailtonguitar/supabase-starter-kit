interface SaleReceiptProps {
  items: any[];
  total: number;
  payments: any[];
  nfceNumber?: string;
  slogan?: string;
  logoUrl?: string;
  companyName?: string;
  onClose: () => void;
}

export function SaleReceipt({ total, onClose, companyName }: SaleReceiptProps) {
  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl p-6 w-full max-w-sm mx-4 text-center" onClick={e => e.stopPropagation()}>
        <div className="text-4xl mb-3">✅</div>
        <h2 className="text-xl font-bold text-foreground">Venda Finalizada!</h2>
        {companyName && <p className="text-sm text-muted-foreground mt-1">{companyName}</p>}
        <p className="text-3xl font-black text-primary font-mono mt-3">{formatCurrency(total)}</p>
        <button onClick={onClose} className="mt-6 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold">
          Nova Venda (ESC)
        </button>
      </div>
    </div>
  );
}
