import { useState, useMemo } from "react";
import { ArrowRightLeft, Package, Plus, Check, Clock, Truck, ArrowRight, Search } from "lucide-react";
import { useStockTransfers, useCreateStockTransfer, useReceiveStockTransfer } from "@/hooks/useStockTransfers";
import { useBranches } from "@/hooks/useBranches";
import { useProducts } from "@/hooks/useProducts";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";

const statusConfig: Record<string, { label: string; icon: typeof Clock; className: string; dotColor: string }> = {
  pending: { label: "Pendente", icon: Clock, className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", dotColor: "bg-yellow-500" },
  in_transit: { label: "Em Trânsito", icon: Truck, className: "bg-blue-500/10 text-blue-600 border-blue-500/20", dotColor: "bg-blue-500" },
  received: { label: "Recebida", icon: Check, className: "bg-green-500/10 text-green-600 border-green-500/20", dotColor: "bg-green-500" },
  cancelled: { label: "Cancelada", icon: Clock, className: "bg-destructive/10 text-destructive border-destructive/20", dotColor: "bg-destructive" },
};

export default function StockTransfersSection() {
  const { data: transfers, isLoading } = useStockTransfers();
  const { data: branches } = useBranches();
  const { data: products } = useProducts();
  const { companyId } = useCompany();
  const createTransfer = useCreateStockTransfer();
  const receiveTransfer = useReceiveStockTransfer();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [toCompanyId, setToCompanyId] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedItems, setSelectedItems] = useState<{ product_id: string; product_name: string; product_sku?: string; quantity: number; unit_cost: number }[]>([]);
  const [tempProductId, setTempProductId] = useState("");
  const [tempQty, setTempQty] = useState(1);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const term = productSearch.toLowerCase().trim();
    if (!term) return products;
    return products.filter(p => p.name.toLowerCase().includes(term) || (p.sku && p.sku.toLowerCase().includes(term)));
  }, [products, productSearch]);
  const otherBranches = (branches || []).filter(b => b.id !== companyId);

  const addItem = () => {
    const product = (products || []).find(p => p.id === tempProductId);
    if (!product) { toast.warning("Selecione um produto"); return; }
    if (tempQty <= 0) { toast.warning("Quantidade inválida"); return; }
    if (selectedItems.some(i => i.product_id === tempProductId)) { toast.warning("Produto já adicionado"); return; }
    if (tempQty > (product.stock_quantity || 0)) {
      toast.warning(`Estoque insuficiente. Disponível: ${product.stock_quantity || 0}`);
      return;
    }
    setSelectedItems(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: tempQty,
      unit_cost: product.cost_price || 0,
    }]);
    setTempProductId("");
    setProductSearch("");
    setTempQty(1);
  };

  const handleCreate = () => {
    if (!companyId || !toCompanyId) { toast.warning("Selecione o destino"); return; }
    if (selectedItems.length === 0) { toast.warning("Adicione pelo menos um produto"); return; }
    createTransfer.mutate({
      from_company_id: companyId,
      to_company_id: toCompanyId,
      notes: notes || undefined,
      items: selectedItems,
    }, {
      onSuccess: () => {
        setDialogOpen(false);
        setToCompanyId("");
        setNotes("");
        setSelectedItems([]);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-primary" /> Transferências de Estoque
        </h3>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setDialogOpen(true)}
          disabled={otherBranches.length === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-medium shadow-lg shadow-primary/20 hover:shadow-xl transition-shadow disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> Nova Transferência
        </motion.button>
      </div>

      {otherBranches.length === 0 && (
        <div className="bg-accent/30 border border-accent rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Cadastre pelo menos uma filial para realizar transferências.</p>
        </div>
      )}

      {/* Transfer List */}
      {(transfers || []).length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
            <ArrowRightLeft className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Nenhuma transferência registrada</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Crie uma transferência para mover produtos entre filiais</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(transfers || []).map((t, i) => {
            const cfg = statusConfig[t.status] || statusConfig.pending;
            const StatusIcon = cfg.icon;
            const isReceivable = t.status === "pending" && t.to_company_id === companyId;

            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="bg-card border border-border rounded-2xl p-5 space-y-3 hover:shadow-md transition-shadow"
              >
                {/* Route */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-foreground">{t.from_company?.name}</span>
                    <ArrowRight className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-foreground">{t.to_company?.name}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${cfg.className}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                    {cfg.label}
                  </span>
                </div>

                {t.notes && <p className="text-xs text-muted-foreground italic">"{t.notes}"</p>}

                {/* Items */}
                <div className="flex flex-wrap gap-2">
                  {(t.items || []).map(item => (
                    <span key={item.id} className="inline-flex items-center gap-1.5 bg-accent/50 border border-accent rounded-lg px-2.5 py-1.5 text-xs text-foreground font-medium">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      {item.product_name} <span className="text-muted-foreground">×{item.quantity}</span>
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString("pt-BR")}</span>
                  {isReceivable && (
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => receiveTransfer.mutate(t.id)}
                      disabled={receiveTransfer.isPending}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold shadow-md shadow-primary/20 hover:shadow-lg disabled:opacity-50 transition-all"
                    >
                      <Check className="w-3 h-3 inline mr-1" /> Receber
                    </motion.button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ArrowRightLeft className="w-5 h-5 text-primary" />
              </div>
              <DialogTitle>Nova Transferência</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Destino *</label>
              <select
                value={toCompanyId}
                onChange={e => setToCompanyId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all outline-none"
              >
                <option value="">Selecione a filial destino</option>
                {otherBranches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Observações</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ex: Reposição semanal"
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all outline-none"
              />
            </div>

            {/* Add product */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground block uppercase tracking-wider">Produtos</label>
              <div className="flex gap-2 items-end">
                <div className="relative min-w-0 flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); setTempProductId(""); }}
                      onFocus={() => setShowProductDropdown(true)}
                      placeholder="Buscar produto..."
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-background border border-border text-foreground text-xs focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all outline-none"
                    />
                  </div>
                  {showProductDropdown && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-popover border border-border rounded-xl shadow-lg">
                      {filteredProducts.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum produto encontrado</div>
                      ) : (
                        filteredProducts.map(p => {
                          const isZero = (p.stock_quantity || 0) <= 0;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setTempProductId(p.id);
                                setProductSearch(`${p.name} (est: ${p.stock_quantity || 0})`);
                                setShowProductDropdown(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-accent/50 transition-colors ${isZero ? "text-destructive" : "text-foreground"}`}
                            >
                              {p.name} <span className={isZero ? "text-destructive font-semibold" : "text-muted-foreground"}>(est: {p.stock_quantity || 0})</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  value={tempQty}
                  onChange={e => setTempQty(Number(e.target.value))}
                  className="w-16 flex-shrink-0 px-3 py-2.5 rounded-xl bg-background border border-border text-foreground text-xs text-center focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all outline-none"
                />
                <button onClick={addItem} className="flex-shrink-0 p-2.5 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all">
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {selectedItems.length > 0 && (
                <div className="space-y-1.5">
                  {selectedItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between bg-accent/30 border border-accent rounded-xl px-3 py-2 text-xs">
                      <span className="text-foreground font-medium">{item.product_name} <span className="text-muted-foreground">×{item.quantity}</span></span>
                      <button onClick={() => setSelectedItems(prev => prev.filter((_, idx) => idx !== i))} className="text-destructive text-[10px] font-medium hover:underline">
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleCreate}
              disabled={createTransfer.isPending}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-lg shadow-primary/20 transition-all"
            >
              {createTransfer.isPending ? "Criando..." : "Criar Transferência"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
