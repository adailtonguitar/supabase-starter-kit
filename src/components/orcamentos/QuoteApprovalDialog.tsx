import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Package, AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface QuoteItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  unit?: string;
  sku?: string;
}

interface Props {
  quote: {
    id: string;
    client_name: string | null;
    items_json: any[];
    total: number;
    notes: string | null;
  };
  onClose: () => void;
  onApproved: () => void;
}

export function QuoteApprovalDialog({ quote, onClose, onApproved }: Props) {
  const { companyId } = useCompany();
  const [reserveStock, setReserveStock] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [stockCheck, setStockCheck] = useState<Record<string, { available: number; sufficient: boolean }>>({});
  const [checked, setChecked] = useState(false);

  const items: QuoteItem[] = Array.isArray(quote.items_json) ? quote.items_json : [];

  const checkStock = async () => {
    if (!companyId || items.length === 0) return;
    setProcessing(true);
    try {
      const productIds = items.map((i) => i.product_id).filter(Boolean);
      const { data: products } = await supabase
        .from("products")
        .select("id, stock_quantity")
        .eq("company_id", companyId)
        .in("id", productIds);

      const result: Record<string, { available: number; sufficient: boolean }> = {};
      items.forEach((item) => {
        const product = products?.find((p) => p.id === item.product_id);
        const available = product?.stock_quantity || 0;
        result[item.product_id] = {
          available,
          sufficient: available >= item.quantity,
        };
      });
      setStockCheck(result);
      setChecked(true);
    } catch {
      toast.error("Erro ao verificar estoque");
    } finally {
      setProcessing(false);
    }
  };

  const allSufficient = checked && Object.values(stockCheck).every((s) => s.sufficient);
  const hasInsufficient = checked && !allSufficient;

  const handleApprove = async () => {
    if (!companyId) return;
    setProcessing(true);
    try {
      // Update quote status to approved
      await supabase
        .from("quotes")
        .update({ status: "aprovado" } as any)
        .eq("id", quote.id)
        .eq("company_id", companyId);

      // Reserve stock if enabled
      if (reserveStock && checked) {
        // Store reservation in localStorage (keyed by quote id)
        const reservations = JSON.parse(localStorage.getItem("as_stock_reservations") || "{}");
        reservations[quote.id] = {
          items: items.map((i) => ({ product_id: i.product_id, name: i.name, quantity: i.quantity })),
          reserved_at: new Date().toISOString(),
          client_name: quote.client_name,
        };
        localStorage.setItem("as_stock_reservations", JSON.stringify(reservations));

        toast.success("Orçamento aprovado com estoque reservado!", { duration: 2000 });
      } else {
        toast.success("Orçamento aprovado!", { duration: 2000 });
      }

      onApproved();
    } catch (err: any) {
      toast.error(`Erro ao aprovar: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-success" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Aprovar Orçamento</h2>
              <p className="text-xs text-muted-foreground">{quote.client_name || "Sem cliente"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Items */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Itens do Orçamento
            </p>
            <div className="space-y-1.5">
              {items.map((item, i) => {
                const stock = stockCheck[item.product_id];
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${
                      stock && !stock.sufficient
                        ? "bg-destructive/5 border-destructive/20"
                        : "bg-muted/50 border-border"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-foreground truncate">
                        {item.quantity}x {item.name}
                      </p>
                      {stock && (
                        <p
                          className={`text-[10px] ${
                            stock.sufficient ? "text-emerald-500" : "text-destructive"
                          }`}
                        >
                          Estoque: {stock.available} {stock.sufficient ? "✓" : `(faltam ${item.quantity - stock.available})`}
                        </p>
                      )}
                    </div>
                    <span className="font-mono font-bold text-foreground shrink-0 ml-2">
                      {fmt(item.unit_price * item.quantity)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Total */}
          <div className="flex justify-between items-center p-3 rounded-xl bg-primary/5 border border-primary/20">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="text-lg font-bold font-mono text-primary">{fmt(quote.total)}</span>
          </div>

          {/* Stock reservation toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Reservar Estoque</p>
                <p className="text-[10px] text-muted-foreground">Impede que itens sejam vendidos a outros</p>
              </div>
            </div>
            <Switch checked={reserveStock} onCheckedChange={setReserveStock} />
          </div>

          {/* Stock check button */}
          {!checked && (
            <Button onClick={checkStock} disabled={processing} variant="outline" className="w-full">
              {processing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Package className="w-4 h-4 mr-2" />
              )}
              Verificar Disponibilidade
            </Button>
          )}

          {/* Insufficient stock warning */}
          {hasInsufficient && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-600">Estoque insuficiente para alguns itens</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Você ainda pode aprovar, mas a reserva será parcial.
                </p>
              </div>
            </div>
          )}

          {/* All OK */}
          {allSufficient && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              <p className="text-xs font-semibold text-emerald-600">
                Todos os itens têm estoque disponível!
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleApprove}
            disabled={processing || (reserveStock && !checked)}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {processing ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            Aprovar
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
