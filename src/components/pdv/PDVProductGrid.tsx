import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";

interface PDVProductGridProps {
  products: any[];
  loading: boolean;
  companyName: string | null;
  logoUrl: string | null;
  onAddToCart: (product: any) => void;
}

export function PDVProductGrid({ products, loading, onAddToCart }: PDVProductGridProps) {
  const [search, setSearch] = useState("");
  
  const filtered = useMemo(() => {
    if (!search.trim()) return products.slice(0, 50);
    const q = search.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.sku.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.includes(q))
    ).slice(0, 50);
  }, [products, search]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-2 sm:p-3 border-b border-border flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto..."
            autoFocus className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-muted-foreground" /></button>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum produto encontrado</div>
        ) : (
          <>
            {/* Mobile: card layout */}
            <div className="sm:hidden divide-y divide-border/50">
              {filtered.map(p => (
                <button key={p.id} onClick={() => onAddToCart(p)}
                  className="w-full text-left px-3 py-2.5 hover:bg-primary/10 active:scale-[0.98] transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground truncate">{p.sku}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-mono font-semibold text-primary">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.price)}
                      </p>
                      <p className={`text-[10px] font-mono ${p.stock_quantity > 0 ? "text-muted-foreground" : "text-destructive"}`}>
                        Est: {p.stock_quantity} {p.unit}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop: table layout */}
            <table className="hidden sm:table w-full text-sm">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr className="text-left text-muted-foreground text-xs">
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Produto</th>
                  <th className="px-3 py-2 font-medium text-right">Preço</th>
                  <th className="px-3 py-2 font-medium text-right">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} onClick={() => onAddToCart(p)}
                    className="border-b border-border/50 hover:bg-primary/10 cursor-pointer transition-colors">
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{p.sku}</td>
                    <td className="px-3 py-1.5 font-medium text-foreground">{p.name}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-primary font-semibold whitespace-nowrap">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.price)}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono whitespace-nowrap ${p.stock_quantity > 0 ? "text-muted-foreground" : "text-destructive"}`}>
                      {p.stock_quantity} {p.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
