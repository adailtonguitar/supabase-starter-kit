import { useState } from "react";
import { ArrowRightLeft, Package, Plus, Check, Clock, Truck } from "lucide-react";
import { useStockTransfers, useCreateStockTransfer, useReceiveStockTransfer } from "@/hooks/useStockTransfers";
import { useBranches } from "@/hooks/useBranches";
import { useProducts } from "@/hooks/useProducts";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusConfig: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  pending: { label: "Pendente", icon: Clock, className: "bg-yellow-500/10 text-yellow-600" },
  in_transit: { label: "Em Trânsito", icon: Truck, className: "bg-blue-500/10 text-blue-600" },
  received: { label: "Recebida", icon: Check, className: "bg-green-500/10 text-green-600" },
  cancelled: { label: "Cancelada", icon: Clock, className: "bg-destructive/10 text-destructive" },
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

  const otherBranches = (branches || []).filter(b => b.id !== companyId);

  const addItem = () => {
    const product = (products || []).find(p => p.id === tempProductId);
    if (!product) { toast.warning("Selecione um produto"); return; }
    if (tempQty <= 0) { toast.warning("Quantidade inválida"); return; }
    if (selectedItems.some(i => i.product_id === tempProductId)) { toast.warning("Produto já adicionado"); return; }
    setSelectedItems(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: tempQty,
      unit_cost: product.cost_price || 0,
    }]);
    setTempProductId("");
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

  if (isLoading) return <p className="text-sm text-muted-foreground text-center py-8">Carregando transferências...</p>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-primary" /> Transferências de Estoque
        </h3>
        <button
          onClick={() => setDialogOpen(true)}
          disabled={otherBranches.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> Nova Transferência
        </button>
      </div>

      {otherBranches.length === 0 && (
        <p className="text-sm text-muted-foreground">Cadastre pelo menos uma filial para realizar transferências.</p>
      )}

      {/* Transfer List */}
      {(transfers || []).length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <ArrowRightLeft className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma transferência registrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(transfers || []).map(t => {
            const cfg = statusConfig[t.status] || statusConfig.pending;
            const StatusIcon = cfg.icon;
            const isReceivable = t.status === "pending" && t.to_company_id === companyId;

            return (
              <div key={t.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span>{t.from_company?.name}</span>
                    <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{t.to_company?.name}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.className}`}>
                    <StatusIcon className="w-3 h-3" /> {cfg.label}
                  </span>
                </div>

                {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}

                {/* Items */}
                <div className="flex flex-wrap gap-2">
                  {(t.items || []).map(item => (
                    <span key={item.id} className="inline-flex items-center gap-1 bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      {item.product_name} × {item.quantity}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{new Date(t.created_at).toLocaleDateString("pt-BR")}</span>
                  {isReceivable && (
                    <button
                      onClick={() => receiveTransfer.mutate(t.id)}
                      disabled={receiveTransfer.isPending}
                      className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      <Check className="w-3 h-3 inline mr-1" /> Receber
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Transferência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Destino *</label>
              <select
                value={toCompanyId}
                onChange={e => setToCompanyId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm"
              >
                <option value="">Selecione a filial destino</option>
                {otherBranches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Observações</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ex: Reposição semanal"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm"
              />
            </div>

            {/* Add product */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">Produtos</label>
              <div className="flex gap-2">
                <select
                  value={tempProductId}
                  onChange={e => setTempProductId(e.target.value)}
                  className="flex-1 px-2 py-2 rounded-lg bg-background border border-border text-foreground text-xs"
                >
                  <option value="">Produto...</option>
                  {(products || []).filter(p => p.stock_quantity > 0).map(p => (
                    <option key={p.id} value={p.id}>{p.name} (est: {p.stock_quantity})</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={tempQty}
                  onChange={e => setTempQty(Number(e.target.value))}
                  className="w-16 px-2 py-2 rounded-lg bg-background border border-border text-foreground text-xs text-center"
                />
                <button onClick={addItem} className="px-3 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {selectedItems.length > 0 && (
                <div className="space-y-1">
                  {selectedItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between bg-background border border-border rounded-lg px-3 py-1.5 text-xs">
                      <span className="text-foreground">{item.product_name} × {item.quantity}</span>
                      <button onClick={() => setSelectedItems(prev => prev.filter((_, idx) => idx !== i))} className="text-destructive text-[10px] hover:underline">
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
              className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {createTransfer.isPending ? "Criando..." : "Criar Transferência"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
