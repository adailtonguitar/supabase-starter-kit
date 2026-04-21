import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Search, X, Package, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

interface PDVProductGridProps {
  products: any[];
  loading: boolean;
  companyName: string | null;
  logoUrl: string | null;
  onAddToCart: (product: any) => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

// Limite de linhas renderizadas quando o campo de busca está vazio.
// Evita lag de render em lojas com 5k+ itens; se o usuário digitar,
// o filtro roda sobre a lista completa (sem slice).
const MAX_INITIAL_ROWS = 500;

export function PDVProductGrid({ products, loading, onAddToCart }: PDVProductGridProps) {
  const [search, setSearch] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) {
      return products.length > MAX_INITIAL_ROWS
        ? products.slice(0, MAX_INITIAL_ROWS)
        : products;
    }
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.includes(q)),
    );
  }, [products, search]);

  const isTruncated = !search.trim() && products.length > MAX_INITIAL_ROWS;

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIdx(0);
  }, [search]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${selectedIdx}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && filtered.length > 0) {
        e.preventDefault();
        onAddToCart(filtered[selectedIdx]);
      }
    },
    [filtered, selectedIdx, onAddToCart]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background" onKeyDown={handleKeyDown}>
      {/* ── Search bar ── */}
      <div className="px-3 sm:px-4 py-3 border-b-2 border-primary/20 bg-gradient-to-r from-primary/5 via-card to-primary/5 flex-shrink-0">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, SKU ou código de barras..."
            autoFocus
            className="w-full pl-10 pr-10 py-3 rounded-xl bg-background border-2 border-primary/30 text-foreground text-sm font-medium focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 placeholder:text-muted-foreground/50 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-destructive/10 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-2 px-1 gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {search
              ? `${filtered.length} de ${products.length} produto${products.length !== 1 ? "s" : ""}`
              : `${products.length} produto${products.length !== 1 ? "s" : ""} no estoque`}
          </span>
          {search ? (
            <span className="text-[10px] text-primary font-semibold">
              Buscando: "{search}"
            </span>
          ) : isTruncated ? (
            <span className="text-[10px] text-warning font-semibold">
              Exibindo primeiros {MAX_INITIAL_ROWS} — digite para filtrar
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0" ref={listRef}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">Carregando produtos...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Package className="w-10 h-10 text-muted-foreground/30" />
            <span className="text-sm text-muted-foreground">Nenhum produto encontrado</span>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-xs text-primary hover:underline font-medium"
              >
                Limpar busca
              </button>
            )}
          </div>
        ) : (
          <>
            {/* ── Mobile: Card layout ── */}
            <div className="sm:hidden">
              {filtered.map((p, idx) => {
                const isLowStock = p.stock_quantity > 0 && p.stock_quantity <= (p.min_stock || 5);
                const isOutOfStock = p.stock_quantity <= 0;
                return (
                  <motion.button
                    key={p.id}
                    data-idx={idx}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.3), duration: 0.15 }}
                    onClick={() => onAddToCart(p)}
                    className={`w-full text-left px-3 py-3 border-b border-border/40 active:scale-[0.98] transition-all ${
                      selectedIdx === idx
                        ? "bg-primary/20 ring-2 ring-primary ring-inset"
                        : isOutOfStock
                        ? "opacity-50 bg-destructive/5"
                        : "hover:bg-primary/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isOutOfStock
                          ? "bg-destructive/10"
                          : isLowStock
                          ? "bg-warning/10"
                          : "bg-primary/10"
                      }`}>
                        {isOutOfStock ? (
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                        ) : (
                          <Package className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                        <p className="text-[10px] font-mono text-muted-foreground/70 truncate">
                          {p.sku}
                          {p.barcode && ` · ${p.barcode}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 space-y-0.5">
                        <p className="text-sm font-black font-mono text-primary">
                          {formatCurrency(p.price)}
                        </p>
                        <p
                          className={`text-[10px] font-mono font-bold ${
                            isOutOfStock
                              ? "text-destructive"
                              : isLowStock
                              ? "text-warning"
                              : "text-muted-foreground"
                          }`}
                        >
                          {p.stock_quantity} {p.unit}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* ── Desktop: Elite table ── */}
            <table className="hidden sm:table w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm border-b-2 border-primary/15">
                <tr className="text-muted-foreground text-[10px] uppercase tracking-widest font-black">
                  <th className="px-4 py-2.5 text-left w-10">#</th>
                  <th className="px-4 py-2.5 text-left">Código</th>
                  <th className="px-4 py-2.5 text-left">Produto</th>
                  <th className="px-4 py-2.5 text-left">Categoria</th>
                  <th className="px-4 py-2.5 text-right">Preço</th>
                  <th className="px-4 py-2.5 text-right">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => {
                  const isLowStock = p.stock_quantity > 0 && p.stock_quantity <= (p.min_stock || 5);
                  const isOutOfStock = p.stock_quantity <= 0;
                  return (
                    <motion.tr
                      key={p.id}
                      data-idx={idx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(idx * 0.01, 0.2), duration: 0.1 }}
                      onClick={() => onAddToCart(p)}
                      className={`border-b border-border/30 cursor-pointer transition-all duration-150 ${
                        selectedIdx === idx
                          ? "bg-primary/20 ring-2 ring-primary ring-inset"
                          : isOutOfStock
                          ? "opacity-50 bg-destructive/5 hover:bg-destructive/10"
                          : idx % 2 === 0
                          ? "bg-card hover:bg-primary/10"
                          : "bg-muted/20 hover:bg-primary/10"
                      }`}
                    >
                      <td className="px-4 py-2 text-center text-[10px] text-muted-foreground font-mono">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-2 font-mono text-muted-foreground text-xs">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isOutOfStock ? "bg-destructive/10" : "bg-primary/10"
                          }`}>
                            <Package className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <span className="truncate max-w-[120px]">{p.sku}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 font-semibold text-foreground">
                        <span className="truncate block max-w-[250px]">{p.name}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {p.category || "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-black text-primary whitespace-nowrap">
                        {formatCurrency(p.price)}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
                            isOutOfStock
                              ? "bg-destructive/10 text-destructive"
                              : isLowStock
                              ? "bg-warning/10 text-warning"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {isLowStock && <AlertTriangle className="w-3 h-3" />}
                          {p.stock_quantity} {p.unit}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
