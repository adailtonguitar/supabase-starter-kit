import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, History } from "lucide-react";

interface PriceHistoryEntry {
  id: string;
  field_changed: "price" | "cost_price";
  old_value: number;
  new_value: number;
  changed_at: string;
  source: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
}

const sourceLabels: Record<string, string> = {
  manual: "Manual",
  batch: "Lote",
  xml_import: "XML NF-e",
};

export function PriceHistoryDialog({ open, onOpenChange, productId, productName }: Props) {
  const { companyId } = useCompany();
  const [entries, setEntries] = useState<PriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !productId || !companyId) return;
    setLoading(true);
    supabase
      .from("price_history" as any)
      .select("id, field_changed, old_value, new_value, changed_at, source")
      .eq("product_id", productId)
      .eq("company_id", companyId)
      .order("changed_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setEntries((data as any) || []);
        setLoading(false);
      });
  }, [open, productId, companyId]);

  const getIcon = (old_value: number, new_value: number) => {
    if (new_value > old_value) return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
    if (new_value < old_value) return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
    return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Histórico de Preços
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{productName}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {loading ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhuma alteração de preço registrada ainda.
            </div>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="bg-muted/30 rounded-lg border border-border p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getIcon(e.old_value, e.new_value)}
                    <Badge variant="outline" className="text-[10px]">
                      {e.field_changed === "price" ? "Venda" : "Custo"}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {sourceLabels[e.source] || e.source}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(e.changed_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground line-through">{formatCurrency(e.old_value)}</span>
                  <span className="text-foreground">→</span>
                  <span className="font-semibold text-foreground">{formatCurrency(e.new_value)}</span>
                  <span className={`text-xs font-mono ${e.new_value > e.old_value ? "text-green-500" : e.new_value < e.old_value ? "text-red-500" : "text-muted-foreground"}`}>
                    ({e.old_value > 0 ? ((e.new_value - e.old_value) / e.old_value * 100).toFixed(1) : "—"}%)
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
