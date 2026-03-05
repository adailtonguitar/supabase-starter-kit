import { useState, useMemo } from "react";
import { useProducts, Product } from "@/hooks/useProducts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Search, Armchair, Eye, EyeOff, AlertTriangle, CheckCircle, Package, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

type ShowroomStatus = "montado" | "desmontado" | "danificado" | "reposicao";

interface ShowroomItem {
  productId: string;
  status: ShowroomStatus;
  location: string; // ex: "Vitrine A", "Salão 2"
  notes: string;
  updatedAt: string;
}

const statusConfig: Record<ShowroomStatus, { label: string; icon: any; color: string }> = {
  montado: { label: "Montado", icon: CheckCircle, color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  desmontado: { label: "Desmontado", icon: EyeOff, color: "bg-muted text-muted-foreground border-border" },
  danificado: { label: "Danificado", icon: AlertTriangle, color: "bg-destructive/10 text-destructive border-destructive/20" },
  reposicao: { label: "Falta Repor", icon: RotateCcw, color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
};

const STORAGE_KEY = "as_showroom_items";

function loadShowroom(): Record<string, ShowroomItem> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveShowroom(items: Record<string, ShowroomItem>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function ControleExposicao() {
  const { data: products = [], isLoading } = useProducts();
  const [showroomData, setShowroomData] = useState<Record<string, ShowroomItem>>(loadShowroom);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [products]);

  const enriched = useMemo(() => {
    return products.map(p => ({
      ...p,
      showroom: showroomData[p.id] || null,
      showroomStatus: (showroomData[p.id]?.status || "desmontado") as ShowroomStatus,
    }));
  }, [products, showroomData]);

  const filtered = useMemo(() => {
    return enriched.filter(p => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = categoryFilter === "all" || p.category === categoryFilter;
      const matchStatus = statusFilter === "all" || p.showroomStatus === statusFilter;
      return matchSearch && matchCat && matchStatus;
    });
  }, [enriched, search, categoryFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: products.length,
    montado: enriched.filter(p => p.showroomStatus === "montado").length,
    desmontado: enriched.filter(p => p.showroomStatus === "desmontado").length,
    danificado: enriched.filter(p => p.showroomStatus === "danificado").length,
    reposicao: enriched.filter(p => p.showroomStatus === "reposicao").length,
  }), [enriched, products.length]);

  const updateItem = (productId: string, updates: Partial<ShowroomItem>) => {
    const current = showroomData[productId] || { productId, status: "desmontado", location: "", notes: "", updatedAt: "" };
    const updated = {
      ...showroomData,
      [productId]: { ...current, ...updates, productId, updatedAt: new Date().toISOString() },
    };
    setShowroomData(updated);
    saveShowroom(updated);
  };

  const handleStatusChange = (productId: string, status: ShowroomStatus) => {
    updateItem(productId, { status });
    toast.success(`Status atualizado: ${statusConfig[status].label}`);
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Eye className="w-6 h-6 text-primary" />
          Controle de Exposição
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Acompanhe quais móveis estão montados para exposição e o que precisa ser reposto
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total Produtos", value: stats.total, color: "text-foreground" },
          { label: "Montados", value: stats.montado, color: "text-emerald-600" },
          { label: "Desmontados", value: stats.desmontado, color: "text-muted-foreground" },
          { label: "Danificados", value: stats.danificado, color: "text-destructive" },
          { label: "Falta Repor", value: stats.reposicao, color: "text-amber-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase">{s.label}</p>
              <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(statusConfig).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Product List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum produto encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p, i) => {
            const sc = statusConfig[p.showroomStatus];
            const StatusIcon = sc.icon;
            const item = p.showroom;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
              >
                <Card className="hover:border-primary/20 transition-all">
                  <CardContent className="p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Product image/icon */}
                      <div className="w-14 h-14 rounded-lg bg-muted/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <Armchair className="w-7 h-7 text-muted-foreground/20" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{p.name}</p>
                          <Badge variant="outline" className={cn("text-[10px]", sc.color)}>
                            <StatusIcon className="w-3 h-3 mr-1" /> {sc.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          {p.category && <span>{p.category}</span>}
                          <span>{fmt(p.price)}</span>
                          <span>Estoque: {p.stock_quantity}</span>
                          {item?.location && <span>📍 {item.location}</span>}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Input
                          placeholder="Local (ex: Vitrine A)"
                          value={item?.location || ""}
                          onChange={e => updateItem(p.id, { location: e.target.value })}
                          className="w-[140px] h-8 text-xs"
                        />
                        <Select value={p.showroomStatus} onValueChange={(v) => handleStatusChange(p.id, v as ShowroomStatus)}>
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(statusConfig).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
