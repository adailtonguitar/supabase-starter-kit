import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Package, Armchair, Eye, Grid3X3, List, Boxes, Palette, Plus, Trash2, Home, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import FichaTecnicaVisual, { type TechSpec } from "@/components/catalogo/FichaTecnicaVisual";
import { useTechSpecs } from "@/hooks/useTechSpecs";
import { useProductExtras, type Volume, type Variation, type FurnitureExtra } from "@/hooks/useProductExtras";
import SimuladorParcelas from "@/components/catalogo/SimuladorParcelas";
import EtiquetaShowroom from "@/components/catalogo/EtiquetaShowroom";

import imgSofa from "@/assets/furniture/sofa-3-lugares.jpg";
import imgMesa from "@/assets/furniture/mesa-jantar.jpg";
import imgCama from "@/assets/furniture/cama-casal.jpg";
import imgGuardaRoupa from "@/assets/furniture/guarda-roupa.jpg";
import imgRack from "@/assets/furniture/rack-tv.jpg";
import imgEscrivaninha from "@/assets/furniture/escrivaninha.jpg";
import AmbientesGallery from "@/components/catalogo/AmbientesGallery";

// Types re-exported from hook

// ── Demo data ──
const demoProducts = [
  { id: "demo-1", name: "Sofá 3 Lugares Couro", category: "Sala de Estar", price: 3299, cost_price: 1800, stock_quantity: 4, min_stock: 2, image_url: imgSofa, barcode: "7891234560001", unit: "un", sku: "SOF-001", company_id: "demo", is_active: true },
  { id: "demo-2", name: "Mesa de Jantar 6 Lugares", category: "Sala de Jantar", price: 2499, cost_price: 1200, stock_quantity: 3, min_stock: 1, image_url: imgMesa, barcode: "7891234560002", unit: "un", sku: "MES-001", company_id: "demo", is_active: true },
  { id: "demo-3", name: "Cama Box Casal Queen", category: "Quarto", price: 4599, cost_price: 2500, stock_quantity: 5, min_stock: 2, image_url: imgCama, barcode: "7891234560003", unit: "un", sku: "CAM-001", company_id: "demo", is_active: true },
  { id: "demo-4", name: "Guarda-Roupa 4 Portas", category: "Quarto", price: 3899, cost_price: 2100, stock_quantity: 2, min_stock: 1, image_url: imgGuardaRoupa, barcode: "7891234560004", unit: "un", sku: "GUA-001", company_id: "demo", is_active: true },
  { id: "demo-5", name: "Rack para TV 180cm", category: "Sala de Estar", price: 1899, cost_price: 950, stock_quantity: 6, min_stock: 2, image_url: imgRack, barcode: "7891234560005", unit: "un", sku: "RAC-001", company_id: "demo", is_active: true },
  { id: "demo-6", name: "Escrivaninha Home Office", category: "Escritório", price: 1599, cost_price: 800, stock_quantity: 8, min_stock: 3, image_url: imgEscrivaninha, barcode: "7891234560006", unit: "un", sku: "ESC-001", company_id: "demo", is_active: true },
];

// Pre-populate demo extras
const defaultDemoExtras: Record<string, FurnitureExtra> = {
  "demo-1": {
    volumes: [{ id: "v1", label: "Estrutura do sofá", dimensions: "200x90x80cm", weight: "45kg" }, { id: "v2", label: "Almofadas", dimensions: "100x60x40cm", weight: "12kg" }],
    variations: [{ id: "var1", type: "cor", value: "Marrom Caramelo" }, { id: "var2", type: "cor", value: "Preto" }, { id: "var3", type: "tecido", value: "Couro Sintético" }, { id: "var4", type: "tecido", value: "Couro Natural", priceAdjust: 800 }],
  },
  "demo-3": {
    volumes: [{ id: "v1", label: "Cabeceira", dimensions: "160x120x15cm", weight: "25kg" }, { id: "v2", label: "Base Box", dimensions: "160x200x30cm", weight: "35kg" }, { id: "v3", label: "Colchão", dimensions: "160x200x28cm", weight: "30kg" }],
    variations: [{ id: "var1", type: "cor", value: "Cinza" }, { id: "var2", type: "cor", value: "Bege" }, { id: "var3", type: "tamanho", value: "Queen (158x198)" }, { id: "var4", type: "tamanho", value: "King (193x203)", priceAdjust: 1200 }],
  },
  "demo-4": {
    volumes: [{ id: "v1", label: "Corpo lateral esquerdo", dimensions: "220x60x50cm", weight: "40kg" }, { id: "v2", label: "Corpo lateral direito", dimensions: "220x60x50cm", weight: "40kg" }, { id: "v3", label: "Portas e prateleiras", dimensions: "220x60x20cm", weight: "25kg" }, { id: "v4", label: "Kit ferragens", dimensions: "30x20x15cm", weight: "5kg" }],
    variations: [{ id: "var1", type: "cor", value: "Branco" }, { id: "var2", type: "cor", value: "Carvalho" }],
  },
};

const variationTypeLabels: Record<string, string> = { cor: "Cor", tecido: "Tecido", tamanho: "Tamanho" };
const variationTypeIcons: Record<string, string> = { cor: "🎨", tecido: "🧵", tamanho: "📐" };

export default function CatalogoMoveis() {
  const [searchParams] = useSearchParams();
  const { data: realProducts = [], isLoading: loading } = useProducts();
  const products = useMemo(() => [...realProducts, ...demoProducts], [realProducts]);
  const [search, setSearch] = useState("");
  const [mainTab, setMainTab] = useState<"catalogo" | "ambientes">("catalogo");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const { getExtras, updateExtras } = useProductExtras();
  const { allSpecs: specs } = useTechSpecs();

  // Volume/Variation editing
  const [editVolDialog, setEditVolDialog] = useState(false);
  const [editVarDialog, setEditVarDialog] = useState(false);
  const [volForm, setVolForm] = useState({ label: "", dimensions: "", weight: "" });
  const [varForm, setVarForm] = useState({ type: "cor" as "cor" | "tecido" | "tamanho", value: "", priceAdjust: "" });

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search);
      const matchesCat = categoryFilter === "all" || p.category === categoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [products, search, categoryFilter]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const addVolume = () => {
    if (!volForm.label || !selectedProduct) return;
    const vol: Volume = { id: crypto.randomUUID(), ...volForm };
    const cur = getExtras(selectedProduct.id);
    updateExtras(selectedProduct.id, { volumes: [...cur.volumes, vol] });
    setVolForm({ label: "", dimensions: "", weight: "" });
    setEditVolDialog(false);
    toast.success("Volume adicionado");
  };

  const removeVolume = (volId: string) => {
    if (!selectedProduct) return;
    const cur = getExtras(selectedProduct.id);
    updateExtras(selectedProduct.id, { volumes: cur.volumes.filter(v => v.id !== volId) });
  };

  const addVariation = () => {
    if (!varForm.value || !selectedProduct) return;
    const v: Variation = { id: crypto.randomUUID(), type: varForm.type, value: varForm.value, priceAdjust: varForm.priceAdjust ? Number(varForm.priceAdjust) : undefined };
    const cur = getExtras(selectedProduct.id);
    updateExtras(selectedProduct.id, { variations: [...cur.variations, v] });
    setVarForm({ type: "cor", value: "", priceAdjust: "" });
    setEditVarDialog(false);
    toast.success("Variação adicionada");
  };

  const removeVariation = (varId: string) => {
    if (!selectedProduct) return;
    const cur = getExtras(selectedProduct.id);
    updateExtras(selectedProduct.id, { variations: cur.variations.filter(v => v.id !== varId) });
  };

  const selectedExtras = selectedProduct ? getExtras(selectedProduct.id) : { volumes: [], variations: [] };
  const selectedSpec = selectedProduct ? (specs[selectedProduct.id] || {}) : {};

  // Handle ?produto=ID deep link
  useEffect(() => {
    const produtoId = searchParams.get("produto");
    if (produtoId && products.length > 0 && !selectedProduct) {
      const found = products.find(p => p.id === produtoId || p.barcode === produtoId || p.sku === produtoId);
      if (found) setSelectedProduct(found);
    }
  }, [searchParams, products, selectedProduct]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Armchair className="w-6 h-6 text-primary" />
            Catálogo de Móveis
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Visualize e gerencie seu catálogo de produtos</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={mainTab === "catalogo" ? "default" : "outline"} size="sm" onClick={() => setMainTab("catalogo")}>
            <Grid3X3 className="w-4 h-4 mr-1" />Produtos
          </Button>
          <Button variant={mainTab === "ambientes" ? "default" : "outline"} size="sm" onClick={() => setMainTab("ambientes")}>
            <Home className="w-4 h-4 mr-1" />Ambientes
          </Button>
          {mainTab === "catalogo" && (
            <>
              <Button variant={viewMode === "grid" ? "default" : "outline"} size="icon" onClick={() => setViewMode("grid")}><Grid3X3 className="w-4 h-4" /></Button>
              <Button variant={viewMode === "list" ? "default" : "outline"} size="icon" onClick={() => setViewMode("list")}><List className="w-4 h-4" /></Button>
            </>
          )}
        </div>
      </div>

      {mainTab === "ambientes" ? (
        <AmbientesGallery />
      ) : (
      <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou código..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Total de Itens</p>
          <p className="text-2xl font-bold mt-1">{filtered.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Em Estoque</p>
          <p className="text-2xl font-bold mt-1">{filtered.filter(p => (p.stock_quantity || 0) > 0).length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Categorias</p>
          <p className="text-2xl font-bold mt-1">{categories.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Valor Total Estoque</p>
          <p className="text-lg font-bold mt-1">{fmt(filtered.reduce((s, p) => s + (p.price || 0) * (p.stock_quantity || 0), 0))}</p>
        </CardContent></Card>
      </div>

      {/* Product Grid/List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Nenhum produto encontrado</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((product, i) => {
              const ex = getExtras(product.id);
              return (
                <motion.div key={product.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.02 }}>
                  <Card className="cursor-pointer hover:border-primary/30 hover:shadow-md transition-all group overflow-hidden" onClick={() => setSelectedProduct(product)}>
                    <div className="aspect-[4/3] bg-muted/30 flex items-center justify-center relative">
                      {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" /> : <Armchair className="w-16 h-16 text-muted-foreground/20" />}
                      <div className="absolute top-2 right-2 flex gap-1">
                        {ex.volumes.length > 0 && <Badge variant="secondary" className="text-[10px]"><Boxes className="w-3 h-3 mr-0.5" />{ex.volumes.length} vol.</Badge>}
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
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {product.category && <span className="text-xs text-muted-foreground">{product.category}</span>}
                        {ex.variations.length > 0 && <Badge variant="outline" className="text-[9px] ml-auto"><Palette className="w-2.5 h-2.5 mr-0.5" />{ex.variations.length} var.</Badge>}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-lg font-bold text-primary">{fmt(product.price || 0)}</p>
                        {product.cost_price && <p className="text-xs text-muted-foreground">Custo: {fmt(product.cost_price)}</p>}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(product => {
            const ex = getExtras(product.id);
            return (
              <Card key={product.id} className="cursor-pointer hover:border-primary/30 transition-all" onClick={() => setSelectedProduct(product)}>
                <CardContent className="p-3 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg bg-muted/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" /> : <Armchair className="w-8 h-8 text-muted-foreground/20" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{product.name}</p>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">{product.category || "Sem categoria"}</span>
                      {ex.volumes.length > 0 && <Badge variant="secondary" className="text-[9px]">{ex.volumes.length} vol.</Badge>}
                      {ex.variations.length > 0 && <Badge variant="outline" className="text-[9px]">{ex.variations.length} var.</Badge>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">{fmt(product.price || 0)}</p>
                    <Badge variant={product.stock_quantity > 0 ? "outline" : "destructive"} className="text-[10px] mt-1">{product.stock_quantity || 0} un.</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Product Detail Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
                <TabsList className="w-full flex-wrap h-auto gap-1">
                  <TabsTrigger value="info" className="flex-1">Info</TabsTrigger>
                  <TabsTrigger value="ficha" className="flex-1">
                    <Ruler className="w-3.5 h-3.5 mr-1" />Ficha Técnica
                  </TabsTrigger>
                  <TabsTrigger value="volumes" className="flex-1">
                    <Boxes className="w-3.5 h-3.5 mr-1" />Volumes ({selectedExtras.volumes.length})
                  </TabsTrigger>
                  <TabsTrigger value="variations" className="flex-1">
                    <Palette className="w-3.5 h-3.5 mr-1" />Variações ({selectedExtras.variations.length})
                  </TabsTrigger>
                </TabsList>

                {/* Info Tab */}
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
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Estoque</p>
                      <p className="text-lg font-bold">{selectedProduct.stock_quantity || 0} un.</p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Valor em Estoque</p>
                      <p className="text-lg font-bold text-primary">{fmt((selectedProduct.price || 0) * (selectedProduct.stock_quantity || 0))}</p>
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
                  {/* Simulador de Parcelas + Etiqueta */}
                  <SimuladorParcelas total={selectedProduct.price || 0} className="mt-2" />
                  <div className="flex gap-2 mt-2">
                    <EtiquetaShowroom product={selectedProduct} spec={selectedSpec} />
                  </div>
                </TabsContent>

                {/* Ficha Técnica Tab */}
                <TabsContent value="ficha" className="space-y-3 mt-3">
                  {Object.keys(selectedSpec).length > 0 ? (
                    <FichaTecnicaVisual spec={selectedSpec} />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Ruler className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Ficha técnica não cadastrada para este produto</p>
                      <p className="text-xs mt-1">Os produtos demo possuem fichas técnicas de exemplo</p>
                    </div>
                  )}
                </TabsContent>

                {/* Volumes Tab */}
                <TabsContent value="volumes" className="space-y-3 mt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Caixas/volumes que compõem este móvel</p>
                    <Button size="sm" variant="outline" onClick={() => setEditVolDialog(true)} className="gap-1">
                      <Plus className="w-3.5 h-3.5" /> Adicionar
                    </Button>
                  </div>
                  {selectedExtras.volumes.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      <Boxes className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      Nenhum volume cadastrado
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedExtras.volumes.map((vol, i) => (
                        <div key={vol.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{vol.label}</p>
                            <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                              {vol.dimensions && <span>📏 {vol.dimensions}</span>}
                              {vol.weight && <span>⚖️ {vol.weight}</span>}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeVolume(vol.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-sm font-medium">Total: {selectedExtras.volumes.length} volume{selectedExtras.volumes.length > 1 ? "s" : ""}</p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Variations Tab */}
                <TabsContent value="variations" className="space-y-3 mt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Opções de cor, tecido e tamanho</p>
                    <Button size="sm" variant="outline" onClick={() => setEditVarDialog(true)} className="gap-1">
                      <Plus className="w-3.5 h-3.5" /> Adicionar
                    </Button>
                  </div>
                  {selectedExtras.variations.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      <Palette className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      Nenhuma variação cadastrada
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(["cor", "tecido", "tamanho"] as const).map(type => {
                        const items = selectedExtras.variations.filter(v => v.type === type);
                        if (items.length === 0) return null;
                        return (
                          <div key={type}>
                            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                              {variationTypeIcons[type]} {variationTypeLabels[type]}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {items.map(v => (
                                <div key={v.id} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm group">
                                  <span>{v.value}</span>
                                  {v.priceAdjust && <span className="text-xs text-primary font-medium">+{fmt(v.priceAdjust)}</span>}
                                  <button onClick={() => removeVariation(v.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive ml-1">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Volume Dialog */}
      <Dialog open={editVolDialog} onOpenChange={setEditVolDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adicionar Volume</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome do volume *</Label><Input value={volForm.label} onChange={e => setVolForm({ ...volForm, label: e.target.value })} placeholder="Ex: Caixa 1, Kit Ferragens" /></div>
            <div><Label>Dimensões</Label><Input value={volForm.dimensions} onChange={e => setVolForm({ ...volForm, dimensions: e.target.value })} placeholder="Ex: 120x60x40cm" /></div>
            <div><Label>Peso</Label><Input value={volForm.weight} onChange={e => setVolForm({ ...volForm, weight: e.target.value })} placeholder="Ex: 25kg" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditVolDialog(false)}>Cancelar</Button>
            <Button onClick={addVolume}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Variation Dialog */}
      <Dialog open={editVarDialog} onOpenChange={setEditVarDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adicionar Variação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={varForm.type} onValueChange={v => setVarForm({ ...varForm, type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cor">🎨 Cor</SelectItem>
                  <SelectItem value="tecido">🧵 Tecido</SelectItem>
                  <SelectItem value="tamanho">📐 Tamanho</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Valor *</Label><Input value={varForm.value} onChange={e => setVarForm({ ...varForm, value: e.target.value })} placeholder="Ex: Marrom, Linho, King" /></div>
            <div><Label>Ajuste de preço (opcional)</Label><Input type="number" value={varForm.priceAdjust} onChange={e => setVarForm({ ...varForm, priceAdjust: e.target.value })} placeholder="Ex: 500 (adicional)" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditVarDialog(false)}>Cancelar</Button>
            <Button onClick={addVariation}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
      )}
    </div>
  );
}
