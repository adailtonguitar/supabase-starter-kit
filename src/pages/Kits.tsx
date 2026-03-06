import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Package, Trash2, Percent, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductKits, useCreateKit, useDeleteKit, type ProductKit } from "@/hooks/useProductKits";
import { useProducts } from "@/hooks/useProducts";
import { formatCurrency } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Kits() {
  const { data: kits = [], isLoading } = useProductKits();
  const { data: products = [] } = useProducts();
  const createKit = useCreateKit();
  const deleteKit = useDeleteKit();

  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductKit | null>(null);
  const [expandedKit, setExpandedKit] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [progressive, setProgressive] = useState(false);
  const [selectedItems, setSelectedItems] = useState<{ product_id: string; quantity: number }[]>([]);

  const resetForm = () => {
    setName(""); setDescription(""); setDiscountType("percent");
    setDiscountValue(0); setProgressive(false); setSelectedItems([]);
  };

  const addItem = (productId: string) => {
    if (selectedItems.find(i => i.product_id === productId)) return;
    setSelectedItems(prev => [...prev, { product_id: productId, quantity: 1 }]);
  };

  const removeItem = (productId: string) => {
    setSelectedItems(prev => prev.filter(i => i.product_id !== productId));
  };

  const updateItemQty = (productId: string, qty: number) => {
    setSelectedItems(prev => prev.map(i => i.product_id === productId ? { ...i, quantity: Math.max(1, qty) } : i));
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Nome do kit obrigatório"); return; }
    if (selectedItems.length < 2) { toast.error("Adicione pelo menos 2 produtos ao kit"); return; }
    await createKit.mutateAsync({
      name, description, discount_type: discountType,
      discount_value: discountValue, progressive_discount: progressive,
      items: selectedItems,
    });
    resetForm();
    setShowForm(false);
  };

  const calcKitTotal = (kit: ProductKit) => {
    const subtotal = (kit.items || []).reduce((sum, item) => sum + (item.product?.price || 0) * item.quantity, 0);
    const discount = kit.discount_type === "percent" ? subtotal * (kit.discount_value / 100) : kit.discount_value;
    return { subtotal, discount, total: Math.max(0, subtotal - discount) };
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Kits & Combos</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{kits.length} kits cadastrados</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Novo Kit
        </Button>
      </motion.div>

      {isLoading ? (
        [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
      ) : kits.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>Nenhum kit cadastrado.</p>
          <p className="text-xs mt-1">Crie combos de produtos com desconto para aumentar o ticket médio.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {kits.map((kit) => {
            const { subtotal, discount, total } = calcKitTotal(kit);
            const isExpanded = expandedKit === kit.id;
            return (
              <motion.div key={kit.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-card rounded-2xl border border-border p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => setExpandedKit(isExpanded ? null : kit.id)}>
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Package className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{kit.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {kit.items?.length || 0} produtos • Desconto: {kit.discount_type === "percent" ? `${kit.discount_value}%` : formatCurrency(kit.discount_value)}
                        {kit.progressive_discount && " (progressivo)"}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground line-through">{formatCurrency(subtotal)}</p>
                      <p className="font-bold text-primary">{formatCurrency(total)}</p>
                    </div>
                    <button onClick={() => setDeleteTarget(kit)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {isExpanded && kit.items && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    {kit.items.map(item => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{item.quantity}x {item.product?.name || "Produto"}</span>
                        <span className="text-muted-foreground font-mono">{formatCurrency((item.product?.price || 0) * item.quantity)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-sm pt-2 border-t border-dashed border-border">
                      <span className="text-destructive flex items-center gap-1"><Percent className="w-3 h-3" /> Desconto</span>
                      <span className="text-destructive font-mono">-{formatCurrency(discount)}</span>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create Kit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Kit / Combo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do Kit</Label>
              <Input placeholder="Ex: Cozinha Completa" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input placeholder="Breve descrição" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Desconto</Label>
                <Select value={discountType} onValueChange={(v: any) => setDiscountType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentual (%)</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor do Desconto</Label>
                <Input type="number" min={0} value={discountValue} onChange={e => setDiscountValue(Number(e.target.value))} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={progressive} onCheckedChange={setProgressive} />
              <Label>Desconto progressivo (mais itens = maior desconto)</Label>
            </div>

            <div>
              <Label>Produtos do Kit</Label>
              <Select onValueChange={addItem}>
                <SelectTrigger><SelectValue placeholder="Adicionar produto..." /></SelectTrigger>
                <SelectContent>
                  {products.filter(p => !selectedItems.find(s => s.product_id === p.id)).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedItems.length > 0 && (
                <div className="mt-3 space-y-2">
                  {selectedItems.map(item => {
                    const prod = products.find(p => p.id === item.product_id);
                    return (
                      <div key={item.product_id} className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
                        <Input type="number" min={1} value={item.quantity} onChange={e => updateItemQty(item.product_id, Number(e.target.value))} className="w-16" />
                        <span className="text-sm text-foreground flex-1">{prod?.name || "?"}</span>
                        <span className="text-xs text-muted-foreground font-mono">{formatCurrency((prod?.price || 0) * item.quantity)}</span>
                        <button onClick={() => removeItem(item.product_id)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button variant="outline" onClick={() => { resetForm(); setShowForm(false); }}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={createKit.isPending}>
                {createKit.isPending ? "Salvando..." : "Criar Kit"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir kit?</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) deleteKit.mutate(deleteTarget.id); setDeleteTarget(null); }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
