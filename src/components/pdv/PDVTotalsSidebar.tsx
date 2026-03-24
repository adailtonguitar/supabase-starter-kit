import { motion } from "framer-motion";
import { Package } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CartItem } from "@/hooks/pdv/usePDVCart";

interface PDVTotalsSidebarProps {
  cartItems: CartItem[];
  products: Array<{ id: string; image_url?: string; price: number }>;
  subtotal: number;
  total: number;
  globalDiscountPercent: number;
  globalDiscountValue: number;
  promoSavings: number;
  selectedCartItemId: string | null;
  // Inline editors
  editingItemDiscountId: string | null;
  editingGlobalDiscount: boolean;
  editingQtyItemId: string | null;
  editingQtyValue: string;
  maxDiscountPercent: number;
  itemDiscounts: Record<string, number>;
  onSetItemDiscount: (id: string, val: number) => void;
  onSetGlobalDiscount: (val: number) => void;
  onCloseItemDiscount: () => void;
  onCloseGlobalDiscount: () => void;
  onCloseQtyEdit: () => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onQtyValueChange: (val: string) => void;
}

export function PDVTotalsSidebar({
  cartItems, products, subtotal, total, globalDiscountPercent, globalDiscountValue,
  promoSavings, selectedCartItemId,
  editingItemDiscountId, editingGlobalDiscount, editingQtyItemId, editingQtyValue,
  maxDiscountPercent, itemDiscounts,
  onSetItemDiscount, onSetGlobalDiscount, onCloseItemDiscount, onCloseGlobalDiscount,
  onCloseQtyEdit, onUpdateQuantity, onQtyValueChange,
}: PDVTotalsSidebarProps) {
  const totalItems = cartItems.length;
  const totalQty = cartItems.reduce((a, i) => a + i.quantity, 0);

  const activeItem = selectedCartItemId
    ? cartItems.find(i => i.id === selectedCartItemId)
    : cartItems[cartItems.length - 1];

  return (
    <div className="shrink-0 lg:shrink lg:flex-[3] flex flex-col bg-muted/40 lg:min-w-[260px] lg:max-w-[380px] min-h-0 lg:border-l-2 lg:border-primary/20">
      <div className="flex-1 flex flex-col p-1 lg:p-4 gap-0 lg:gap-1 overflow-y-auto">
        {/* Mobile compact row */}
        <div className="flex lg:hidden items-center justify-between px-2 py-1.5 border-b border-border/60 text-[10px]">
          <span className="font-bold text-muted-foreground">{totalItems} itens · Qtd: {Number.isInteger(totalQty) ? totalQty : totalQty.toFixed(3)}</span>
          <span className="font-bold text-foreground font-mono">Sub: {formatCurrency(subtotal)}</span>
        </div>
        {/* Desktop rows */}
        <div className="hidden lg:flex justify-between items-center py-3 border-b-2 border-border/60 px-1">
          <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">Itens</span>
          <span className="text-xl font-black text-foreground font-mono tabular-nums">{totalItems}</span>
        </div>
        <div className="hidden lg:flex justify-between items-center py-3 border-b-2 border-border/60 px-1">
          <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">Qtd Total</span>
          <span className="text-xl font-black text-foreground font-mono tabular-nums">
            {Number.isInteger(totalQty) ? totalQty : totalQty.toFixed(3)}
          </span>
        </div>
        <div className="hidden lg:flex justify-between items-center py-3 border-b-2 border-border/60 px-1">
          <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">Subtotal</span>
          <span className="text-xl font-black text-foreground font-mono tabular-nums">{formatCurrency(subtotal)}</span>
        </div>

        {/* Active product photo */}
        {activeItem && (
          <div className="hidden lg:flex flex-col items-center gap-2 py-3 border-b border-primary/30 bg-primary/5 rounded-lg px-2">
            {activeItem.image_url ? (
              <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg">
                <img src={activeItem.image_url} alt={activeItem.name} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-xl bg-muted/80 border-2 border-border flex items-center justify-center">
                <Package className="w-10 h-10 text-muted-foreground/40" />
              </div>
            )}
            <div className="text-center">
              <span className="text-xs font-bold text-foreground block truncate max-w-[200px]">{activeItem.name}</span>
              <span className="text-sm font-black text-primary font-mono">{formatCurrency(activeItem.price)}</span>
            </div>
          </div>
        )}

        {/* Item discount inline editor (desktop) */}
        {editingItemDiscountId && (
          <div className="hidden lg:block">
            <InlineNumberEditor
              label="Desc. Item %"
              suffix="%"
              defaultValue={itemDiscounts[editingItemDiscountId] || 0}
              max={maxDiscountPercent}
              onConfirm={(val) => { onSetItemDiscount(editingItemDiscountId, val); onCloseItemDiscount(); }}
              onCancel={onCloseItemDiscount}
            />
          </div>
        )}

        {/* Global discount */}
        <div className="flex justify-between items-center py-1 lg:py-2 border-b border-border">
          <span className="text-xs font-bold text-muted-foreground uppercase">Desconto</span>
          {editingGlobalDiscount ? (
            <div className="hidden lg:block">
              <InlineNumberEditor
                label=""
                suffix="%"
                defaultValue={globalDiscountPercent}
                max={maxDiscountPercent}
                onConfirm={(val) => { onSetGlobalDiscount(val); onCloseGlobalDiscount(); }}
                onCancel={onCloseGlobalDiscount}
              />
            </div>
          ) : (
            <button
              onClick={() => {}}
              className="text-sm font-bold text-foreground font-mono"
            >
              {globalDiscountPercent > 0
                ? `${globalDiscountPercent}% (-${formatCurrency(globalDiscountValue)})`
                : "0%"}
            </button>
          )}
        </div>

        {/* Promo savings */}
        {promoSavings > 0 && (
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-xs font-bold text-primary uppercase">Economia</span>
            <span className="text-lg font-bold text-primary font-mono">-{formatCurrency(promoSavings)}</span>
          </div>
        )}

        {/* Qty editor (desktop) */}
        {editingQtyItemId && (
          <div className="hidden lg:block">
            <div className="bg-muted/50 border-b border-border flex flex-row justify-between items-center py-2 px-2 -mx-2 rounded">
              <span className="text-xs font-bold text-muted-foreground uppercase">Nova Quantidade</span>
              <div className="flex items-center gap-2">
                <input
                  data-no-barcode-capture="true"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  autoFocus
                  value={editingQtyValue}
                  onChange={(e) => onQtyValueChange(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      const newQty = Math.max(1, parseInt(editingQtyValue) || 1);
                      const item = cartItems.find(i => i.id === editingQtyItemId);
                      if (item) onUpdateQuantity(editingQtyItemId, newQty - item.quantity);
                      onCloseQtyEdit();
                    }
                    if (e.key === "Escape") onCloseQtyEdit();
                  }}
                  className="w-20 px-2 py-2 rounded border border-primary bg-background text-base font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TOTAL display */}
      <div
        data-tour="pdv-total"
        className="p-2 lg:p-5 xl:p-6 mt-auto border-t-4 transition-all duration-500 flex-shrink-0 overflow-hidden relative"
        style={{
          backgroundColor: total > 0 ? "hsl(0, 72%, 38%)" : "hsl(142, 76%, 30%)",
          borderTopColor: total > 0 ? "hsl(0, 80%, 55%)" : "hsl(142, 80%, 48%)",
          boxShadow: `inset 0 4px 20px rgba(0,0,0,0.3), 0 -2px 15px ${total > 0 ? "hsla(0, 72%, 40%, 0.3)" : "hsla(142, 72%, 32%, 0.3)"}`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent pointer-events-none" />
        <div className="text-center relative">
          <span className="text-[9px] lg:text-sm font-black uppercase tracking-[0.4em] block mb-0.5 lg:mb-2" style={{ color: "rgba(255,255,255,0.85)" }}>
            {total > 0 ? "TOTAL A PAGAR" : "TOTAL DA VENDA"}
          </span>
          <motion.span
            key={total}
            initial={{ scale: 1.08, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="text-3xl lg:text-5xl xl:text-6xl 2xl:text-7xl font-black font-mono tracking-tight block leading-none truncate"
            style={{ color: "hsl(var(--foreground))", textShadow: "0 4px 24px rgba(0,0,0,0.6), 0 0 40px rgba(255,255,255,0.1)" }}
          >
            {formatCurrency(total)}
          </motion.span>
        </div>
      </div>
    </div>
  );
}

function InlineNumberEditor({ label, suffix, defaultValue, max, onConfirm, onCancel }: {
  label: string; suffix: string; defaultValue: number; max: number;
  onConfirm: (val: number) => void; onCancel: () => void;
}) {
  return (
    <div className="bg-muted/50 border-b border-border flex flex-row justify-between items-center py-2 px-2 -mx-2 rounded">
      {label && <span className="text-xs font-bold text-muted-foreground uppercase">{label}</span>}
      <div className="flex items-center gap-1">
        <input
          data-no-barcode-capture="true"
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={0.5}
          autoFocus
          defaultValue={defaultValue}
          onClick={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              const val = Math.min(Math.max(0, Number((e.target as HTMLInputElement).value)), max);
              onConfirm(val);
            }
            if (e.key === "Escape") onCancel();
          }}
          className="w-20 px-2 py-2 rounded border border-primary bg-background text-base font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <span className="text-xs text-muted-foreground font-bold">{suffix}</span>
      </div>
    </div>
  );
}
