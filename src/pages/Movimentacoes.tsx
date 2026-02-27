import { useState, useMemo } from "react";
import { ArrowUpDown, Search, Package, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStockMovements } from "@/hooks/useStockMovements";
import { useProducts, type Product } from "@/hooks/useProducts";
import { BatchMovementMode } from "@/components/stock/BatchMovementMode";
import { StockMovementDialog } from "@/components/stock/StockMovementDialog";

const typeLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  entrada: { label: "Entrada", variant: "default" },
  saida: { label: "Saída", variant: "destructive" },
  ajuste: { label: "Ajuste", variant: "outline" },
  venda: { label: "Venda", variant: "secondary" },
  devolucao: { label: "Devolução", variant: "default" },
};

export default function Movimentacoes() {
  const { data: movements = [], isLoading } = useStockMovements();
  const { data: products = [] } = useProducts();
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [movementProduct, setMovementProduct] = useState<Product | null>(null);

  const getProductName = (m: any) => {
    return m.products?.name ?? products.find((p) => p.id === m.product_id)?.name ?? "—";
  };
  const getProductSku = (m: any) => {
    return m.products?.sku ?? products.find((p) => p.id === m.product_id)?.sku ?? "";
  };

  const filtered = movements.filter((m: any) => {
    const name = getProductName(m).toLowerCase();
    const sku = getProductSku(m).toLowerCase();
    return name.includes(search.toLowerCase()) || sku.includes(search.toLowerCase());
  });

  if (batchMode) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <BatchMovementMode products={products as any} onClose={() => setBatchMode(false)} />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <ArrowUpDown className="w-5 h-5 sm:w-6 sm:h-6" />
            Movimentações de Estoque
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Histórico completo de entradas, saídas e ajustes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { setProductSearch(""); setShowNewEntry(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Entrada
          </Button>
          <Button variant="outline" size="sm" onClick={() => setBatchMode(true)}>
            <ArrowUpDown className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Movimentação em </span>Lote
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma movimentação encontrada.</div>
        ) : (
          filtered.map((m: any) => {
            const info = typeLabels[m.type] || { label: m.type, variant: "secondary" as const };
            return (
              <div key={m.id} className="bg-card rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      {getProductName(m)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(m.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <Badge variant={info.variant} className="text-[10px] shrink-0">{info.label}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground pt-2 border-t border-border">
                  <span>Qtd: <strong className="text-foreground font-mono">{m.quantity}</strong></span>
                  <span>Ant: <strong className="text-foreground font-mono">{m.previous_stock}</strong></span>
                  <span>Novo: <strong className="text-foreground font-mono">{m.new_stock}</strong></span>
                </div>
                {m.reason && <p className="text-xs text-muted-foreground truncate">{m.reason}</p>}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden sm:block bg-card rounded-xl card-shadow border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Data</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Produto</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Tipo</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Qtd</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Anterior</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Novo</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={7} className="px-5 py-3"><Skeleton className="h-8 w-full" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                    Nenhuma movimentação encontrada.
                  </td>
                </tr>
              ) : (
                filtered.map((m: any) => {
                  const info = typeLabels[m.type] || { label: m.type, variant: "secondary" as const };
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {new Date(m.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-5 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-muted-foreground" />
                          {getProductName(m)}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <Badge variant={info.variant}>{info.label}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right font-mono">{m.quantity}</td>
                      <td className="px-5 py-3 text-right font-mono text-muted-foreground">{m.previous_stock}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold">{m.new_stock}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{m.reason || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {showNewEntry && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl border border-border p-6 w-full max-w-xl max-h-[85vh] flex flex-col space-y-4">
            <h2 className="text-lg font-bold text-foreground">Selecione o Produto</h2>
            <input
              type="text"
              placeholder="Buscar produto..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {products
                .filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || (p.sku || '').toLowerCase().includes(productSearch.toLowerCase()))
                .slice(0, 30)
                .map(p => (
                  <button
                    key={p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setShowNewEntry(false);
                      setTimeout(() => setMovementProduct(p), 50);
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg hover:bg-muted/50 text-sm text-foreground flex justify-between items-center cursor-pointer transition-colors"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-3">Estoque: {p.stock_quantity}</span>
                  </button>
                ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setShowNewEntry(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {movementProduct && (
        <StockMovementDialog
          open={!!movementProduct}
          onOpenChange={(v) => !v && setMovementProduct(null)}
          product={movementProduct as any}
        />
      )}
    </div>
  );
}
