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
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto..."
            autoFocus className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-muted-foreground" /></button>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 auto-rows-min content-start">
        {loading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground text-sm">Nenhum produto encontrado</div>
        ) : filtered.map(p => (
          <button key={p.id} onClick={() => onAddToCart(p)}
            className="flex flex-col items-start p-2.5 rounded-lg bg-card border border-border hover:border-primary/40 transition-all text-left h-auto">
            <span className="text-xs font-mono text-muted-foreground">{p.sku}</span>
            <span className="text-sm font-semibold text-foreground line-clamp-2 mt-0.5">{p.name}</span>
            <span className="text-sm font-bold text-primary font-mono mt-auto pt-1">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.price)}
            </span>
            <span className={`text-[10px] font-mono ${p.stock_quantity > 0 ? "text-muted-foreground" : "text-destructive"}`}>
              Est: {p.stock_quantity} {p.unit}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
