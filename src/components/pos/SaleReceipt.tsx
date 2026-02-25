import { AlertTriangle } from "lucide-react";

interface SaleReceiptProps {
  items: any[];
  total: number;
  payments: any[];
  nfceNumber?: string;
  slogan?: string;
  logoUrl?: string;
  companyName?: string;
  isContingency?: boolean;
  onClose: () => void;
}

export function SaleReceipt({ total, onClose, companyName, nfceNumber, isContingency }: SaleReceiptProps) {
  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl p-6 w-full max-w-sm mx-4 text-center" onClick={e => e.stopPropagation()}>
        <div className="text-4xl mb-3">{isContingency ? "⚠️" : "✅"}</div>
        <h2 className="text-xl font-bold text-foreground">
          {isContingency ? "Venda em Contingência" : "Venda Finalizada!"}
        </h2>
        {companyName && <p className="text-sm text-muted-foreground mt-1">{companyName}</p>}
        <p className="text-3xl font-black text-primary font-mono mt-3">{formatCurrency(total)}</p>

        {isContingency && (
          <div className="mt-4 p-3 rounded-xl bg-warning/10 border border-warning/30 text-left">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-warning">EMITIDA EM CONTINGÊNCIA</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Esta venda será transmitida automaticamente à SEFAZ quando a conexão for restaurada. 
                  Prazo máximo: 24 horas.
                </p>
                {nfceNumber && (
                  <p className="text-xs font-mono text-muted-foreground mt-1">
                    Nº Contingência: {nfceNumber}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <button onClick={onClose} className="mt-6 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold">
          Nova Venda (ESC)
        </button>
      </div>
    </div>
  );
}
