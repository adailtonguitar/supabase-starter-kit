import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Edit, Package, Upload, Trash2, FileText, ArrowUpDown, History, Zap } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { useProducts, useDeleteProduct, type Product } from "@/hooks/useProducts";

import { ProductFormDialog } from "@/components/stock/ProductFormDialog";
import { StockMovementDialog } from "@/components/stock/StockMovementDialog";
import { MovementHistoryDialog } from "@/components/stock/MovementHistoryDialog";
import { CSVImportDialog } from "@/components/stock/CSVImportDialog";

import { LowStockAlert } from "@/components/stock/LowStockAlert";
import { PriceHistoryDialog } from "@/components/stock/PriceHistoryDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Produtos() {
  const [search, setSearch] = useState("");
  const { data: products = [], isLoading } = useProducts();
  const deleteProduct = useDeleteProduct();
  

  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [movementProduct, setMovementProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [showImport, setShowImport] = useState(false);
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [priceHistoryProduct, setPriceHistoryProduct] = useState<Product | null>(null);


  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.includes(search))
  );

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleCloseForm = (open: boolean) => {
    setShowForm(open);
    if (!open) setEditingProduct(null);
  };

  const adaptedEditing = editingProduct;

  if (showForm) {
    return (
      <div className="p-3 sm:p-6 max-w-5xl mx-auto pb-10">
        <ProductFormDialog
          key={adaptedEditing?.id ?? "new"}
          open={showForm}
          onOpenChange={handleCloseForm}
          product={adaptedEditing as any}
        />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 w-full min-w-0">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Produtos & Estoque</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {products.length} produtos cadastrados
          </p>
        </div>
        <div data-tour="product-import" className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate("/importacao-nfe")}>
            <FileText className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Importar NF-e</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Importar CSV</span>
          </Button>
          <Button data-tour="product-add" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Novo Produto</span>
          </Button>
        </div>
      </motion.div>

      <LowStockAlert products={products as any} />

      {/* Search */}
      <div data-tour="product-search" className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por nome, SKU ou código de barras..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      </div>

      {/* Desktop table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="hidden md:block bg-card rounded-2xl card-shadow border border-border overflow-hidden min-w-0 max-w-full"
      >
        <div className="overflow-x-auto scrollbar-thin max-w-full">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[22%]">Produto</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[16%]">SKU</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[10%]">NCM</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[12%]">Categoria</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[10%]">Preço</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[10%]">Estoque</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[8%]">Mínimo</th>
                
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[12%]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-5 py-3" colSpan={8}><Skeleton className="h-8 w-full" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                    {products.length === 0
                      ? "Nenhum produto cadastrado. Clique em \"Novo Produto\" ou importe via CSV."
                      : "Nenhum produto encontrado para a busca."}
                  </td>
                </tr>
              ) : (
                filtered.map((product) => {
                  const isLow = product.min_stock != null && product.min_stock > 0 && product.stock_quantity <= product.min_stock;
                  return (
                    <tr
                      key={product.id}
                      className={`border-b border-border last:border-0 hover:bg-primary/[0.03] transition-colors ${filtered.indexOf(product) % 2 === 1 ? "bg-muted/15" : ""}`}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center overflow-hidden flex-shrink-0">
                            {product.image_url ? (
                              <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-4 h-4 text-accent-foreground" />
                            )}
                          </div>
                          <span className="font-medium text-foreground truncate">{product.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-muted-foreground truncate max-w-0">{product.sku}</td>
                      <td className="px-3 py-3 font-mono text-muted-foreground text-xs truncate">{product.ncm || "—"}</td>
                      <td className="px-3 py-3 text-muted-foreground truncate">{product.category || "—"}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-primary whitespace-nowrap">
                        {formatCurrency(product.price)}
                      </td>
                      <td className={`px-3 py-3 text-right font-mono font-semibold whitespace-nowrap ${isLow ? "text-destructive" : "text-foreground"}`}>
                        {product.stock_quantity} {product.unit.toLowerCase()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-muted-foreground whitespace-nowrap">
                        {product.min_stock ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                         <div className="flex items-center justify-center gap-0.5">
                          <button onClick={() => setMovementProduct(product)} title="Movimentar estoque" className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                             <ArrowUpDown className="w-4 h-4" />
                           </button>
                           <button onClick={() => setPriceHistoryProduct(product)} title="Histórico de preços" className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                             <History className="w-4 h-4" />
                           </button>
                          <button onClick={() => handleEdit(product)} title="Editar" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                             <Edit className="w-4 h-4" />
                           </button>
                           <button onClick={() => setDeleteTarget(product)} title="Excluir" className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                             <Trash2 className="w-4 h-4" />
                           </button>
                         </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {products.length === 0 ? "Nenhum produto cadastrado." : "Nenhum produto encontrado."}
          </div>
        ) : (
          filtered.map((product) => {
            const isLow = product.min_stock != null && product.min_stock > 0 && product.stock_quantity <= product.min_stock;
            return (
              <motion.div key={product.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: filtered.indexOf(product) * 0.03 }} className="bg-card rounded-2xl border border-border p-3 space-y-2 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0 overflow-hidden">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-4 h-4 text-accent-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
                    </div>
                  </div>
                  <span className="font-mono font-semibold text-primary text-sm shrink-0">
                    {formatCurrency(product.price)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className={`font-mono font-semibold ${isLow ? "text-destructive" : "text-foreground"}`}>
                      Est: {product.stock_quantity} {product.unit.toLowerCase()}
                    </span>
                    {product.category && <span>{product.category}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setMovementProduct(product)} className="p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all" title="Movimentar estoque">
                      <ArrowUpDown className="w-4 h-4" />
                    </button>
                    <button onClick={() => setPriceHistoryProduct(product)} className="p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all" title="Histórico de preços">
                      <History className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleEdit(product)} className="p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteTarget(product)} className="p-2.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-95 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {movementProduct && (
        <StockMovementDialog
          open={!!movementProduct}
          onOpenChange={(v) => !v && setMovementProduct(null)}
          product={movementProduct as any}
        />
      )}

      {historyProduct && (
        <MovementHistoryDialog
          open={!!historyProduct}
          onOpenChange={(v) => !v && setHistoryProduct(null)}
          productId={historyProduct.id}
          productName={historyProduct.name}
        />
      )}

      <CSVImportDialog open={showImport} onOpenChange={setShowImport} />
      

      {priceHistoryProduct && (
        <PriceHistoryDialog
          open={!!priceHistoryProduct}
          onOpenChange={(v) => !v && setPriceHistoryProduct(null)}
          productId={priceHistoryProduct.id}
          productName={priceHistoryProduct.name}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteProduct.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
