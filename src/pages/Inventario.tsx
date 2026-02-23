import { useState } from "react";
import { ClipboardList, Plus, Eye, CheckCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  useInventoryCounts,
  useInventoryItems,
  useCreateInventory,
  useUpdateInventoryItem,
  useFinishInventory,
} from "@/hooks/useInventory";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function Inventario() {
  const { data: inventories = [], isLoading } = useInventoryCounts();
  const createInventory = useCreateInventory();
  const finishInventory = useFinishInventory();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("Inventário");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Inventário</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Contagem e conferência de estoque físico
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Inventário
        </Button>
      </div>

      {/* Desktop table */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden sm:block bg-card rounded-xl card-shadow border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Nome</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Iniciado em</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Finalizado em</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="px-5 py-3" colSpan={5}><Skeleton className="h-8 w-full" /></td>
                </tr>
              ))
            ) : inventories.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                  Nenhum inventário realizado. Clique em "Novo Inventário" para iniciar.
                </td>
              </tr>
            ) : (
              inventories.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-5 py-3 font-medium text-foreground">{inv.name}</td>
                  <td className="px-5 py-3">
                    <Badge variant={inv.status === "finalizado" ? "default" : "secondary"}>
                      {inv.status === "finalizado" ? "Finalizado" : "Aberto"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {new Date(inv.started_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {inv.finished_at ? new Date(inv.finished_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setSelectedId(inv.id)} title="Ver itens" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      {inv.status === "aberto" && (
                        <button onClick={() => finishInventory.mutate(inv.id)} title="Finalizar" className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </motion.div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {isLoading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : inventories.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum inventário realizado.
          </div>
        ) : (
          inventories.map((inv) => (
            <div key={inv.id} className="bg-card rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">{inv.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(inv.started_at).toLocaleDateString("pt-BR")}
                    {inv.finished_at && ` — ${new Date(inv.finished_at).toLocaleDateString("pt-BR")}`}
                  </p>
                </div>
                <Badge variant={inv.status === "finalizado" ? "default" : "secondary"} className="shrink-0">
                  {inv.status === "finalizado" ? "Finalizado" : "Aberto"}
                </Badge>
              </div>
              <div className="flex items-center justify-end gap-1 pt-1 border-t border-border">
                <button onClick={() => setSelectedId(inv.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                  <Eye className="w-4 h-4" />
                </button>
                {inv.status === "aberto" && (
                  <button onClick={() => finishInventory.mutate(inv.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10">
                    <CheckCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Inventário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Inventário Mensal" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                createInventory.mutate({ name: newName });
                setShowCreate(false);
                setNewName("Inventário");
              }}
              disabled={createInventory.isPending}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Items Dialog */}
      {selectedId && (
        <InventoryItemsDialog
          inventoryId={selectedId}
          isOpen={!!selectedId}
          onClose={() => setSelectedId(null)}
          isFinished={inventories.find((i) => i.id === selectedId)?.status === "finalizado"}
        />
      )}
    </div>
  );
}

function InventoryItemsDialog({
  inventoryId,
  isOpen,
  onClose,
  isFinished,
}: {
  inventoryId: string;
  isOpen: boolean;
  onClose: () => void;
  isFinished: boolean;
}) {
  const { data: items = [], isLoading } = useInventoryItems(inventoryId);
  const updateItem = useUpdateInventoryItem();

  const handleCountChange = (id: string, value: string) => {
    const qty = parseFloat(value);
    if (!isNaN(qty)) {
      updateItem.mutate({ id, counted_quantity: qty });
    }
  };

  const totalDiff = items.reduce((sum, i) => sum + (i.difference ?? 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Itens do Inventário
            {totalDiff !== 0 && (
              <Badge variant="destructive" className="ml-2">
                Divergência: {totalDiff > 0 ? "+" : ""}{totalDiff}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Produto</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">SKU</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Sistema</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Contagem</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={5} className="px-4 py-2"><Skeleton className="h-6 w-full" /></td></tr>
                ))
              ) : items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-2 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-muted-foreground" />
                      {item.products?.name ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono text-muted-foreground text-xs">{item.products?.sku}</td>
                  <td className="px-4 py-2 text-right font-mono">{item.system_quantity}</td>
                  <td className="px-4 py-2 text-right">
                    {isFinished ? (
                      <span className="font-mono">{item.counted_quantity ?? "—"}</span>
                    ) : (
                      <Input
                        type="number"
                        className="w-24 text-right ml-auto h-8"
                        defaultValue={item.counted_quantity ?? ""}
                        onBlur={(e) => handleCountChange(item.id, e.target.value)}
                      />
                    )}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono font-semibold ${
                    item.difference > 0 ? "text-primary" : item.difference < 0 ? "text-destructive" : "text-muted-foreground"
                  }`}>
                    {item.counted_quantity != null ? (item.difference > 0 ? "+" : "") + item.difference : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
