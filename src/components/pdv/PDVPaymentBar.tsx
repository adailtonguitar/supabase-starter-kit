import { motion } from "framer-motion";
import { Banknote, CreditCard, Wallet, QrCode, Ticket, Clock as ClockIcon, MoreHorizontal, FileText, Play, RotateCcw, MessageSquare, Tv, X, Hash, Percent, Trash2, Pause } from "lucide-react";
import { toast } from "sonner";
import type { CartItem } from "@/hooks/pdv/usePDVCart";

interface PDVPaymentBarProps {
  cartItems: CartItem[];
  canUseFiscal: boolean;
  skipFiscalEmission: boolean;
  pdvAutoEmitNfce: boolean;
  selectedClientName?: string;
  fiscalCustomerDoc?: string;
  fiscalCustomerReady?: boolean;
  fiscalFinalizeBlocked?: boolean;
  fiscalFinalizeBlockReason?: string;
  onDirectPayment: (method: string) => void;
  onCheckout: () => void;
  onClearCart: () => void;
  onHoldSale: () => void;
  onShowHoldRecall: () => void;
  onShowReturnExchange: () => void;
  onShowProductList: () => void;
  onShowLoyaltyClient: () => void;
  onShowPriceLookup: () => void;
  onShowSaveQuote: () => void;
  onShowReceiveCredit: () => void;
  onOpenCustomerDisplay: () => void;
  onEditItemNote: () => void;
  onAddLastItem: () => void;
  onEditQty: () => void;
  onEditItemDiscount: () => void;
  onEditGlobalDiscount: () => void;
  onRemoveItem: () => void;
  selectedCartItemId: string | null;
  onClearClient: () => void;
  onClearSelectedItem: () => void;
  maxDiscountPercent: number;
}

export function PDVPaymentBar({
  cartItems, canUseFiscal, skipFiscalEmission, pdvAutoEmitNfce, selectedClientName, fiscalCustomerDoc, fiscalCustomerReady,
  fiscalFinalizeBlocked, fiscalFinalizeBlockReason,
  onDirectPayment, onCheckout, onClearCart, onHoldSale,
  onShowHoldRecall, onShowReturnExchange, onShowProductList,
  onShowLoyaltyClient, onShowPriceLookup, onShowSaveQuote,
  onShowReceiveCredit, onOpenCustomerDisplay, onEditItemNote,
  onAddLastItem, onEditQty, onEditItemDiscount, onEditGlobalDiscount,
  onRemoveItem, selectedCartItemId, onClearClient, onClearSelectedItem,
  maxDiscountPercent,
}: PDVPaymentBarProps) {
  const hasItems = cartItems.length > 0;

  return (
    <div className="flex flex-col flex-shrink-0 border-t-2 border-primary/30 bg-card shadow-[0_-4px_16px_-6px_rgba(0,0,0,0.15)]">
      {/* Mobile Action Bar */}
      <div className="flex lg:hidden items-center gap-1.5 px-2 py-1.5 border-b border-border bg-muted/50 flex-wrap flex-shrink-0">
        <MobileBtn icon={Hash} label="Qtd" disabled={!hasItems} onClick={onEditQty} />
        <MobileBtn icon={Percent} label="Desc.Item" disabled={!hasItems} onClick={onEditItemDiscount} />
        <MobileBtn icon={Percent} label="Desc.Total" disabled={!hasItems} onClick={() => maxDiscountPercent > 0 && onEditGlobalDiscount()} />
        <MobileBtn icon={Trash2} label="Remover" disabled={!hasItems} onClick={onRemoveItem} variant="destructive" />
        <MobileBtn icon={X} label="Cancelar" disabled={!hasItems} onClick={() => { if (hasItems) { onClearCart(); onClearClient(); onClearSelectedItem(); toast.info("Venda cancelada", { duration: 1500 }); } }} variant="destructive" />
        <MobileBtn icon={FileText} label="Orçamento" disabled={!hasItems} onClick={() => { if (hasItems) onShowSaveQuote(); else toast.warning("Carrinho vazio", { duration: 1200 }); }} variant="primary" />
        <MobileBtn icon={Pause} label="Suspender" disabled={!hasItems} onClick={onHoldSale} variant="warning" />
        <MobileBtn icon={Play} label="Retomar" onClick={onShowHoldRecall} />
      </div>

      {/* Payment method buttons */}
      <div className="flex items-stretch gap-1 lg:gap-1.5 px-1.5 lg:px-3 py-1 lg:py-2 flex-wrap">
        {[
          { id: "dinheiro", label: "Dinheiro", icon: Banknote, colorClass: "bg-emerald-900/70 hover:bg-emerald-800/80 text-emerald-50 border border-emerald-600/50 shadow-sm" },
          { id: "debito", label: "Débito", icon: CreditCard, colorClass: "bg-blue-900/70 hover:bg-blue-800/80 text-blue-50 border border-blue-600/50 shadow-sm" },
          { id: "credito", label: "Crédito", icon: Wallet, colorClass: "bg-violet-900/70 hover:bg-violet-800/80 text-violet-50 border border-violet-600/50 shadow-sm" },
          { id: "pix", label: "PIX", icon: QrCode, colorClass: "bg-teal-900/70 hover:bg-teal-800/80 text-teal-50 border border-teal-600/50 shadow-sm" },
          { id: "voucher", label: "Voucher", icon: Ticket, colorClass: "bg-amber-900/70 hover:bg-amber-800/80 text-amber-50 border border-amber-600/50 shadow-sm" },
          { id: "prazo", label: "A Prazo", icon: ClockIcon, colorClass: "bg-orange-900/70 hover:bg-orange-800/80 text-orange-50 border border-orange-600/50 shadow-sm" },
          { id: "multi", label: "Múltiplas", icon: MoreHorizontal, colorClass: "bg-orange-900/70 hover:bg-orange-800/80 text-orange-50 border border-orange-600/50 shadow-sm" },
        ].map(({ id, label, icon: Icon, colorClass }, idx) => (
          <motion.button
            key={id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.03, duration: 0.2 }}
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onDirectPayment(id)}
            disabled={!hasItems || !!fiscalFinalizeBlocked}
            title={fiscalFinalizeBlocked ? fiscalFinalizeBlockReason : undefined}
            className={`flex-1 min-w-[44px] basis-[calc(25%-4px)] lg:basis-auto flex flex-col items-center justify-center gap-0.5 py-2 lg:py-2.5 xl:py-3 rounded-lg lg:rounded-xl text-sm font-extrabold tracking-wide transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 ${colorClass}`}
          >
            <Icon className="w-4 h-4 lg:w-5 lg:h-5 xl:w-6 xl:h-6" />
            <span className="text-[10px] lg:text-[11px] xl:text-xs font-bold">{label}</span>
          </motion.button>
        ))}
      </div>

      {/* Fiscal status */}
      {canUseFiscal && (
        <div className="flex items-center justify-between gap-2 px-2 py-1 bg-muted/40 border-t border-border">
          <div className="min-w-0 text-[11px]">
            {!skipFiscalEmission && selectedClientName && fiscalCustomerReady && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                NFC-e identificada: {selectedClientName}
              </span>
            )}
            {!skipFiscalEmission && selectedClientName && !fiscalCustomerReady && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                Cliente selecionado sem documento fiscal valido
              </span>
            )}
            {!skipFiscalEmission && fiscalFinalizeBlocked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/20">
                {fiscalFinalizeBlockReason || "Finalize sem NFC-e ou informe um documento valido"}
              </span>
            )}
            {!skipFiscalEmission && !selectedClientName && (
              <span className="text-muted-foreground">
                NFC-e saira como consumidor nao identificado
              </span>
            )}
            {!skipFiscalEmission && fiscalCustomerDoc && !selectedClientName && (
              <span className="text-muted-foreground">{fiscalCustomerDoc}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
            <FileText className="w-3 h-3" />
            <span>{pdvAutoEmitNfce ? "NFC-e automática" : "NFC-e automática desativada"}</span>
          </div>
        </div>
      )}

      {/* Desktop shortcut bar */}
      <div data-tour="pdv-shortcuts" className="hidden lg:flex items-center justify-center gap-1 xl:gap-1.5 px-2 py-1.5 xl:py-2 bg-muted/80 border-t-2 border-border/60 flex-wrap">
        {/* Grupo: Operações */}
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-background/50 border border-border/40">
          {[
            { key: "F3", label: "Buscar", action: onShowProductList },
            { key: "F5", label: "Cliente", action: onShowLoyaltyClient },
            { key: "F10", label: "Consulta", action: onShowPriceLookup },
            { key: "+", label: "Repetir", action: onAddLastItem },
            { key: "F11", label: "Suspender", action: onHoldSale, color: "bg-warning/70 hover:bg-warning/80 text-warning-foreground border border-warning/50" },
          ].map(({ key, label, action, color }) => (
            <ShortcutBtn key={key} shortcut={key} label={label} onClick={action} color={color} />
          ))}
        </div>
        {/* Grupo: Edição */}
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-background/50 border border-border/40">
          {[
            { key: "F7", label: "Desc.Item", action: onEditItemDiscount },
            { key: "F8", label: "Desc.Total", action: onEditGlobalDiscount },
            { key: "F9", label: "Qtd", action: onEditQty },
            { key: "DEL", label: "Remover", action: onRemoveItem, color: "bg-destructive/80 hover:bg-destructive text-white border border-destructive/50" },
          ].map(({ key, label, action, color }) => (
            <ShortcutBtn key={key} shortcut={key} label={label} onClick={action} color={color} />
          ))}
        </div>
        {/* Grupo: Extras */}
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-background/50 border border-border/40">
          <ShortcutBtn icon={Play} label="Retomar" onClick={onShowHoldRecall} />
          <ShortcutBtn icon={RotateCcw} label="Devolução" onClick={onShowReturnExchange} />
          <ShortcutBtn icon={MessageSquare} label="Obs." onClick={onEditItemNote} />
          <ShortcutBtn icon={Wallet} label="Receber Fiado" onClick={onShowReceiveCredit} />
          <ShortcutBtn icon={Tv} label="2º Monitor" onClick={onOpenCustomerDisplay} />
        </div>
        {/* Grupo: Finalização */}
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-primary/10 border border-primary/30">
          <ShortcutBtn shortcut="Orç." label="Orçamento" onClick={() => { if (hasItems) onShowSaveQuote(); else toast.warning("Carrinho vazio", { duration: 1200 }); }} />
          <ShortcutBtn shortcut="F6" label="Cancelar" onClick={() => { if (hasItems) { onClearCart(); onClearClient(); onClearSelectedItem(); toast.info("Venda cancelada"); } }} color="bg-destructive/80 hover:bg-destructive text-white border border-destructive/50" />
          <ShortcutBtn
            shortcut="F12"
            label="FINALIZAR"
            onClick={onCheckout}
            color="bg-primary hover:bg-primary/90 text-primary-foreground border border-primary/50 shadow-md shadow-primary/20"
            bold
            disabled={!!fiscalFinalizeBlocked}
            title={fiscalFinalizeBlocked ? fiscalFinalizeBlockReason : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function MobileBtn({ icon: Icon, label, disabled, onClick, variant }: {
  icon: React.ElementType; label: string; disabled?: boolean; onClick: () => void;
  variant?: "destructive" | "primary" | "warning";
}) {
  const base = "flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap active:scale-95 transition-transform";
  const colors = variant === "destructive"
    ? "bg-destructive/80 text-white border border-destructive/50"
    : variant === "primary"
    ? "bg-primary/80 text-primary-foreground border border-primary/50"
    : variant === "warning"
    ? "bg-warning/70 text-warning-foreground border border-warning/50"
    : "bg-sidebar-background text-sidebar-foreground border border-sidebar-border";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${colors} disabled:opacity-30`}>
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
}

function ShortcutBtn({ shortcut, icon: Icon, label, onClick, color, bold, disabled, title }: {
  shortcut?: string; icon?: React.ElementType; label: string; onClick: () => void;
  color?: string; bold?: boolean; disabled?: boolean; title?: string;
}) {
  const base = color || "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1 ${bold ? "font-black" : "font-bold"} text-xs cursor-pointer rounded-lg px-${bold ? "2" : "1.5"} py-${bold ? "1.5" : "1"} transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${base}`}
    >
      {shortcut && <span className="font-mono font-black px-1.5 py-0.5 rounded bg-black/25 text-[10px] border border-white/20 shadow-sm">{shortcut}</span>}
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </button>
  );
}
