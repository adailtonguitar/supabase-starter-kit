import { useRef } from "react";
import { AlertTriangle, Package } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { PDVProduct } from "@/hooks/usePDV";
import type { CartItem } from "@/hooks/pdv/usePDVCart";
import anthoLogo from "@/assets/logo-as.png";

interface PDVCartTableProps {
  cartItems: CartItem[];
  products: PDVProduct[];
  itemDiscounts: Record<string, number>;
  promoMatches: Record<string, { promoName: string; originalPrice: number; finalPrice: number; savingsPerUnit: number; totalSavings: number }>;
  itemNotes: Record<string, string>;
  selectedCartItemId: string | null;
  onSelectItem: (id: string) => void;
  companyName: string | null;
  logoUrl: string | null;
  slogan: string | null;
  fiscalInvalidItems?: Record<string, string[]>;
}

export function PDVCartTable({
  cartItems, products, itemDiscounts, promoMatches, itemNotes,
  selectedCartItemId, onSelectItem, companyName, logoUrl, slogan,
  fiscalInvalidItems,
}: PDVCartTableProps) {
  const tableEndRef = useRef<HTMLTableRowElement>(null);

  return (
    <div data-tour="pdv-cart" className="flex-1 lg:flex-[7] flex flex-col min-w-0 border-r border-border min-h-[30vh] lg:min-h-0 lg:max-h-none">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <table className="w-full text-xs table-fixed">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm shadow-sm">
            <tr className="text-muted-foreground text-left uppercase tracking-widest">
              <th className="px-1 py-2 font-black w-6 lg:w-10 text-center text-[10px]">#</th>
              <th className="px-1 py-2 font-black w-16 lg:w-28 text-[10px] hidden sm:table-cell">Código</th>
              <th className="px-1 py-2 font-black text-[10px]">Descrição</th>
              <th className="px-1 py-2 font-black text-center w-8 lg:w-24 text-[10px]">Qtd</th>
              <th className="px-1 py-2 font-black text-right w-16 lg:w-24 text-[10px] hidden sm:table-cell">Unit.</th>
              <th className="px-1 py-2 font-black text-right w-16 lg:w-28 text-[10px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {cartItems.length === 0 ? (
              <>
                <tr className="sm:hidden">
                  <td colSpan={4} className="text-center py-0">
                    <div className="flex flex-col items-center justify-center py-8 gap-3">
                      {logoUrl && (
                        <img src={logoUrl} alt={companyName || "Logo"} className="h-24 object-contain" />
                      )}
                      <span className="text-xs text-muted-foreground/50">Aguardando leitura...</span>
                    </div>
                  </td>
                </tr>
                <tr className="hidden sm:table-row">
                  <td colSpan={6} className="text-center py-0">
                    <div className="flex flex-col items-center justify-center py-12 gap-5">
                      {logoUrl && (
                        <img src={logoUrl} alt={companyName || "Logo"} className="h-44 object-contain" />
                      )}
                      {companyName && (
                        <span className="text-lg font-bold text-foreground/60">{companyName}</span>
                      )}
                      {slogan && (
                        <span className="text-sm text-muted-foreground italic">{slogan}</span>
                      )}
                      <span className="text-xs text-muted-foreground/50 mt-2">Aguardando leitura de código de barras...</span>
                    </div>
                  </td>
                </tr>
              </>
            ) : (
              cartItems.map((item, idx) => {
                const isLast = idx === cartItems.length - 1;
                const itemDiscount = itemDiscounts[item.id] || 0;
                const promoMatch = promoMatches?.[item.id];
                const effectivePrice = promoMatch ? promoMatch.finalPrice : item.price;
                const unitPrice = effectivePrice * (1 - itemDiscount / 100);
                const subtotalItem = unitPrice * item.quantity;
                const isWeighed = !Number.isInteger(item.quantity);

                return (
                  <tr
                    key={item.id}
                    ref={isLast ? tableEndRef : undefined}
                    onClick={(e) => { e.stopPropagation(); onSelectItem(item.id); }}
                    className={`border-b border-border cursor-pointer transition-all duration-200 ${
                      selectedCartItemId === item.id
                        ? "bg-primary/20 ring-2 ring-primary ring-inset font-bold"
                        : isLast && !selectedCartItemId
                        ? "bg-primary/10 font-bold animate-pulse-once"
                        : idx % 2 === 0
                        ? "bg-card"
                        : "bg-muted/30"
                    } hover:bg-accent/50`}
                  >
                    <td className="px-1 py-1.5 text-center text-muted-foreground font-mono text-[10px]">{idx + 1}</td>
                    <td className="px-1 py-1.5 font-mono text-muted-foreground text-[10px] truncate hidden sm:table-cell">{item.sku}</td>
                    <td className="px-1 py-1.5 text-foreground truncate">
                      <div className="flex items-center gap-1">
                        {item.name}
                        {isWeighed && (
                          <span className="ml-1.5 text-[10px] text-primary font-bold">
                            {item.quantity.toFixed(3)}kg × {formatCurrency(item.price)}
                          </span>
                        )}
                        {itemDiscount > 0 && (
                          <span className="ml-1.5 text-[10px] text-destructive font-bold">-{itemDiscount}%</span>
                        )}
                        {promoMatch && (
                          <span className="ml-1 text-[9px] bg-primary/20 text-primary font-bold rounded px-1 py-0.5" title={promoMatch.promoName}>
                            🏷️ {promoMatch.promoName}
                          </span>
                        )}
                        {(() => {
                          const prod = products.find(p => p.id === item.id);
                          const costPrice = prod?.cost_price;
                          const reorder = prod?.reorder_point || 0;
                          const remaining = (prod?.stock_quantity || 0) - item.quantity;
                          const isBelowCost = costPrice && costPrice > 0 && item.price <= costPrice;
                          const marginPercent = costPrice && costPrice > 0 ? ((item.price - costPrice) / costPrice) * 100 : null;
                          const isLowMargin = marginPercent !== null && marginPercent > 0 && marginPercent < 10;
                          return (
                            <>
                              {isBelowCost && (
                                <span className="ml-1 flex items-center gap-0.5 text-[9px] text-destructive font-bold bg-destructive/10 rounded px-1 py-0.5" title={`Custo: R$ ${costPrice.toFixed(2)} | Venda: R$ ${item.price.toFixed(2)}`}>
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  PREJUÍZO
                                </span>
                              )}
                              {!isBelowCost && isLowMargin && (
                                <span className="ml-1 flex items-center gap-0.5 text-[9px] text-warning font-bold bg-warning/10 rounded px-1 py-0.5" title={`Margem: ${marginPercent!.toFixed(1)}%`}>
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  {marginPercent!.toFixed(0)}%
                                </span>
                              )}
                              {reorder > 0 && remaining <= reorder && remaining > 0 && (
                                <span className="ml-1 flex items-center gap-0.5 text-[9px] text-warning font-bold" title={`Estoque: ${remaining} ${prod?.unit || 'un'}`}>
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                </span>
                              )}
                            </>
                          );
                        })()}
                        {itemNotes[item.id] && (
                          <span className="ml-1 text-[9px] text-accent-foreground bg-accent/50 rounded px-1 truncate max-w-[80px]" title={itemNotes[item.id]}>
                            📝 {itemNotes[item.id]}
                          </span>
                        )}
                        {fiscalInvalidItems?.[item.id] && (
                          <span className="ml-1 flex items-center gap-0.5 text-[9px] text-destructive font-bold bg-destructive/10 rounded px-1 py-0.5" title={`Faltando: ${fiscalInvalidItems[item.id].join(", ")}`}>
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {fiscalInvalidItems[item.id].join(", ")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1.5 text-center font-mono font-bold text-foreground text-[10px]">
                      {isWeighed ? item.quantity.toFixed(3) : item.quantity}
                    </td>
                    <td className="px-1 py-1.5 text-right font-mono text-muted-foreground text-[10px] hidden sm:table-cell">
                      {(itemDiscount > 0 || promoMatch) && (
                        <span className="line-through opacity-50 mr-1">{formatCurrency(item.price)}</span>
                      )}
                      {formatCurrency(unitPrice)}
                    </td>
                    <td className="px-1 py-1.5 text-right font-mono font-bold text-primary text-[11px]">
                      {formatCurrency(subtotalItem)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
