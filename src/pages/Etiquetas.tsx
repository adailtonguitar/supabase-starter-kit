import { useState, useMemo } from "react";
import { useProductLabels, useMarkLabelsPrinted, useResetLabels } from "@/hooks/useProductLabels";
import { LabelPreview } from "@/components/labels/LabelPreview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tag, Search, RotateCcw, CheckCheck } from "lucide-react";

export default function Etiquetas() {
  const [tab, setTab] = useState<"pendente" | "impressa" | "todas">("pendente");
  const { data: labels = [], isLoading } = useProductLabels(tab);
  const markPrinted = useMarkLabelsPrinted();
  const resetLabels = useResetLabels();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return labels;
    const q = search.toLowerCase();
    return labels.filter((l) => l.product?.name.toLowerCase().includes(q) || l.product?.barcode?.toLowerCase().includes(q) || l.product?.sku.toLowerCase().includes(q));
  }, [labels, search]);

  const toggleAll = () => { if (selected.size === filtered.length) setSelected(new Set()); else setSelected(new Set(filtered.map((l) => l.id))); };
  const toggle = (id: string) => { setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const selectedLabels = filtered.filter((l) => selected.has(l.id));
  const handlePrintDone = (ids: string[]) => { markPrinted.mutate(ids); setSelected(new Set()); };
  const handleReset = () => { resetLabels.mutate(Array.from(selected)); setSelected(new Set()); };
  const pendingCount = labels.filter((l) => l.status === "pendente").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><Tag className="w-6 h-6 text-primary" /><div><h1 className="text-2xl font-bold text-foreground">Etiquetas</h1><p className="text-sm text-muted-foreground">Gôndola, adesiva, prateleira e balança</p></div></div>
        {pendingCount > 0 && <Badge variant="destructive" className="text-sm px-3 py-1">{pendingCount} pendente(s)</Badge>}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setSelected(new Set()); }}><TabsList><TabsTrigger value="pendente">Pendentes</TabsTrigger><TabsTrigger value="impressa">Impressas</TabsTrigger><TabsTrigger value="todas">Todas</TabsTrigger></TabsList></Tabs>
            <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (<div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (<p className="text-center text-muted-foreground py-12">Nenhuma etiqueta encontrada.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2"><Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} /><span className="text-sm text-muted-foreground">Selecionar todos ({filtered.length})</span></div>
                {selected.size > 0 && tab !== "pendente" && (<Button size="sm" variant="outline" onClick={handleReset} className="gap-1"><RotateCcw className="w-3.5 h-3.5" />Marcar pendente</Button>)}
              </div>
              <div className="divide-y rounded-lg border">
                {filtered.map((label) => {
                  const p = label.product;
                  if (!p) return null;
                  return (
                    <div key={label.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => toggle(label.id)}>
                      <Checkbox checked={selected.has(label.id)} onCheckedChange={() => toggle(label.id)} onClick={(e) => e.stopPropagation()} />
                      <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate text-foreground">{p.name}</p><p className="text-xs text-muted-foreground">SKU: {p.sku} {p.barcode && `• ${p.barcode}`}</p></div>
                      <span className="font-bold text-foreground whitespace-nowrap">R$ {p.price.toFixed(2).replace(".", ",")}</span>
                      <Badge variant={label.status === "pendente" ? "destructive" : "secondary"} className="text-xs">{label.status === "pendente" ? "Pendente" : "Impressa"}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {selectedLabels.length > 0 && (
        <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><CheckCheck className="w-5 h-5" />Pré-visualização</CardTitle></CardHeader><CardContent><LabelPreview labels={selectedLabels} onPrintDone={handlePrintDone} /></CardContent></Card>
      )}
    </div>
  );
}
