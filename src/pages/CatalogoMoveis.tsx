import { useState, useMemo } from "react";
import { useProducts } from "@/hooks/useProducts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Package, Palette, Ruler, Armchair, Eye, Plus, Grid3X3, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function CatalogoMoveis() {
  const { data: products = [], isLoading: loading } = useProducts();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [products]);

  const filtered = useMemo(() => {
    if (!products) return [];
    return products.filter(p => {
      const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search);
      const matchesCat = categoryFilter === "all" || p.category === categoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [products, search, categoryFilter]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Armchair className="w-6 h-6 text-primary" />
            Catálogo de Móveis
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visualize e gerencie seu catálogo de produtos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("grid")}
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat!}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Total de Itens</p>
            <p className="text-2xl font-bold mt-1">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Em Estoque</p>
            <p className="text-2xl font-bold mt-1">
              {filtered.filter(p => (p.stock_quantity || 0) > 0).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Categorias</p>
            <p className="text-2xl font-bold mt-1">{categories.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Valor Total Estoque</p>
            <p className="text-lg font-bold mt-1">
              {fmt(filtered.reduce((s, p) => s + (p.price || 0) * (p.stock_quantity || 0), 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Product Grid/List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum produto encontrado</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.02 }}
              >
                <Card
                  className="cursor-pointer hover:border-primary/30 hover:shadow-md transition-all group overflow-hidden"
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="aspect-[4/3] bg-muted/30 flex items-center justify-center relative">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <Armchair className="w-16 h-16 text-muted-foreground/20" />
                    )}
                    <div className="absolute top-2 right-2">
                      <Badge variant={product.stock_quantity > 0 ? "default" : "destructive"} className="text-[10px]">
                        {product.stock_quantity > 0 ? `${product.stock_quantity} un.` : "Sem estoque"}
                      </Badge>
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <p className="font-semibold text-sm truncate">{product.name}</p>
                    {product.category && (
                      <p className="text-xs text-muted-foreground mt-0.5">{product.category}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-lg font-bold text-primary">{fmt(product.price || 0)}</p>
                      {product.cost_price && (
                        <p className="text-xs text-muted-foreground">
                          Custo: {fmt(product.cost_price)}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(product => (
            <Card
              key={product.id}
              className="cursor-pointer hover:border-primary/30 transition-all"
              onClick={() => setSelectedProduct(product)}
            >
              <CardContent className="p-3 flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg bg-muted/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <Armchair className="w-8 h-8 text-muted-foreground/20" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.category || "Sem categoria"}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">{fmt(product.price || 0)}</p>
                  <Badge variant={product.stock_quantity > 0 ? "outline" : "destructive"} className="text-[10px] mt-1">
                    {product.stock_quantity || 0} un.
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Product Detail Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Armchair className="w-5 h-5 text-primary" />
              {selectedProduct?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-4">
              {selectedProduct.image_url && (
                <div className="aspect-video rounded-lg overflow-hidden bg-muted/30">
                  <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full h-full object-cover" />
                </div>
              )}
              <Tabs defaultValue="info">
                <TabsList className="w-full">
                  <TabsTrigger value="info" className="flex-1">Informações</TabsTrigger>
                  <TabsTrigger value="stock" className="flex-1">Estoque</TabsTrigger>
                </TabsList>
                <TabsContent value="info" className="space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Preço de Venda</p>
                      <p className="text-lg font-bold text-primary">{fmt(selectedProduct.price || 0)}</p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Custo</p>
                      <p className="text-lg font-bold">{fmt(selectedProduct.cost_price || 0)}</p>
                    </div>
                  </div>
                  {selectedProduct.category && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Categoria:</span>
                      <Badge variant="secondary">{selectedProduct.category}</Badge>
                    </div>
                  )}
                  {selectedProduct.barcode && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Código:</span>
                      <span className="text-sm font-mono">{selectedProduct.barcode}</span>
                    </div>
                  )}
                  {selectedProduct.description && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Descrição</p>
                      <p className="text-sm">{selectedProduct.description}</p>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="stock" className="space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Estoque Atual</p>
                      <p className="text-2xl font-bold">{selectedProduct.stock_quantity || 0}</p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Estoque Mínimo</p>
                      <p className="text-2xl font-bold">{selectedProduct.min_stock || 0}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Valor em Estoque (Venda)</p>
                    <p className="text-xl font-bold text-primary">
                      {fmt((selectedProduct.price || 0) * (selectedProduct.stock_quantity || 0))}
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
