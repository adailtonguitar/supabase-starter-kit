import { useState, useMemo } from "react";
import { AlertTriangle, Search, Package, Plus, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStockMovements, useCreateStockMovement } from "@/hooks/useStockMovements";
import { useProducts } from "@/hooks/useProducts";
import type { Product } from "@/hooks/useProducts";
import { formatCurrency } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const LOSS_CATEGORIES = [
  { value: "quebra", label: "Quebra", color: "destructive" },
  { value: "vencimento", label: "Vencimento", color: "default" },
  { value: "furto", label: "Furto", color: "destructive" },
  { value: "avaria", label: "Avaria", color: "secondary" },
  { value: "outros", label: "Outros", color: "outline" },
] as const;

type LossCategory = (typeof LOSS_CATEGORIES)[number]["value"];

function isLossReason(reason: string | null | undefined): LossCategory | null {
  if (!reason) return null;
  const lower = reason.toLowerCase();
  for (const cat of LOSS_CATEGORIES) {
    if (lower.includes(cat.value)) return cat.value;
  }
  return null;
}

function RegisterLossDialog({
  open,
  onOpenChange,
  products,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Product[];
}) {
  const createMovement = useCreateStockMovement();
  const [productId, setProductId] = useState("");
  const [category, setCategory] = useState<LossCategory>("quebra");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase())
  );

  const selectedProduct = products.find((p) => p.id === productId);

  const handleSubmit = () => {
    if (!productId || !quantity || Number(quantity) <= 0) {
      toast.error("Preencha produto e quantidade.");
      return;
    }
    const label = LOSS_CATEGORIES.find((c) => c.value === category)?.label || category;
    createMovement.mutate(
      {
        product_id: productId,
        type: "saida",
        quantity: Number(quantity),
        reason: `Perda: ${label}${notes ? ` - ${notes}` : ""}`,
      },
      {
        onSuccess: () => {
          toast.success("Perda registrada com sucesso.");
          setProductId("");
          setQuantity("");
          setNotes("");
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Registrar Perda</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          <div>
            <Label>Produto</Label>
            <Input
              placeholder="Buscar produto..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="mb-2"
            />
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o produto" />
              </SelectTrigger>
              <SelectContent>
                {filteredProducts.slice(0, 20).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.stock_quantity} {p.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categoria da Perda</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as LossCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOSS_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input
              type="number"
              min="1"
              max={selectedProduct?.stock_quantity ?? 9999}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes adicionais..."
              rows={2}
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={createMovement.isPending}
            className="w-full"
          >
            Registrar Perda
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Perdas() {
  const { data: movements = [], isLoading } = useStockMovements();
  const { data: products = [] } = useProducts();
  const [search, setSearch] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const lossMovements = useMemo(() => {
    return movements.filter((m: any) => {
      if (m.type !== "saida") return false;
      const reason = (m.reason || "").toLowerCase();
      return (
        reason.includes("perda") ||
        reason.includes("quebra") ||
        reason.includes("vencimento") ||
        reason.includes("furto") ||
        reason.includes("avaria")
      );
    });
  }, [movements]);

  const filtered = useMemo(() => {
    return lossMovements.filter((m: any) => {
      const name = m.products?.name?.toLowerCase() || "";
      const sku = m.products?.sku?.toLowerCase() || "";
      const matchSearch = name.includes(search.toLowerCase()) || sku.includes(search.toLowerCase());
      if (filterCategory === "all") return matchSearch;
      const cat = isLossReason(m.reason);
      return matchSearch && cat === filterCategory;
    });
  }, [lossMovements, search, filterCategory]);

  const stats = useMemo(() => {
    const totalItems = lossMovements.reduce((sum: number, m: any) => sum + (m.quantity || 0), 0);
    const totalValue = lossMovements.reduce((sum: number, m: any) => {
      const product = products.find((p) => p.id === m.product_id);
      return sum + (m.quantity || 0) * (product?.cost_price || product?.price || 0);
    }, 0);
    const byCategory: Record<string, number> = {};
    for (const m of lossMovements as any[]) {
      const cat = isLossReason(m.reason) || "outros";
      byCategory[cat] = (byCategory[cat] || 0) + (m.quantity || 0);
    }
    return { totalItems, totalValue, byCategory };
  }, [lossMovements, products]);

  const getCategoryBadge = (reason: string | null) => {
    const cat = isLossReason(reason);
    const info = LOSS_CATEGORIES.find((c) => c.value === cat);
    if (!info) return <Badge variant="outline">Outros</Badge>;
    return <Badge variant={info.color as any}>{info.label}</Badge>;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-6 h-6" />
            Controle de Perdas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registre e acompanhe perdas por quebra, vencimento, furto e avaria
          </p>
        </div>
        <Button size="sm" onClick={() => setShowRegister(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Registrar Perda
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase font-medium">Total de Itens Perdidos</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.totalItems}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase font-medium">Valor Estimado</p>
          <p className="text-2xl font-bold text-destructive mt-1">{formatCurrency(stats.totalValue)}</p>
        </div>
        {LOSS_CATEGORIES.slice(0, 2).map((cat) => (
          <div key={cat.value} className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground uppercase font-medium">{cat.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.byCategory[cat.value] || 0} itens</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {LOSS_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Nenhuma perda registrada.
          </div>
        ) : (
          filtered.map((m: any) => {
            const product = products.find((p) => p.id === m.product_id);
            const unitValue = product?.cost_price || product?.price || 0;
            const totalLoss = (m.quantity || 0) * unitValue;
            const reasonText = (m.reason || "").replace(/^Perda:\s*\w+\s*-?\s*/i, "").trim();
            return (
              <div key={m.id} className="bg-card rounded-xl border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium text-foreground text-sm truncate">{m.products?.name ?? "—"}</span>
                  </div>
                  {getCategoryBadge(m.reason)}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">{new Date(m.created_at).toLocaleDateString("pt-BR")}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-destructive">-{m.quantity}</span>
                    <span className="font-mono text-destructive">{formatCurrency(totalLoss)}</span>
                  </div>
                </div>
                {reasonText && <p className="text-xs text-muted-foreground">{reasonText}</p>}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden sm:block bg-card rounded-xl card-shadow border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Data</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Produto</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Categoria</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Qtd</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Valor Est.</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Observações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={6} className="px-5 py-3"><Skeleton className="h-8 w-full" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhuma perda registrada.
                  </td>
                </tr>
              ) : (
                filtered.map((m: any) => {
                  const product = products.find((p) => p.id === m.product_id);
                  const unitValue = product?.cost_price || product?.price || 0;
                  const totalLoss = (m.quantity || 0) * unitValue;
                  const reasonText = (m.reason || "").replace(/^Perda:\s*\w+\s*-?\s*/i, "").trim();
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {new Date(m.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-5 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-muted-foreground" />
                          {m.products?.name ?? "—"}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {getCategoryBadge(m.reason)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-destructive">
                        -{m.quantity}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-destructive">
                        {formatCurrency(totalLoss)}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {reasonText || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      <RegisterLossDialog
        open={showRegister}
        onOpenChange={setShowRegister}
        products={products}
      />
    </div>
  );
}
