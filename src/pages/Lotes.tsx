import { useState } from "react";
import { Package, Plus, Trash2, AlertTriangle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { useProductLots, useExpiringLots, useCreateProductLot, useDeleteProductLot } from "@/hooks/useProductLots";
import { useProducts } from "@/hooks/useProducts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Lotes() {
  const { data: lots = [], isLoading } = useProductLots();
  const { data: expiringLots = [] } = useExpiringLots(30);
  const { data: rawProducts = [] } = useProducts();
  const products = rawProducts.filter(p => p.is_active !== false);
  const createLot = useCreateProductLot();
  const deleteLot = useDeleteProductLot();

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState({
    product_id: "",
    lot_number: "",
    manufacture_date: "",
    expiry_date: "",
    quantity: "",
    unit_cost: "",
    supplier: "",
  });

  const handleCreate = () => {
    if (!form.product_id || !form.lot_number || !form.quantity) return;
    createLot.mutate({
      product_id: form.product_id,
      lot_number: form.lot_number,
      manufacture_date: form.manufacture_date || undefined,
      expiry_date: form.expiry_date || undefined,
      quantity: parseFloat(form.quantity),
      unit_cost: form.unit_cost ? parseFloat(form.unit_cost) : undefined,
      supplier: form.supplier || undefined,
    });
    setShowCreate(false);
    setForm({ product_id: "", lot_number: "", manufacture_date: "", expiry_date: "", quantity: "", unit_cost: "", supplier: "" });
  };

  const isExpired = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const d = new Date(date);
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);
    return d <= limit && d >= new Date();
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Lotes & Validade</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Controle de lotes, fabricação e vencimento
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Lote
        </Button>
      </div>

      {expiringLots.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 sm:p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-destructive text-sm">
              {expiringLots.length} lote(s) próximo(s) do vencimento ou vencido(s)
            </p>
            <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {expiringLots.slice(0, 5).map((l: any) => (
                <li key={l.id} className="truncate">
                  {l.products?.name} — Lote {l.lot_number} — Vence {new Date(l.expiry_date!).toLocaleDateString("pt-BR")}
                </li>
              ))}
              {expiringLots.length > 5 && <li>e mais {expiringLots.length - 5}...</li>}
            </ul>
          </div>
        </motion.div>
      )}

      {/* Desktop Table */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden sm:block bg-card rounded-xl card-shadow border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Produto</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Lote</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Fabricação</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Validade</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Qtd</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Fornecedor</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={8} className="px-5 py-3"><Skeleton className="h-8 w-full" /></td>
                  </tr>
                ))
              ) : lots.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                    Nenhum lote cadastrado.
                  </td>
                </tr>
              ) : (
                lots.map((lot: any) => (
                  <tr key={lot.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-5 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        {lot.products?.name ?? "—"}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-foreground">{lot.lot_number}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {lot.manufacture_date ? new Date(lot.manufacture_date).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {lot.expiry_date ? new Date(lot.expiry_date).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-mono">{lot.quantity}</td>
                    <td className="px-5 py-3 text-muted-foreground">{lot.supplier || "—"}</td>
                    <td className="px-5 py-3 text-center">
                      {isExpired(lot.expiry_date) ? (
                        <Badge variant="destructive">Vencido</Badge>
                      ) : isExpiringSoon(lot.expiry_date) ? (
                        <Badge variant="outline" className="border-warning text-warning">Vencendo</Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => setDeleteTarget(lot.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : lots.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum lote cadastrado.</div>
        ) : (
          lots.map((lot: any) => (
            <div key={lot.id} className="bg-card rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">{lot.products?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono">Lote: {lot.lot_number}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isExpired(lot.expiry_date) ? (
                    <Badge variant="destructive" className="text-[10px]">Vencido</Badge>
                  ) : isExpiringSoon(lot.expiry_date) ? (
                    <Badge variant="outline" className="border-warning text-warning text-[10px]">Vencendo</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">OK</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>Qtd: <strong className="text-foreground font-mono">{lot.quantity}</strong></span>
                  {lot.expiry_date && (
                    <span className="flex items-center gap-0.5">
                      <Calendar className="w-3 h-3" />
                      {new Date(lot.expiry_date).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
                <button onClick={() => setDeleteTarget(lot.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Novo Lote</DialogTitle></DialogHeader>
          <div className="form-container overflow-y-auto flex-1 pr-1">
            <div>
              <Label>Produto *</Label>
              <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                <SelectTrigger className="form-input"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="form-grid">
              <div>
                <Label>Nº do Lote *</Label>
                <Input className="form-input" value={form.lot_number} onChange={(e) => setForm({ ...form, lot_number: e.target.value })} />
              </div>
              <div>
                <Label>Quantidade *</Label>
                <Input className="form-input" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
            </div>
            <div className="form-grid">
              <div>
                <Label>Data Fabricação</Label>
                <Input className="form-input" type="date" value={form.manufacture_date} onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })} />
              </div>
              <div>
                <Label>Data Validade</Label>
                <Input className="form-input" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
              </div>
            </div>
            <div className="form-grid">
              <div>
                <Label>Custo Unitário</Label>
                <Input className="form-input" type="number" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
              </div>
              <div>
                <Label>Fornecedor</Label>
                <Input className="form-input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!form.product_id || !form.lot_number || !form.quantity}>
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lote?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteTarget) deleteLot.mutate(deleteTarget); setDeleteTarget(null); }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
