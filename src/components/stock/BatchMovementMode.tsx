import { useState, useMemo, useCallback } from "react";
import { Search, Save, PackagePlus, PackageMinus, DollarSign, X, ArrowUpDown, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { useCreateStockMovement } from "@/hooks/useStockMovements";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { recordPriceChanges } from "@/lib/price-history";

interface BatchProduct {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  price: number;
  cost_price?: number;
  stock_quantity: number;
  unit: string;
}

interface Props {
  products: BatchProduct[];
  onClose: () => void;
}

type TabMode = "entrada" | "saida" | "preco";

interface StockEntry {
  quantity: number;
  unit_cost?: number;
  reference?: string;
}

interface PriceEntry {
  price?: number;
  cost_price?: number;
}

export function BatchMovementMode({ products, onClose }: Props) {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabMode>("entrada");
  const [search, setSearch] = useState("");
  const [stockEntries, setStockEntries] = useState<Record<string, StockEntry>>({});
  const [priceEntries, setPriceEntries] = useState<Record<string, PriceEntry>>({});
  const [saving, setSaving] = useState(false);
  const [globalMargin, setGlobalMargin] = useState<string>("");

  const applyGlobalMargin = useCallback(() => {
    const margin = parseFloat(globalMargin);
    if (isNaN(margin) || margin <= 0) {
      toast.warning("Informe uma margem válida (ex: 30 para 30%)");
      return;
    }
    const newEntries: Record<string, PriceEntry> = { ...priceEntries };
    for (const p of products) {
      const cost = p.cost_price ?? 0;
      if (cost > 0) {
        const newPrice = Math.round(cost * (1 + margin / 100) * 100) / 100;
        newEntries[p.id] = { ...newEntries[p.id], price: newPrice };
      }
    }
    setPriceEntries(newEntries);
    toast.success(`Margem de ${margin}% aplicada a ${Object.keys(newEntries).length} produto(s)`);
  }, [globalMargin, priceEntries, products]);

  const createMovement = useCreateStockMovement();

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase()) ||
          (p.barcode && p.barcode.includes(search))
      ),
    [products, search]
  );

  const stockCount = Object.values(stockEntries).filter((e) => e.quantity > 0).length;
  const priceCount = Object.values(priceEntries).filter(
    (e) => e.price !== undefined || e.cost_price !== undefined
  ).length;
  const pendingCount = tab === "preco" ? priceCount : stockCount;

  const updateStockEntry = (productId: string, field: keyof StockEntry, value: string) => {
    setStockEntries((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: field === "reference" ? value : (parseFloat(value) || 0),
      },
    }));
  };

  const [marginEntries, setMarginEntries] = useState<Record<string, string>>({});

  const updatePriceEntry = (productId: string, field: keyof PriceEntry, value: string) => {
    const num = parseFloat(value);
    setPriceEntries((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: isNaN(num) ? undefined : num,
      },
    }));
  };

  const updateMarginForProduct = (productId: string, marginStr: string, cost: number) => {
    setMarginEntries((prev) => ({ ...prev, [productId]: marginStr }));
    const margin = parseFloat(marginStr);
    if (!isNaN(margin) && cost > 0) {
      const newPrice = Math.round(cost * (1 + margin / 100) * 100) / 100;
      setPriceEntries((prev) => ({
        ...prev,
        [productId]: { ...prev[productId], price: newPrice },
      }));
    }
  };

  const handleSaveStock = async (type: "entrada" | "saida") => {
    const entries = Object.entries(stockEntries).filter(([, e]) => e.quantity > 0);
    if (entries.length === 0) {
      toast.warning("Nenhuma movimentação para salvar");
      return;
    }

    setSaving(true);
    let success = 0;
    let errors = 0;

    for (const [productId, entry] of entries) {
      try {
        await createMovement.mutateAsync({
          product_id: productId,
          type,
          quantity: entry.quantity,
          unit_cost: type === "entrada" ? entry.unit_cost : undefined,
          reference: entry.reference,
        });
        success++;
      } catch {
        errors++;
      }
    }

    setSaving(false);
    setStockEntries({});

    const label = type === "entrada" ? "entrada(s)" : "saída(s)";
    if (errors === 0) {
      toast.success(`${success} ${label} de estoque registrada(s)`);
    } else {
      toast.warning(`${success} registradas, ${errors} com erro`);
    }
  };

  const handleSavePrices = async () => {
    const entries = Object.entries(priceEntries).filter(
      ([, e]) => e.price !== undefined || e.cost_price !== undefined
    );
    if (entries.length === 0) {
      toast.warning("Nenhuma alteração de preço para salvar");
      return;
    }

    setSaving(true);
    let success = 0;
    let errors = 0;
    const priceChanges: Array<{ company_id: string; product_id: string; field_changed: "price" | "cost_price"; old_value: number; new_value: number; changed_by?: string | null; source: "batch" }> = [];

    for (const [productId, entry] of entries) {
      try {
        const product = products.find((p) => p.id === productId);
        const updates: Record<string, number> = {};
        if (entry.price !== undefined) updates.price = entry.price;
        if (entry.cost_price !== undefined) updates.cost_price = entry.cost_price;
        const { error } = await supabase.from("products").update(updates).eq("id", productId);
        if (error) throw error;
        success++;

        // Collect price changes for history
        if (companyId && product) {
          if (entry.price !== undefined && entry.price !== product.price) {
            priceChanges.push({ company_id: companyId, product_id: productId, field_changed: "price", old_value: product.price, new_value: entry.price, changed_by: user?.id, source: "batch" });
          }
          if (entry.cost_price !== undefined && entry.cost_price !== (product.cost_price ?? 0)) {
            priceChanges.push({ company_id: companyId, product_id: productId, field_changed: "cost_price", old_value: product.cost_price ?? 0, new_value: entry.cost_price, changed_by: user?.id, source: "batch" });
          }
        }
      } catch {
        errors++;
      }
    }

    // Record all price changes in batch
    if (priceChanges.length > 0) {
      recordPriceChanges(priceChanges);
    }

    setSaving(false);
    setPriceEntries({});

    if (errors === 0) {
      toast.success(`${success} preço(s) atualizado(s)`);
    } else {
      toast.warning(`${success} atualizados, ${errors} com erro`);
    }
  };

  const handleSave = () => {
    if (tab === "entrada") handleSaveStock("entrada");
    else if (tab === "saida") handleSaveStock("saida");
    else handleSavePrices();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <ArrowUpDown className="w-5 h-5 text-primary shrink-0" />
          <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">Modo Movimentações</h2>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="text-xs shrink-0">
              {pendingCount} alteração(ões)
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving || pendingCount === 0}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Salvando..." : "Salvar Tudo"}
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" />
            Fechar
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as TabMode); setStockEntries({}); }}>
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="entrada" className="gap-1 sm:gap-2 text-xs sm:text-sm">
            <PackagePlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Entrada
          </TabsTrigger>
          <TabsTrigger value="saida" className="gap-1 sm:gap-2 text-xs sm:text-sm">
            <PackageMinus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Saída
          </TabsTrigger>
          <TabsTrigger value="preco" className="gap-1 sm:gap-2 text-xs sm:text-sm">
            <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Alterar Preços
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      </div>

      {/* Global margin for price tab */}
      {tab === "preco" && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 bg-muted/50 rounded-xl border border-border">
          <div className="flex items-center gap-2 text-sm text-foreground font-medium">
            <Percent className="w-4 h-4 text-primary" />
            Margem de lucro global:
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.5"
              min="0"
              placeholder="Ex: 30"
              className="w-24 h-8 text-sm text-center"
              value={globalMargin}
              onChange={(e) => setGlobalMargin(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">%</span>
            <Button size="sm" variant="secondary" onClick={applyGlobalMargin} className="h-8 text-xs">
              Aplicar a todos
            </Button>
          </div>
          <span className="text-[10px] text-muted-foreground">Calcula: Custo × (1 + margem%)</span>
        </div>
      )}

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum produto encontrado.</div>
        ) : (
          filtered.map((product) => {
            const stockEntry = stockEntries[product.id];
            const priceEntry = priceEntries[product.id];
            const hasStockChange = stockEntry && stockEntry.quantity > 0;
            const hasPriceChange = priceEntry && (priceEntry.price !== undefined || priceEntry.cost_price !== undefined);
            const isChanged = (tab === "entrada" || tab === "saida") ? hasStockChange : hasPriceChange;

            return (
              <div
                key={product.id}
                className={`bg-card rounded-xl border border-border p-3 space-y-2 ${isChanged ? "ring-1 ring-primary/30 bg-primary/5" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{product.sku}</p>
                  </div>
                  <span className="text-xs font-mono font-semibold text-foreground shrink-0">
                    {product.stock_quantity} {product.unit.toLowerCase()}
                  </span>
                </div>

                {(tab === "entrada" || tab === "saida") ? (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                    <div>
                      <label className="text-[10px] text-muted-foreground">{tab === "entrada" ? "Qtd. Entrada" : "Qtd. Saída"}</label>
                      <Input type="number" step="0.01" min="0" placeholder="0" className="h-8 text-sm"
                        value={stockEntry?.quantity || ""} onChange={(e) => updateStockEntry(product.id, "quantity", e.target.value)} />
                    </div>
                    {tab === "entrada" && (
                      <div>
                        <label className="text-[10px] text-muted-foreground">Custo Unit.</label>
                        <Input type="number" step="0.01" min="0" placeholder="R$" className="h-8 text-sm"
                          value={stockEntry?.unit_cost || ""} onChange={(e) => updateStockEntry(product.id, "unit_cost", e.target.value)} />
                      </div>
                    )}
                    <div className={tab === "entrada" ? "col-span-2" : ""}>
                      <label className="text-[10px] text-muted-foreground">Ref. / NF</label>
                      <Input type="text" placeholder="NF-000" className="h-8 text-sm"
                        value={stockEntry?.reference || ""} onChange={(e) => updateStockEntry(product.id, "reference", e.target.value)} />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Custo atual: {formatCurrency(product.cost_price ?? 0)}</label>
                      <Input type="number" step="0.01" min="0" placeholder={(product.cost_price ?? 0).toString()} className="h-8 text-sm"
                        value={priceEntry?.cost_price ?? ""} onChange={(e) => updatePriceEntry(product.id, "cost_price", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Margem %</label>
                      <Input type="number" step="0.5" min="0" placeholder="Ex: 30" className="h-8 text-sm"
                        value={marginEntries[product.id] ?? ""} onChange={(e) => updateMarginForProduct(product.id, e.target.value, priceEntry?.cost_price ?? product.cost_price ?? 0)} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] text-muted-foreground">Preço de venda (atual: {formatCurrency(product.price)})</label>
                      <Input type="number" step="0.01" min="0" placeholder={product.price.toString()} className="h-8 text-sm"
                        value={priceEntry?.price ?? ""} onChange={(e) => updatePriceEntry(product.id, "price", e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block bg-card rounded-xl card-shadow border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Produto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">SKU</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Estoque Atual</th>
                {tab === "entrada" || tab === "saida" ? (
                  <>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {tab === "entrada" ? "Qtd. Entrada" : "Qtd. Saída"}
                    </th>
                    {tab === "entrada" && (
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Custo Unit.</th>
                    )}
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Ref. / NF</th>
                  </>
                ) : (
                  <>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Custo Atual</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Novo Custo</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Margem %</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Preço Atual</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Novo Preço</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const stockEntry = stockEntries[product.id];
                const priceEntry = priceEntries[product.id];
                const hasStockChange = stockEntry && stockEntry.quantity > 0;
                const hasPriceChange = priceEntry && (priceEntry.price !== undefined || priceEntry.cost_price !== undefined);
                const isChanged = (tab === "entrada" || tab === "saida") ? hasStockChange : hasPriceChange;

                return (
                  <tr key={product.id} className={`border-b border-border last:border-0 transition-colors ${isChanged ? "bg-primary/5" : "hover:bg-muted/50"}`}>
                    <td className="px-4 py-2.5 font-medium text-foreground">{product.name}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground text-xs">{product.sku}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-foreground">
                      {product.stock_quantity} {product.unit.toLowerCase()}
                    </td>

                    {tab === "entrada" || tab === "saida" ? (
                      <>
                        <td className="px-4 py-2.5">
                          <Input type="number" step="0.01" min="0" placeholder="0" className="w-24 mx-auto text-center h-8"
                            value={stockEntry?.quantity || ""} onChange={(e) => updateStockEntry(product.id, "quantity", e.target.value)} />
                        </td>
                        {tab === "entrada" && (
                          <td className="px-4 py-2.5">
                            <Input type="number" step="0.01" min="0" placeholder="R$" className="w-24 mx-auto text-center h-8"
                              value={stockEntry?.unit_cost || ""} onChange={(e) => updateStockEntry(product.id, "unit_cost", e.target.value)} />
                          </td>
                        )}
                        <td className="px-4 py-2.5">
                          <Input type="text" placeholder="NF-000" className="w-28 mx-auto text-center h-8"
                            value={stockEntry?.reference || ""} onChange={(e) => updateStockEntry(product.id, "reference", e.target.value)} />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{formatCurrency(product.cost_price ?? 0)}</td>
                        <td className="px-4 py-2.5">
                          <Input type="number" step="0.01" min="0" placeholder={(product.cost_price ?? 0).toString()} className="w-28 mx-auto text-center h-8"
                            value={priceEntry?.cost_price ?? ""} onChange={(e) => updatePriceEntry(product.id, "cost_price", e.target.value)} />
                        </td>
                        <td className="px-4 py-2.5">
                          <Input type="number" step="0.5" min="0" placeholder="%" className="w-20 mx-auto text-center h-8"
                            value={marginEntries[product.id] ?? ""} onChange={(e) => updateMarginForProduct(product.id, e.target.value, priceEntry?.cost_price ?? product.cost_price ?? 0)} />
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-primary">{formatCurrency(product.price)}</td>
                        <td className="px-4 py-2.5">
                          <Input type="number" step="0.01" min="0" placeholder={product.price.toString()} className="w-28 mx-auto text-center h-8"
                            value={priceEntry?.price ?? ""} onChange={(e) => updatePriceEntry(product.id, "price", e.target.value)} />
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={tab === "entrada" ? 6 : tab === "saida" ? 5 : 8} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
