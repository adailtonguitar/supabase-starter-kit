import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import anthoLogo from "@/assets/logo-as.png";
import { motion } from "framer-motion";
import { isScaleBarcode, parseScaleBarcode } from "@/lib/scale-barcode";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useLoyalty } from "@/hooks/useLoyalty";
import { PDVProductGrid } from "@/components/pdv/PDVProductGrid";
import { PDVLoyaltyClientList } from "@/components/pdv/PDVLoyaltyClientList";
import { PDVQuickProductDialog } from "@/components/pdv/PDVQuickProductDialog";
import { PDVClientSelector, type CreditClient } from "@/components/pdv/PDVClientSelector";
import { PDVFiadoReceipt, type FiadoReceiptData } from "@/components/pdv/PDVFiadoReceipt";
import { PDVHoldRecallDialog, saveHeldSale, getHeldSales, type HeldSale } from "@/components/pdv/PDVHoldRecall";
import { PDVReturnExchangeDialog } from "@/components/pdv/PDVReturnExchange";
import { PDVItemNotesDialog } from "@/components/pdv/PDVItemNotes";
import { useCustomerDisplay } from "@/components/pdv/PDVCustomerDisplay";
import { SaleReceipt } from "@/components/pos/SaleReceipt";
import { TEFProcessor, type TEFResult } from "@/components/pos/TEFProcessor";
import { CashRegister } from "@/components/pos/CashRegister";
import { StockMovementDialog } from "@/components/stock/StockMovementDialog";
import { PDVReceiveCreditDialog } from "@/components/pdv/PDVReceiveCreditDialog";
import { usePDV, type PDVProduct } from "@/hooks/usePDV";
import { useQuotes } from "@/hooks/useQuotes";
import { useCompany } from "@/hooks/useCompany";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useTEFConfig } from "@/hooks/useTEFConfig";
import { Wifi, WifiOff, Keyboard, X, Search, Monitor, FileText, User, PackageX, PackagePlus, Package, Maximize, Minimize, Banknote, CreditCard, QrCode, Smartphone, Ticket, MoreHorizontal, Clock as ClockIcon, Trash2, Hash, Percent, AlertTriangle, Plus, Wallet, Pause, Play, RotateCcw, MessageSquare, Tv } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { PaymentResult } from "@/services/types";
import { openCashDrawer } from "@/lib/escpos";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { playAddSound, playErrorSound, playSaleCompleteSound } from "@/lib/pdv-sounds";
import { formatCurrency } from "@/lib/utils";

export default function PDV() {
  const pdv = usePDV();
  const navigate = useNavigate();
  const { companyName, companyId, logoUrl, slogan, pixKey, pixKeyType, pixCity, cnpj, ie, phone, addressStreet, addressNumber, addressNeighborhood, addressCity, addressState } = useCompany();
  const { config: tefConfigData } = useTEFConfig();
  const { maxDiscountPercent } = usePermissions();
  const planFeatures = usePlanFeatures();
  const canUseFiscal = planFeatures.canUseFiscal();
  const { earnPoints, isActive: loyaltyActive } = useLoyalty();
  const { createQuote, updateQuoteStatus } = useQuotes({ skipInitialFetch: true });
  const [showSaveQuote, setShowSaveQuote] = useState(false);
  const [quoteNotes, setQuoteNotes] = useState("");
  const [showTEF, setShowTEF] = useState(false);
  const [tefDefaultMethod, setTefDefaultMethod] = useState<string | null>(null);
  const [skipFiscalEmission, setSkipFiscalEmission] = useState(!canUseFiscal);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [receipt, setReceipt] = useState<{
    items: typeof pdv.cartItems;
    total: number;
    payments: TEFResult[];
    nfceNumber: string;
    accessKey?: string;
    serie?: string;
    isContingency?: boolean;
    saleId?: string;
    customerCpf?: string;
    protocolNumber?: string;
    protocolDate?: string;
    itemNotes?: Record<string, string>;
  } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showProductList, setShowProductList] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [zeroStockProduct, setZeroStockProduct] = useState<PDVProduct | null>(null);
  const [stockMovementProduct, setStockMovementProduct] = useState<PDVProduct | null>(null);
  const [showQuickProduct, setShowQuickProduct] = useState(false);
  const [quickProductBarcode, setQuickProductBarcode] = useState("");
  const [showClientSelector, setShowClientSelector] = useState(false);
  const [showReceiveCredit, setShowReceiveCredit] = useState(false);
  const [selectedClient, setSelectedClient] = useState<CreditClient | null>(null);
  const [fiadoReceipt, setFiadoReceipt] = useState<FiadoReceiptData | null>(null);
  const [showLoyaltyClientSelector, setShowLoyaltyClientSelector] = useState(false);
  const [showPriceLookup, setShowPriceLookup] = useState(false);
  const [priceLookupQuery, setPriceLookupQuery] = useState("");
  const [terminalId, setTerminalId] = useState(() => localStorage.getItem("pdv_terminal_id") || "01");
  const [showTerminalPicker, setShowTerminalPicker] = useState(false);
  const [tempTerminalId, setTempTerminalId] = useState(terminalId);
  const [editingQtyItemId, setEditingQtyItemId] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState("");
  const [editingItemDiscountId, setEditingItemDiscountId] = useState<string | null>(null);
  const [editingGlobalDiscount, setEditingGlobalDiscount] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const tableEndRef = useRef<HTMLTableRowElement>(null);
  const [saleNumber, setSaleNumber] = useState(() => Number(localStorage.getItem("pdv_sale_number") || "1"));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wantsFullscreenRef = useRef(false);
  const [selectedCartItemId, setSelectedCartItemId] = useState<string | null>(null);
  const [pendingQuoteId, setPendingQuoteId] = useState<string | null>(null);
  const [lastAddedItem, setLastAddedItem] = useState<{ name: string; price: number; image_url?: string } | null>(null);
  const lastAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizingSale = pdv.finalizingSale;
  const requireCashSession = localStorage.getItem("pdv_require_cash_session") !== "false";
  // ── New features ──
  const [showHoldRecall, setShowHoldRecall] = useState(false);
  const [showReturnExchange, setShowReturnExchange] = useState(false);
  const [editingItemNoteId, setEditingItemNoteId] = useState<string | null>(null);
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [itemDiscountValues, setItemDiscountValues] = useState<Record<string, number>>({}); // R$ discount per item
  const customerDisplay = useCustomerDisplay();

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      wantsFullscreenRef.current = true;
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      wantsFullscreenRef.current = false;
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      // If browser exited fullscreen (e.g. ESC) but user wants to stay fullscreen, re-enter
      if (!isFull && wantsFullscreenRef.current) {
        setTimeout(() => {
          if (!document.fullscreenElement && wantsFullscreenRef.current) {
            document.documentElement.requestFullscreen().catch(() => {
              wantsFullscreenRef.current = false;
            });
          }
        }, 300);
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useBarcodeScanner(pdv.handleBarcodeScan);

  // Track if user manually dismissed the cash register dialog
  const cashRegisterDismissedRef = useRef(false);
  const [forceClosedAlert, setForceClosedAlert] = useState(false);
  const [forceClosedSnapshot, setForceClosedSnapshot] = useState<any>(null);

  // Load session for current terminal on mount and terminal change
  useEffect(() => {
    cashRegisterDismissedRef.current = false;
    pdv.reloadSession(terminalId);
  }, [terminalId]);

  // Realtime listener: detect force-close from Terminais panel
  useEffect(() => {
    if (!companyId || !pdv.currentSession) return;
    const sessionId = pdv.currentSession.id;
    const channel = supabase
      .channel(`pdv-session-${sessionId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "cash_sessions",
        filter: `id=eq.${sessionId}`,
      }, (payload: any) => {
        if (payload.new?.status === "fechado") {
          setForceClosedAlert(true);
          pdv.reloadSession(terminalId);
          playErrorSound();
          toast.error("Caixa fechado remotamente pelo gerente!", { duration: 10000 });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, pdv.currentSession?.id, terminalId]);

  // Auto-open cash register dialog if no session is open (only after first load completes)
  useEffect(() => {
    if (requireCashSession && pdv.sessionEverLoaded && !pdv.loadingSession && !pdv.currentSession && !showCashRegister && !cashRegisterDismissedRef.current) {
      setShowCashRegister(true);
    }
  }, [pdv.sessionEverLoaded, pdv.loadingSession, pdv.currentSession, showCashRegister, requireCashSession]);

  // Always re-focus barcode input when no modal is open
  const noModalOpen = !showTEF && !receipt && !showCashRegister && !showProductList && !showShortcuts && !showPriceLookup && !showLoyaltyClientSelector && !showQuickProduct && !showSaveQuote && !showTerminalPicker && !showClientSelector && !showReceiveCredit && !zeroStockProduct && !stockMovementProduct && !editingQtyItemId && !editingItemDiscountId && !editingGlobalDiscount && !showHoldRecall && !showReturnExchange && !editingItemNoteId;

  useEffect(() => {
    if (noModalOpen) {
      const t = setTimeout(() => barcodeInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [noModalOpen]);

  // Keep focus pinned to barcode input — re-focus every 500ms when idle
  useEffect(() => {
    if (!noModalOpen) return;
    const interval = setInterval(() => {
      const active = document.activeElement;
      if (active && (active as HTMLElement).dataset?.noBarcodeCapture) return;
      if (active !== barcodeInputRef.current) {
        barcodeInputRef.current?.focus();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [noModalOpen]);

  // Broadcast to customer display on cart/total changes
  useEffect(() => {
    customerDisplay.broadcast({
      items: pdv.cartItems,
      total: pdv.total,
      subtotal: pdv.subtotal,
      globalDiscountPercent: pdv.globalDiscountPercent,
      globalDiscountValue: pdv.globalDiscountValue,
      itemDiscounts: pdv.itemDiscounts,
      companyName: companyName || "",
      logoUrl,
      lastAdded: lastAddedItem,
    });
  }, [pdv.cartItems, pdv.total, pdv.subtotal, pdv.globalDiscountPercent, pdv.itemDiscounts, lastAddedItem]);

  // Hold current sale
  const handleHoldSale = useCallback(() => {
    if (pdv.cartItems.length === 0) { toast.warning("Carrinho vazio", { duration: 1200 }); return; }
    const held: HeldSale = {
      id: crypto.randomUUID(),
      items: pdv.cartItems.map(i => ({ ...i })),
      itemDiscounts: { ...pdv.itemDiscounts },
      globalDiscountPercent: pdv.globalDiscountPercent,
      clientName: selectedClient?.name,
      total: pdv.total,
      heldAt: new Date().toISOString(),
    };
    saveHeldSale(held);
    pdv.clearCart();
    setSelectedClient(null);
    setSelectedCartItemId(null);
    toast.success(`Venda suspensa (${getHeldSales().length} pendente${getHeldSales().length > 1 ? "s" : ""})`, { duration: 1500 });
  }, [pdv, selectedClient]);

  // Recall a held sale
  const handleRecallSale = useCallback((sale: HeldSale) => {
    if (pdv.cartItems.length > 0) {
      // Auto-hold current sale before recalling
      handleHoldSale();
    }
    // Restore items
    sale.items.forEach(item => {
      const product = pdv.products.find(p => p.id === item.id);
      if (product) {
        for (let i = 0; i < item.quantity; i++) pdv.addToCart(product);
      }
    });
    // Restore discounts
    Object.entries(sale.itemDiscounts).forEach(([id, disc]) => pdv.setItemDiscount(id, disc));
    pdv.setGlobalDiscountPercent(sale.globalDiscountPercent);
    toast.info("Venda retomada", { duration: 1200 });
  }, [pdv, handleHoldSale]);

  // Set item note
  const setItemNote = useCallback((id: string, note: string) => {
    setItemNotes(prev => ({ ...prev, [id]: note }));
    setEditingItemNoteId(null);
  }, []);

  // Set item fixed discount (R$)
  const setItemFixedDiscount = useCallback((id: string, value: number) => {
    setItemDiscountValues(prev => ({ ...prev, [id]: value }));
    // Convert R$ discount to % for the existing system
    const item = pdv.cartItems.find(i => i.id === id);
    if (item && item.price > 0) {
      const pct = Math.min((value / item.price) * 100, 100);
      pdv.setItemDiscount(id, pct);
    }
  }, [pdv.cartItems, pdv.setItemDiscount]);


  useEffect(() => {
    if (pdv.cartItems.length > 0) {
      tableEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [pdv.cartItems.length]);

  // Load quote from sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem("pdv_load_quote");
    if (raw && pdv.products.length > 0) {
      sessionStorage.removeItem("pdv_load_quote");
      try {
        const { quoteId, items, clientName } = JSON.parse(raw);
        if (quoteId) setPendingQuoteId(quoteId);
        if (Array.isArray(items)) {
          items.forEach((item: any) => {
            const product = pdv.products.find((p) => p.id === item.product_id);
            if (product) {
              for (let i = 0; i < (item.quantity || 1); i++) {
                pdv.addToCart(product);
              }
            }
          });
          if (clientName) toast.info(`Orçamento carregado — Cliente: ${clientName}`, { duration: 1500 });
          else toast.info("Orçamento carregado no carrinho", { duration: 1500 });
        }
      } catch { /* ignore */ }
    }
  }, [pdv.products.length]);

  const handleSaveQuote = async () => {
    if (pdv.cartItems.length === 0) { toast.warning("Carrinho vazio", { duration: 1200 }); return; }
    if (!selectedClient) { toast.warning("Selecione um cliente antes de salvar o orçamento", { duration: 2000 }); return; }
    try {
      const items = pdv.cartItems.map((item) => ({
        product_id: item.id, name: item.name, sku: item.sku,
        quantity: item.quantity, unit_price: item.price, unit: item.unit,
      }));
      await createQuote({
        items, subtotal: pdv.subtotal, discountPercent: pdv.globalDiscountPercent,
        discountValue: pdv.globalDiscountValue, total: pdv.total,
        clientName: selectedClient?.name, clientId: selectedClient?.id,
        notes: quoteNotes || undefined, validDays: 30,
      });
      toast.success("Orçamento salvo com sucesso!", { duration: 1500 });
      pdv.clearCart(); setSelectedClient(null); setShowSaveQuote(false); setQuoteNotes("");
    } catch (err: any) {
      toast.error(`Erro ao salvar orçamento: ${err.message}`);
    }
  };

  const handleCheckout = useCallback((defaultMethod?: string) => {
    if (!pdv.currentSession) {
      toast.warning("Abra o caixa antes de finalizar uma venda", { duration: 1500 });
      setShowCashRegister(true);
      return;
    }
    if (pdv.cartItems.length === 0) {
      toast.warning("Adicione itens ao carrinho primeiro", { duration: 1200 });
      return;
    }
    if (finalizingSale) {
      toast.warning("Venda em processamento, aguarde...", { duration: 1200 });
      return;
    }
    setTefDefaultMethod(defaultMethod || null);
    setShowTEF(true);
  }, [pdv.cartItems.length, pdv.currentSession, finalizingSale]);

  const handleDirectPayment = useCallback((method: string) => {
    if (pdv.cartItems.length === 0) {
      toast.warning("Adicione itens ao carrinho primeiro", { duration: 1200 });
      return;
    }
    if (finalizingSale) {
      toast.warning("Venda em processamento, aguarde...", { duration: 1200 });
      return;
    }
    if (method === "prazo") {
      handlePrazoRequested();
      return;
    }
    handleCheckout(method);
  }, [pdv.cartItems.length, handleCheckout, finalizingSale]);

  // Barcode manual input with multiplication support (e.g. 5*789123456789)
  const handleBarcodeSubmit = () => {
    const raw = barcodeInput.trim();
    if (!raw) return;
    if (!pdv.currentSession) {
      toast.warning("Abra o caixa antes de registrar produtos", { duration: 1500 });
      setShowCashRegister(true);
      setBarcodeInput("");
      return;
    }

    let query = raw;
    let multiplier = 1;

    // Parse multiplication: "5*789123456789"
    const multiMatch = raw.match(/^(\d+)\*(.+)$/);
    if (multiMatch) {
      multiplier = Math.max(1, parseInt(multiMatch[1], 10));
      query = multiMatch[2].trim();
    }

    // Scale barcode — handled by usePDV.handleBarcodeScan
    if (isScaleBarcode(query)) {
      pdv.handleBarcodeScan(query);
      playAddSound();
      setBarcodeInput("");
      return;
    }

    // Exact match
    const exactMatch = pdv.products.find(
      (p) => p.sku === query || p.barcode === query || p.id === query || p.ncm === query
    );
    if (exactMatch) {
      if (exactMatch.stock_quantity <= 0) {
        playErrorSound();
        setZeroStockProduct(exactMatch);
        setBarcodeInput("");
        return;
      }
      const qty = Math.min(multiplier, exactMatch.stock_quantity);
      if (qty < multiplier) {
        toast.warning(`Estoque insuficiente (${exactMatch.stock_quantity} ${exactMatch.unit}). Adicionando ${qty}.`, { duration: 2000 });
      }
      for (let i = 0; i < qty; i++) pdv.addToCart(exactMatch);
      playAddSound();
      setBarcodeInput("");
      return;
    }

    // Partial search
    const searchMatch = pdv.products.find(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase()) ||
        (p.ncm && p.ncm.includes(query))
    );
    if (searchMatch) {
      if (searchMatch.stock_quantity <= 0) {
        playErrorSound();
        setZeroStockProduct(searchMatch);
        setBarcodeInput("");
        return;
      }
      const qty = Math.min(multiplier, searchMatch.stock_quantity);
      if (qty < multiplier) {
        toast.warning(`Estoque insuficiente (${searchMatch.stock_quantity} ${searchMatch.unit}). Adicionando ${qty}.`, { duration: 2000 });
      }
      for (let i = 0; i < qty; i++) pdv.addToCart(searchMatch);
      playAddSound();
    } else {
      playErrorSound();
      toast.error(`Produto não encontrado: ${query}`, {
        action: {
          label: "Cadastrar",
          onClick: () => { setQuickProductBarcode(query); setShowQuickProduct(true); },
        },
      });
    }
    setBarcodeInput("");
  };

  const handleAddToCart = useCallback((product: PDVProduct) => {
    if (product.stock_quantity <= 0) {
      playErrorSound();
      setZeroStockProduct(product);
      return;
    }
    const added = pdv.addToCart(product);
    if (added) {
      playAddSound();
      // Show last added item highlight for 3s
      setLastAddedItem({ name: product.name, price: product.price, image_url: (product as any).image_url });
      if (lastAddedTimerRef.current) clearTimeout(lastAddedTimerRef.current);
      lastAddedTimerRef.current = setTimeout(() => setLastAddedItem(null), 3000);
    }
  }, [pdv]);

  // Keyboard shortcuts — work everywhere including from barcode input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Allow F-keys from any element (including input)
      const isFKey = e.key.startsWith("F") && e.key.length <= 3;
      const isDelete = e.key === "Delete";
      const isEscape = e.key === "Escape";
      const isArrow = e.key === "ArrowUp" || e.key === "ArrowDown";
      const isPlus = e.key === "+" && !(e.target instanceof HTMLInputElement);
      
      if (!isFKey && !isDelete && !isEscape && !isArrow && !isPlus) return;

      // Don't intercept in modals (TEF handles its own keys) — but preserve fullscreen
      if (showTEF) {
        if (isEscape && isFullscreen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          // Browser exits fullscreen on ESC natively; re-enter after a longer delay
          setTimeout(() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen().catch(() => {});
            }
          }, 200);
        }
        return;
      }

      if (receipt) {
        if (e.key === "F1") {
          e.preventDefault();
          setReceipt(null);
          if (isFullscreen) {
            setTimeout(() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
              }
            }, 200);
          }
        }
        return;
      }
      if (showCashRegister) {
        if (isEscape && pdv.currentSession) {
          e.preventDefault();
          setShowCashRegister(false);
          if (isFullscreen) {
            setTimeout(() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
              }
            }, 200);
          }
        }
        return;
      }

      // When stock movement dialog is open, let it handle all keyboard events
      if (stockMovementProduct) return;

      // Skip arrow/enter when product list is open (it handles its own navigation)
      if (showProductList && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (pdv.cartItems.length > 0) {
            const currentIdx = selectedCartItemId ? pdv.cartItems.findIndex(i => i.id === selectedCartItemId) : -1;
            const nextIdx = currentIdx < pdv.cartItems.length - 1 ? currentIdx + 1 : 0;
            setSelectedCartItemId(pdv.cartItems[nextIdx].id);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (pdv.cartItems.length > 0) {
            const currentIdx = selectedCartItemId ? pdv.cartItems.findIndex(i => i.id === selectedCartItemId) : 0;
            const prevIdx = currentIdx > 0 ? currentIdx - 1 : pdv.cartItems.length - 1;
            setSelectedCartItemId(pdv.cartItems[prevIdx].id);
          }
          break;
        case "F1": e.preventDefault(); if (receipt) { setReceipt(null); } break;
        case "F2": e.preventDefault(); handleCheckout(); break;
        case "F3": e.preventDefault(); setShowProductList((p) => !p); break;
        case "F4": e.preventDefault(); openCashDrawer(); toast.info("Sangria/Gaveta aberta", { duration: 1200 }); break;
        case "F5": e.preventDefault(); setShowLoyaltyClientSelector(true); break;
        case "F6":
          e.preventDefault();
           if (pdv.cartItems.length > 0) { pdv.clearCart(); setSelectedClient(null); setSelectedCartItemId(null); toast.info("Venda cancelada", { duration: 1500 }); }
          break;
        case "F7":
          e.preventDefault();
          if (pdv.cartItems.length > 0) {
            const targetItem = selectedCartItemId ? pdv.cartItems.find(i => i.id === selectedCartItemId) : pdv.cartItems[pdv.cartItems.length - 1];
            if (targetItem) setEditingItemDiscountId(targetItem.id);
          }
          break;
        case "F8": e.preventDefault(); setEditingGlobalDiscount(true); break;
        case "F9":
          e.preventDefault();
          if (pdv.cartItems.length > 0) {
            const targetItem = selectedCartItemId ? pdv.cartItems.find(i => i.id === selectedCartItemId) : pdv.cartItems[pdv.cartItems.length - 1];
            if (targetItem) {
              setSelectedCartItemId(targetItem.id);
              setEditingQtyItemId(targetItem.id);
              setEditingQtyValue(String(targetItem.quantity));
            }
          } else {
            toast.info("Adicione um produto antes de alterar a quantidade", { duration: 1500 });
          }
          break;
        case "F10": e.preventDefault(); setShowPriceLookup(true); setPriceLookupQuery(""); break;
        case "F11": e.preventDefault(); handleHoldSale(); break;
        case "F12": e.preventDefault(); handleCheckout(); break;
        case "Delete":
          e.preventDefault();
          if (pdv.cartItems.length > 0) {
            const targetItem = selectedCartItemId ? pdv.cartItems.find(i => i.id === selectedCartItemId) : pdv.cartItems[pdv.cartItems.length - 1];
            if (targetItem) { pdv.removeItem(targetItem.id); setSelectedCartItemId(null); toast.info(`${targetItem.name} removido`, { duration: 1200 }); }
          }
          break;
        case "Escape": {
          const anyModalOpen = showShortcuts || showPriceLookup || showProductList || editingQtyItemId || editingItemDiscountId || editingGlobalDiscount || showSaveQuote || showLoyaltyClientSelector || showQuickProduct || showClientSelector || showReceiveCredit || !!zeroStockProduct || showHoldRecall || showReturnExchange || !!editingItemNoteId;
          if (anyModalOpen) {
            e.preventDefault();
            // Close the topmost modal
            if (showHoldRecall) setShowHoldRecall(false);
            else if (showReturnExchange) setShowReturnExchange(false);
            else if (editingItemNoteId) setEditingItemNoteId(null);
            else if (showShortcuts) setShowShortcuts(false);
            else if (showPriceLookup) setShowPriceLookup(false);
            else if (showProductList) setShowProductList(false);
            else if (editingQtyItemId) setEditingQtyItemId(null);
            else if (editingItemDiscountId) setEditingItemDiscountId(null);
            else if (editingGlobalDiscount) setEditingGlobalDiscount(false);
            else if (showSaveQuote) setShowSaveQuote(false);
            else if (showLoyaltyClientSelector) setShowLoyaltyClientSelector(false);
            else if (showQuickProduct) setShowQuickProduct(false);
            else if (showClientSelector) setShowClientSelector(false);
            else if (showReceiveCredit) setShowReceiveCredit(false);
            else if (zeroStockProduct) setZeroStockProduct(null);
            // Re-enter fullscreen if browser exited it due to ESC
            if (isFullscreen) {
              setTimeout(() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen().catch(() => {});
                }
              }, 200);
            }
          } else if (isFullscreen) {
            // ESC sem modal aberto: re-enter fullscreen (browser exits it natively)
            e.preventDefault();
            setTimeout(() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
              }
            }, 200);
          }
          break;
        }
        case "+":
          e.preventDefault();
          if (pdv.cartItems.length > 0) {
            const lastItem = pdv.cartItems[pdv.cartItems.length - 1];
            const product = pdv.products.find(p => p.id === lastItem.id);
            if (product) {
              pdv.addToCart(product);
              playAddSound();
            }
            }
          break;
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [showTEF, receipt, showCashRegister, showShortcuts, showPriceLookup, showProductList, handleCheckout, pdv, editingQtyItemId, editingItemDiscountId, editingGlobalDiscount, isFullscreen, selectedCartItemId, stockMovementProduct, showHoldRecall, showReturnExchange, editingItemNoteId, handleHoldSale]);

  const checkLowStockAfterSale = useCallback((soldItems: typeof pdv.cartItems) => {
    const lowStockItems: string[] = [];
    for (const item of soldItems) {
      const product = pdv.products.find((p) => p.id === item.id);
      if (!product) continue;
      const reorderPoint = product.reorder_point ?? 0;
      if (reorderPoint > 0) {
        const remainingStock = product.stock_quantity - item.quantity;
        if (remainingStock <= reorderPoint) {
          lowStockItems.push(`${product.name} (${remainingStock} ${product.unit})`);
        }
      }
    }
    if (lowStockItems.length > 0) {
      toast.warning(`⚠️ Estoque baixo:\n${lowStockItems.join(", ")}`, { duration: 6000 });
    }
  }, [pdv.products]);

  const handleTEFComplete = async (tefResults: TEFResult[]) => {
    const allApproved = tefResults.every((r) => r.approved);
    if (allApproved) {
      if (finalizingSale) return;
      try {
        const paymentResults: PaymentResult[] = tefResults.map((r) => ({
          method: r.method as PaymentResult["method"],
          approved: r.approved, amount: r.amount, nsu: r.nsu,
          auth_code: r.authCode, card_brand: r.cardBrand,
          card_last_digits: r.cardLastDigits, installments: r.installments,
          change_amount: r.changeAmount, pix_tx_id: r.pixTxId,
        }));
        const savedItems = [...pdv.cartItems];
        const savedTotal = pdv.total;
        const savedClient = selectedClient;
        const result = await pdv.finalizeSale(paymentResults, { skipFiscal: skipFiscalEmission });
        playSaleCompleteSound();
        setReceipt({
          items: savedItems, total: savedTotal,
          payments: tefResults, nfceNumber: result.nfceNumber,
          accessKey: result.accessKey, serie: result.serie,
          isContingency: result.isContingency,
          saleId: result.saleId,
          customerCpf: savedClient?.cpf || undefined,
          itemNotes: { ...itemNotes },
        });
        setSelectedClient(null);
        const newNum = saleNumber + 1;
        setSaleNumber(newNum);
        localStorage.setItem("pdv_sale_number", String(newNum));
        checkLowStockAfterSale(savedItems);
        if (pendingQuoteId) {
          updateQuoteStatus(pendingQuoteId, "convertido").catch(() => {});
          setPendingQuoteId(null);
        }
        if (loyaltyActive && savedClient?.id) {
          const pts = await earnPoints(savedClient.id, savedTotal, result.fiscalDocId);
          if (pts > 0) toast.info(`🎁 ${savedClient.name} ganhou ${pts} pontos de fidelidade!`, { duration: 2000 });
        }
      } catch (err: any) {
        playErrorSound();
        toast.error(`Erro ao finalizar venda: ${err.message}`);
      }
    }
    setShowTEF(false);
    setTefDefaultMethod(null);
  };

  const handlePrazoRequested = () => {
    setShowTEF(false);
    setTefDefaultMethod(null);
    setShowClientSelector(true);
  };

  const handleCreditSaleConfirmed = async (client: CreditClient, mode: "fiado" | "parcelado" | "sinal", installments: number, downPaymentAmount?: number) => {
    setShowClientSelector(false);
    if (finalizingSale) return;
    try {
      const isSignal = mode === "sinal" && downPaymentAmount && downPaymentAmount > 0;
      const remainingAmount = isSignal ? pdv.total - downPaymentAmount : pdv.total;

      const paymentResults: PaymentResult[] = [{
        method: "prazo", approved: true, amount: pdv.total,
        credit_client_id: client.id, credit_client_name: client.name,
        credit_mode: isSignal ? "sinal" : mode, credit_installments: installments,
      }];
      const savedItems = [...pdv.cartItems];
      const savedTotal = pdv.total;
      const result = await pdv.finalizeSale(paymentResults, { skipFiscal: skipFiscalEmission });
      playSaleCompleteSound();

      // ── Fix: Update sale status and financial entries ──
      if (result.saleId) {
        const currentBalance = Number(client.credit_balance || 0);
        // Only add the remaining (not signal) to credit balance
        const creditAmount = isSignal ? remainingAmount : savedTotal;
        const newBalance = currentBalance + creditAmount;

        // Get user id once
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const userId = authUser?.id || null;

        // ── Critical updates: run sequentially to avoid silent failures ──
        const throwErr = (label: string, error: any) => {
          if (error) {
            console.error(`[Fiado] ${label} failed:`, error);
            throw new Error(`${label}: ${error.message}`);
          }
        };

        // 1) Update sale status
        const { error: saleErr } = await supabase.from("sales")
          .update({ status: isSignal ? "sinal" : "fiado" } as any)
          .eq("id", result.saleId);
        throwErr("Atualizar status da venda", saleErr);

        // 2) Update client credit balance
        const { error: balErr } = await supabase.from("clients")
          .update({ credit_balance: newBalance })
          .eq("id", client.id);
        throwErr("Atualizar saldo do cliente", balErr);

        // 3) Handle financial entries based on mode
        if (isSignal || (mode === "parcelado" && installments > 1)) {
          // Delete the auto-generated 'pago' entry first
          const { error: delErr } = await supabase.from("financial_entries")
            .delete()
            .eq("reference", result.saleId)
            .eq("company_id", companyId);
          throwErr("Remover lançamento automático", delErr);

          const entriesToInsert: any[] = [];

          if (isSignal) {
            // Signal (already paid)
            entriesToInsert.push({
              company_id: companyId,
              type: "receber",
              description: `Sinal (entrada) - ${client.name}`,
              reference: result.saleId,
              counterpart: client.name,
              amount: downPaymentAmount,
              due_date: new Date().toISOString().split("T")[0],
              status: "pago",
              paid_amount: downPaymentAmount,
              paid_date: new Date().toISOString().split("T")[0],
              created_by: userId,
            });
          }

          const baseAmount = isSignal ? remainingAmount : savedTotal;
          const numInstallments = isSignal ? (installments > 1 ? installments : 1) : installments;
          const installmentAmount = Math.round((baseAmount / numInstallments) * 100) / 100;

          for (let i = 0; i < numInstallments; i++) {
            const dueDate = new Date();
            dueDate.setMonth(dueDate.getMonth() + i + 1);
            const isLast = i === numInstallments - 1;
            entriesToInsert.push({
              company_id: companyId,
              type: "receber",
              description: numInstallments > 1
                ? `Parcela ${i + 1}/${numInstallments}${isSignal ? " (saldo)" : ""} - ${client.name}`
                : `Saldo (na entrega) - ${client.name}`,
              reference: result.saleId,
              counterpart: client.name,
              amount: isLast ? baseAmount - installmentAmount * (numInstallments - 1) : installmentAmount,
              due_date: dueDate.toISOString().split("T")[0],
              status: "pendente",
              created_by: userId,
            });
          }

          const { error: insErr } = await supabase.from("financial_entries").insert(entriesToInsert);
          throwErr("Criar parcelas financeiras", insErr);
        } else {
          // Fiado simples: update existing entry to pendente
          const { error: updErr } = await supabase.from("financial_entries")
            .update({
              status: "pendente",
              paid_amount: 0,
              paid_date: null,
              counterpart: client.name,
            } as any)
            .eq("reference", result.saleId)
            .eq("company_id", companyId);
          throwErr("Atualizar lançamento para pendente", updErr);
        }
      }

      setReceipt({
        items: savedItems, total: savedTotal,
        payments: [{ method: "prazo" as any, approved: true, amount: savedTotal }],
        nfceNumber: result.nfceNumber,
        accessKey: result.accessKey, serie: result.serie,
        isContingency: result.isContingency,
        saleId: result.saleId,
      });
      setFiadoReceipt({
        clientName: client.name,
        clientDoc: client.cpf,
        total: savedTotal,
        items: savedItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, note: itemNotes[i.id] || undefined })),
        mode: isSignal ? "sinal" : mode,
        installments,
        saleNumber,
        storeName: companyName || undefined,
        storeSlogan: slogan || undefined,
        storeCnpj: cnpj || undefined,
        storePhone: phone || undefined,
        storeAddress: [addressStreet, addressNumber, addressNeighborhood, addressCity, addressState].filter(Boolean).join(", ") || undefined,
        downPayment: isSignal ? downPaymentAmount : undefined,
      });
      const modeLabel = isSignal ? `com sinal de ${formatCurrency(downPaymentAmount)}` : mode === "fiado" ? "fiado" : `parcelado ${installments}x`;
      toast.success(`Venda ${modeLabel} registrada para ${client.name}`, { duration: 1500 });
      setSelectedClient(null);
      const newNum = saleNumber + 1;
      setSaleNumber(newNum);
      localStorage.setItem("pdv_sale_number", String(newNum));
      checkLowStockAfterSale(savedItems);
      if (pendingQuoteId) {
        updateQuoteStatus(pendingQuoteId, "convertido").catch(() => {});
        setPendingQuoteId(null);
      }
      if (loyaltyActive && client.id) {
        const pts = await earnPoints(client.id, savedTotal, result.fiscalDocId);
        if (pts > 0) toast.info(`🎁 ${client.name} ganhou ${pts} pontos de fidelidade!`, { duration: 2000 });
      }
    } catch (err: any) {
      playErrorSound();
      toast.error(`Erro ao finalizar venda: ${err.message}`);
    }
  };

  const totalItems = pdv.cartItems.length;
  const totalQty = pdv.cartItems.reduce((a, i) => a + i.quantity, 0);
  const totalFinal = pdv.total;

  // Block PDV entirely if no cash session is open (only when required)
  if (requireCashSession && !pdv.loadingSession && !pdv.currentSession) {
    return (
      <div className="flex flex-col h-screen bg-background text-foreground relative">
        <button
          onClick={() => navigate("/")}
          className="absolute top-4 left-4 z-[60] px-4 py-2 rounded-lg bg-destructive text-destructive-foreground font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg"
        >
          ← Sair do PDV
        </button>
        <CashRegister
          terminalId={terminalId}
          preventClose
          initialSession={null}
          skipInitialLoad
          onClose={() => {
            pdv.reloadSession(terminalId);
          }}
        />
      </div>
    );
  }

  if (pdv.loadingSession) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <p className="text-muted-foreground animate-pulse">Carregando sessão de caixa...</p>
      </div>
    );
  }

  return (
    <div className={`pdv-theme flex flex-col h-screen bg-background text-foreground overflow-hidden select-none ${pdv.trainingMode ? "ring-4 ring-warning/60 ring-inset" : ""}`}>

      {/* ════════ TOP BAR ════════ */}
      <div className="flex items-center justify-between px-2 lg:px-3 h-9 bg-primary text-primary-foreground flex-shrink-0 text-xs gap-1 lg:gap-2 overflow-hidden">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={() => { if (pdv.currentSession) { setShowExitConfirm(true); } else { navigate("/"); } }}
            className="font-bold opacity-80 hover:opacity-100 transition-opacity"
          >
            ← Sair
          </button>
          <span className="opacity-60">|</span>
          <span className="font-bold hidden sm:inline">{companyName || "PDV"}</span>
          <span className="opacity-60 hidden sm:inline">|</span>
          <button
            onClick={() => { setTempTerminalId(terminalId); setShowTerminalPicker(true); }}
            className="font-mono font-bold hover:underline"
          >
            Caixa: T{terminalId}
          </button>
          <span className="opacity-60">|</span>
          <span className="font-mono">Venda #{String(saleNumber).padStart(6, "0")}</span>
          <span className="opacity-60">|</span>
          <span className="font-mono">{new Date().toLocaleDateString("pt-BR")}</span>
          {pdv.currentSession && (
            <>
              <span className="opacity-60">|</span>
              <SessionTimer openedAt={pdv.currentSession.opened_at} />
            </>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {pdv.trainingMode && (
            <span className="font-bold text-warning animate-pulse">🎓 TREINAMENTO</span>
          )}
          {selectedClient && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span className="font-bold truncate max-w-[120px]">{selectedClient.name}</span>
              <button onClick={() => setSelectedClient(null)} className="ml-0.5 hover:text-destructive">✕</button>
            </span>
          )}
          <button
            onClick={() => setShowCashRegister(true)}
            className="opacity-80 hover:opacity-100 transition-opacity flex items-center gap-1"
            title="Controle de Caixa"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-bold">Caixa</span>
          </button>
          <button
            onClick={toggleFullscreen}
            className="opacity-80 hover:opacity-100 transition-opacity hidden sm:block"
            title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </button>
          {pdv.contingencyMode && (
            <span className="flex items-center gap-1 font-bold text-warning animate-pulse">
              <AlertTriangle className="w-3 h-3" /> CONTINGÊNCIA
            </span>
          )}
          {pdv.syncStats.pending > 0 && (
            <span className="text-xs font-mono opacity-80">
              📤 {pdv.syncStats.pending} pendente{pdv.syncStats.pending > 1 ? "s" : ""}
            </span>
          )}
          <span className="flex items-center gap-1">
            {pdv.isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span className="font-bold hidden sm:inline">{pdv.isOnline ? "Online" : "Offline"}</span>
          </span>
          <LiveClock />
        </div>
      </div>

      {/* ════════ BARCODE INPUT - ELITE ════════ */}
      <div data-tour="pdv-search" className={`flex items-center gap-3 lg:gap-4 px-3 lg:px-5 py-3.5 lg:py-5 bg-gradient-to-r from-primary/15 via-card to-primary/15 border-b-[3px] border-primary flex-shrink-0 shadow-[0_4px_20px_-6px_hsl(var(--primary)/0.35)] ${
        (editingQtyItemId || editingItemDiscountId || editingGlobalDiscount) ? "hidden lg:flex" : "flex"
      }`}>
        <div className="flex items-center gap-2 bg-primary/20 rounded-xl px-3.5 py-2.5 shadow-sm">
          <Search className="w-5 h-5 lg:w-6 lg:h-6 text-primary" />
          <span className="text-xs lg:text-sm font-black text-primary tracking-widest whitespace-nowrap uppercase">Código</span>
        </div>
        <div className="relative flex-1">
          <input
            ref={barcodeInputRef}
            type="text"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                if (!barcodeInput.trim()) {
                  setShowProductList((p) => !p);
                } else {
                  handleBarcodeSubmit();
                }
              }
            }}
            placeholder="Leia ou digite o código de barras... (ex: 5*789123 para multiplicar)"
            className="w-full px-4 lg:px-6 py-3 lg:py-4 rounded-xl bg-background border-[3px] border-primary/50 text-foreground text-lg lg:text-2xl xl:text-3xl font-mono font-black tracking-widest focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/25 focus:shadow-[0_0_30px_-4px_hsl(var(--primary)/0.4)] placeholder:text-muted-foreground/35 placeholder:text-xs lg:placeholder:text-sm placeholder:font-normal placeholder:tracking-normal transition-all duration-300"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {barcodeInput && (
            <button
              onClick={() => setBarcodeInput("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-muted hover:bg-destructive/20 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* ════════ MAIN CONTENT: 70% items | 30% totals ════════ */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">

        {/* LEFT: Items Table (70%) */}
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
                {pdv.cartItems.length === 0 ? (
                  <>
                    <tr className="sm:hidden">
                      <td colSpan={4} className="text-center py-0">
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                          {logoUrl ? (
                            <img src={logoUrl} alt={companyName || "Logo"} className="h-24 object-contain" />
                          ) : (
                            <img src={anthoLogo} alt="AnthoSystem" className="h-20 object-contain opacity-70" />
                          )}
                          <span className="text-xs text-muted-foreground/50">Aguardando leitura...</span>
                        </div>
                      </td>
                    </tr>
                    <tr className="hidden sm:table-row">
                      <td colSpan={6} className="text-center py-0">
                        <div className="flex flex-col items-center justify-center py-12 gap-5">
                          {logoUrl ? (
                            <img src={logoUrl} alt={companyName || "Logo"} className="h-44 object-contain" />
                          ) : (
                            <img src={anthoLogo} alt="AnthoSystem" className="h-36 object-contain opacity-70" />
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
                  pdv.cartItems.map((item, idx) => {
                    const isLast = idx === pdv.cartItems.length - 1;
                    const itemDiscount = pdv.itemDiscounts[item.id] || 0;
                    const unitPrice = item.price * (1 - itemDiscount / 100);
                    const subtotalItem = unitPrice * item.quantity;
                    const isWeighed = !Number.isInteger(item.quantity);

                    return (
                      <tr
                        key={item.id}
                        ref={isLast ? tableEndRef : undefined}
                        onClick={(e) => { e.stopPropagation(); setSelectedCartItemId(item.id); }}
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
                            {(() => {
                              const prod = pdv.products.find(p => p.id === item.id);
                              const reorder = prod?.reorder_point || 0;
                              const remaining = (prod?.stock_quantity || 0) - item.quantity;
                              if (reorder > 0 && remaining <= reorder && remaining > 0) {
                                return (
                                  <span className="ml-1 flex items-center gap-0.5 text-[9px] text-warning font-bold" title={`Estoque: ${remaining} ${prod?.unit || 'un'}`}>
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                  </span>
                                );
                              }
                              return null;
                            })()}
                            {itemNotes[item.id] && (
                              <span className="ml-1 text-[9px] text-accent-foreground bg-accent/50 rounded px-1 truncate max-w-[80px]" title={itemNotes[item.id]}>
                                📝 {itemNotes[item.id]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-1 py-1.5 text-center font-mono font-bold text-foreground text-[10px]">
                          {isWeighed ? item.quantity.toFixed(3) : item.quantity}
                        </td>
                        <td className="px-1 py-1.5 text-right font-mono text-muted-foreground text-[10px] hidden sm:table-cell">
                          {itemDiscount > 0 && (
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

        {/* RIGHT: Totals Sidebar (30%) — ELITE */}
        <div className="shrink-0 lg:shrink lg:flex-[3] flex flex-col bg-muted/40 lg:min-w-[260px] lg:max-w-[380px] min-h-0 lg:border-l-2 lg:border-primary/20">
          {/* Info rows — compact on mobile */}
          <div className="flex-1 flex flex-col p-1 lg:p-4 gap-0 lg:gap-1 overflow-y-auto">
            {/* Mobile: single compact row */}
            <div className="flex lg:hidden items-center justify-between px-2 py-1.5 border-b border-border/60 text-[10px]">
              <span className="font-bold text-muted-foreground">{totalItems} itens · Qtd: {Number.isInteger(totalQty) ? totalQty : totalQty.toFixed(3)}</span>
              <span className="font-bold text-foreground font-mono">Sub: {formatCurrency(pdv.subtotal)}</span>
            </div>
            {/* Desktop: full rows */}
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
              <span className="text-xl font-black text-foreground font-mono tabular-nums">{formatCurrency(pdv.subtotal)}</span>
            </div>

            {/* Selected/Active product photo — persistent */}
            {(() => {
              const activeItem = selectedCartItemId 
                ? pdv.cartItems.find(i => i.id === selectedCartItemId) 
                : pdv.cartItems[pdv.cartItems.length - 1];
              if (!activeItem) return null;
              return (
                <div className="hidden lg:flex flex-col items-center gap-2 py-3 border-b border-primary/30 bg-primary/5 rounded-lg px-2">
                  {(activeItem as any).image_url ? (
                    <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg">
                      <img src={(activeItem as any).image_url} alt={activeItem.name} className="w-full h-full object-cover" />
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
              );
            })()}

            {/* Desconto item (F7) — mobile: fixed overlay, desktop: inline */}
            {editingItemDiscountId && (
              <div className="hidden lg:block lg:relative lg:z-auto lg:bg-transparent">
                <div className="bg-card rounded-2xl p-6 shadow-2xl w-[85vw] max-w-xs flex flex-col items-center gap-4 lg:flex-row lg:justify-between lg:items-center lg:py-2 lg:px-2 lg:-mx-2 lg:rounded lg:p-0 lg:shadow-none lg:w-auto lg:max-w-none lg:bg-muted/50 border border-border lg:border-b lg:border-t-0 lg:border-x-0">
                  <span className="text-sm font-bold text-muted-foreground uppercase lg:text-xs">Desc. Item %</span>
                  <div className="flex items-center gap-2">
                    <input
                      data-no-barcode-capture="true"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={maxDiscountPercent}
                      step={0.5}
                      autoFocus
                      defaultValue={pdv.itemDiscounts[editingItemDiscountId] || 0}
                      onClick={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                          const val = Math.min(Math.max(0, Number((e.target as HTMLInputElement).value)), maxDiscountPercent);
                          pdv.setItemDiscount(editingItemDiscountId!, val);
                          setEditingItemDiscountId(null);
                        }
                        if (e.key === "Escape") setEditingItemDiscountId(null);
                      }}
                      className="w-24 px-3 py-3 rounded-xl bg-background border-2 border-primary text-xl font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary lg:w-20 lg:px-2 lg:py-2 lg:text-base lg:text-right lg:rounded lg:border"
                    />
                    <span className="text-sm text-muted-foreground font-bold">%</span>
                  </div>
                  <div className="flex gap-2 w-full lg:hidden">
                    <button
                      onClick={() => setEditingItemDiscountId(null)}
                      className="flex-1 py-3 rounded-xl bg-muted text-foreground font-bold text-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        const input = document.querySelector<HTMLInputElement>('[data-no-barcode-capture="true"]');
                        const val = Math.min(Math.max(0, Number(input?.value || 0)), maxDiscountPercent);
                        pdv.setItemDiscount(editingItemDiscountId!, val);
                        setEditingItemDiscountId(null);
                      }}
                      className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Desconto global (F8) */}
            <div className="flex justify-between items-center py-1 lg:py-2 border-b border-border">
              <span className="text-xs font-bold text-muted-foreground uppercase">Desconto</span>
              {editingGlobalDiscount ? (
                <div className="hidden lg:block lg:relative lg:z-auto lg:bg-transparent">
                  <div className="bg-card rounded-2xl p-6 shadow-2xl w-[85vw] max-w-xs flex flex-col items-center gap-4 lg:flex-row lg:gap-1 lg:p-0 lg:shadow-none lg:w-auto lg:max-w-none lg:bg-transparent lg:rounded-none">
                    <span className="text-sm font-bold text-muted-foreground uppercase lg:hidden">Desc. Total %</span>
                    <div className="flex items-center gap-2 lg:gap-1">
                      <input
                        data-no-barcode-capture="true"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={maxDiscountPercent}
                        step={0.5}
                        autoFocus
                        defaultValue={pdv.globalDiscountPercent}
                        onClick={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            const val = Math.min(Math.max(0, Number((e.target as HTMLInputElement).value)), maxDiscountPercent);
                            pdv.setGlobalDiscountPercent(val);
                            setEditingGlobalDiscount(false);
                          }
                          if (e.key === "Escape") setEditingGlobalDiscount(false);
                        }}
                        className="w-24 px-3 py-3 rounded-xl bg-background border-2 border-primary text-xl font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary lg:w-20 lg:px-2 lg:py-2 lg:text-base lg:text-right lg:rounded lg:border"
                      />
                      <span className="text-sm text-muted-foreground font-bold lg:text-xs">%</span>
                    </div>
                    <div className="flex gap-2 w-full lg:hidden">
                      <button
                        onClick={() => setEditingGlobalDiscount(false)}
                        className="flex-1 py-3 rounded-xl bg-muted text-foreground font-bold text-sm"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => {
                          const input = document.querySelector<HTMLInputElement>('[data-no-barcode-capture="true"]');
                          const val = Math.min(Math.max(0, Number(input?.value || 0)), maxDiscountPercent);
                          pdv.setGlobalDiscountPercent(val);
                          setEditingGlobalDiscount(false);
                        }}
                        className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => maxDiscountPercent > 0 && setEditingGlobalDiscount(true)}
                  className={`text-sm lg:text-lg font-bold font-mono ${pdv.globalDiscountPercent > 0 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {pdv.globalDiscountPercent > 0 ? `-${formatCurrency(pdv.globalDiscountValue)}` : "R$ 0,00"}
                </button>
              )}
            </div>

            {/* Economia promoções */}
            {pdv.promoSavings > 0 && (
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs font-bold text-primary uppercase">Economia</span>
                <span className="text-lg font-bold text-primary font-mono">-{formatCurrency(pdv.promoSavings)}</span>
              </div>
            )}

            {/* Alterar Quantidade (F9) */}
            {editingQtyItemId && (
              <>
              {/* Mobile: bottom-sheet overlay */}
              <div className="lg:hidden fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={() => setEditingQtyItemId(null)}>
                <div onClick={e => e.stopPropagation()} className="bg-card rounded-t-2xl p-6 shadow-2xl w-full max-w-md flex flex-col items-center gap-4">
                  <span className="text-sm font-bold text-muted-foreground uppercase">Nova Quantidade</span>
                  <div className="flex items-center gap-2">
                    <input
                      data-no-barcode-capture="true"
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={editingQtyValue}
                      onChange={(e) => setEditingQtyValue(e.target.value.replace(/[^0-9.,]/g, ""))}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                          const newQty = Math.max(1, parseInt(editingQtyValue) || 1);
                          const item = pdv.cartItems.find(i => i.id === editingQtyItemId);
                          if (item) { pdv.updateQuantity(editingQtyItemId!, newQty - item.quantity); }
                          setEditingQtyItemId(null);
                        }
                        if (e.key === "Escape") setEditingQtyItemId(null);
                      }}
                      className="w-32 px-4 py-4 rounded-xl bg-background border-2 border-primary text-3xl font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="flex gap-2 w-full">
                    <button onClick={() => setEditingQtyItemId(null)} className="flex-1 py-3 rounded-xl bg-muted text-foreground font-bold text-sm">Cancelar</button>
                    <button onClick={() => {
                      const newQty = Math.max(1, parseInt(editingQtyValue) || 1);
                      const item = pdv.cartItems.find(i => i.id === editingQtyItemId);
                      if (item) { pdv.updateQuantity(editingQtyItemId!, newQty - item.quantity); }
                      setEditingQtyItemId(null);
                    }} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm">Aplicar</button>
                  </div>
                </div>
              </div>
              {/* Desktop: inline */}
              <div className="hidden lg:block lg:relative lg:z-auto lg:bg-transparent">
                <div className="bg-muted/50 border-b border-border flex flex-row justify-between items-center py-2 px-2 -mx-2 rounded">
                  <span className="text-sm font-bold text-muted-foreground uppercase lg:text-xs">Nova Quantidade</span>
                  <div className="flex items-center gap-2">
                    <input
                      data-no-barcode-capture="true"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      autoFocus
                      value={editingQtyValue}
                      onChange={(e) => setEditingQtyValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                          const newQty = Math.max(1, parseInt(editingQtyValue) || 1);
                          const item = pdv.cartItems.find(i => i.id === editingQtyItemId);
                          if (item) {
                            const delta = newQty - item.quantity;
                            pdv.updateQuantity(editingQtyItemId!, delta);
                          }
                          setEditingQtyItemId(null);
                        }
                        if (e.key === "Escape") setEditingQtyItemId(null);
                      }}
                      className="w-24 px-3 py-3 rounded-xl bg-background border-2 border-primary text-xl font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary lg:w-20 lg:px-2 lg:py-2 lg:text-base lg:text-right lg:rounded lg:border"
                    />
                  </div>
                  <div className="flex gap-2 w-full lg:hidden">
                    <button
                      onClick={() => setEditingQtyItemId(null)}
                      className="flex-1 py-3 rounded-xl bg-muted text-foreground font-bold text-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        const newQty = Math.max(1, parseInt(editingQtyValue) || 1);
                        const item = pdv.cartItems.find(i => i.id === editingQtyItemId);
                        if (item) {
                          const delta = newQty - item.quantity;
                          pdv.updateQuantity(editingQtyItemId!, delta);
                        }
                        setEditingQtyItemId(null);
                      }}
                      className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              </div>
              </>
            )}
          </div>

          {/* TOTAL — ELITE DISPLAY */}
          <div
            data-tour="pdv-total"
            className="p-2 lg:p-5 xl:p-6 mt-auto border-t-4 transition-all duration-500 flex-shrink-0 overflow-hidden relative"
            style={{
              backgroundColor: totalFinal > 0 ? "hsl(0, 72%, 38%)" : "hsl(142, 76%, 30%)",
              borderTopColor: totalFinal > 0 ? "hsl(0, 80%, 55%)" : "hsl(142, 80%, 48%)",
              boxShadow: `inset 0 4px 20px rgba(0,0,0,0.3), 0 -2px 15px ${totalFinal > 0 ? "hsla(0, 72%, 40%, 0.3)" : "hsla(142, 72%, 32%, 0.3)"}`,
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent pointer-events-none" />
            <div className="text-center relative">
              <span className="text-[9px] lg:text-sm font-black uppercase tracking-[0.4em] block mb-0.5 lg:mb-2" style={{ color: "rgba(255,255,255,0.85)" }}>
                {totalFinal > 0 ? "TOTAL A PAGAR" : "TOTAL DA VENDA"}
              </span>
              <motion.span
                key={totalFinal}
                initial={{ scale: 1.08, opacity: 0.7 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="text-3xl lg:text-5xl xl:text-6xl 2xl:text-7xl font-black font-mono tracking-tight block leading-none truncate"
                style={{ color: "hsl(var(--foreground))", textShadow: "0 4px 24px rgba(0,0,0,0.6), 0 0 40px rgba(255,255,255,0.1)" }}
              >
                {formatCurrency(totalFinal)}
              </motion.span>
            </div>
          </div>
        </div>
      </div>

      {/* ════════ MOBILE ACTION BAR (visible only on mobile) ════════ */}
      <div className="flex lg:hidden items-center gap-1.5 px-2 py-1.5 border-t border-border bg-muted/50 flex-wrap flex-shrink-0">
        <button
          onClick={() => {
            if (pdv.cartItems.length > 0) {
              const targetItem = selectedCartItemId
                ? pdv.cartItems.find(i => i.id === selectedCartItemId)
                : pdv.cartItems[pdv.cartItems.length - 1];
              if (targetItem) {
                setEditingQtyItemId(targetItem.id);
                setEditingQtyValue(String(targetItem.quantity));
              }
            }
          }}
          disabled={pdv.cartItems.length === 0}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-sidebar-background text-sidebar-foreground border border-sidebar-border text-xs font-bold whitespace-nowrap disabled:opacity-30 active:scale-95 transition-transform"
        >
          <Hash className="w-3 h-3" /> Qtd
        </button>
        <button
          onClick={() => {
            if (pdv.cartItems.length > 0) {
              const targetItem = selectedCartItemId
                ? pdv.cartItems.find(i => i.id === selectedCartItemId)
                : pdv.cartItems[pdv.cartItems.length - 1];
              if (targetItem) setEditingItemDiscountId(targetItem.id);
            }
          }}
          disabled={pdv.cartItems.length === 0}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-sidebar-background text-sidebar-foreground border border-sidebar-border text-xs font-bold whitespace-nowrap disabled:opacity-30 active:scale-95 transition-transform"
        >
          <Percent className="w-3 h-3" /> Desc.Item
        </button>
        <button
          onClick={() => maxDiscountPercent > 0 && setEditingGlobalDiscount(true)}
          disabled={pdv.cartItems.length === 0}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-sidebar-background text-sidebar-foreground border border-sidebar-border text-xs font-bold whitespace-nowrap disabled:opacity-30 active:scale-95 transition-transform"
        >
          <Percent className="w-3 h-3" /> Desc.Total
        </button>
        <button
          onClick={() => {
            if (pdv.cartItems.length > 0) {
              const targetItem = selectedCartItemId
                ? pdv.cartItems.find(i => i.id === selectedCartItemId)
                : pdv.cartItems[pdv.cartItems.length - 1];
              if (targetItem) {
                pdv.removeItem(targetItem.id);
                setSelectedCartItemId(null);
                toast.info(`${targetItem.name} removido`, { duration: 1200 });
              }
            }
          }}
          disabled={pdv.cartItems.length === 0}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-destructive/80 text-white border border-destructive/50 text-xs font-bold whitespace-nowrap disabled:opacity-30 active:scale-95 transition-transform"
        >
          <Trash2 className="w-3 h-3" /> Remover
        </button>
        <button
          onClick={() => {
            if (pdv.cartItems.length > 0) {
              pdv.clearCart();
              setSelectedClient(null);
              setSelectedCartItemId(null);
              toast.info("Venda cancelada", { duration: 1500 });
            }
          }}
          disabled={pdv.cartItems.length === 0}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-destructive/80 text-white border border-destructive/50 text-xs font-bold whitespace-nowrap disabled:opacity-30 active:scale-95 transition-transform"
        >
          <X className="w-3 h-3" /> Cancelar
        </button>
        <button
          onClick={() => { if (pdv.cartItems.length > 0) setShowSaveQuote(true); else toast.warning("Carrinho vazio", { duration: 1200 }); }}
          disabled={pdv.cartItems.length === 0}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-primary/80 text-primary-foreground border border-primary/50 text-xs font-bold whitespace-nowrap disabled:opacity-30 active:scale-95 transition-transform"
        >
          <FileText className="w-3 h-3" /> Orçamento
        </button>
        <button
          onClick={() => handleHoldSale()}
          disabled={pdv.cartItems.length === 0}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-warning/70 text-warning-foreground border border-warning/50 text-xs font-bold whitespace-nowrap disabled:opacity-30 active:scale-95 transition-transform"
        >
          <Pause className="w-3 h-3" /> Suspender
        </button>
        <button
          onClick={() => setShowHoldRecall(true)}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-sidebar-background text-sidebar-foreground border border-sidebar-border text-xs font-bold whitespace-nowrap active:scale-95 transition-transform"
        >
          <Play className="w-3 h-3" /> Retomar
        </button>
      </div>

      {/* ════════ BOTTOM PAYMENT BAR — ELITE ════════ */}
      <div className="flex flex-col flex-shrink-0 border-t-2 border-primary/30 bg-card shadow-[0_-4px_16px_-6px_rgba(0,0,0,0.15)]">
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
              onClick={() => handleDirectPayment(id)}
              disabled={pdv.cartItems.length === 0}
              className={`flex-1 min-w-[44px] basis-[calc(25%-4px)] lg:basis-auto flex flex-col items-center justify-center gap-0.5 py-2 lg:py-2.5 xl:py-3 rounded-lg lg:rounded-xl text-sm font-extrabold tracking-wide transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 ${colorClass}`}
            >
              <Icon className="w-4 h-4 lg:w-5 lg:h-5 xl:w-6 xl:h-6" />
              <span className="text-[10px] lg:text-[11px] xl:text-xs font-bold">{label}</span>
            </motion.button>
          ))}
        </div>
        {/* Fiscal emission toggle */}
        {canUseFiscal && (
          <div className="flex items-center justify-end px-2 py-0.5 bg-muted/40 border-t border-border">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={!skipFiscalEmission}
                onChange={(e) => setSkipFiscalEmission(!e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border accent-primary"
              />
              <FileText className="w-3 h-3" />
              <span>Emitir NFC-e</span>
            </label>
          </div>
        )}
        <div data-tour="pdv-shortcuts" className="hidden lg:flex items-center justify-center gap-1 xl:gap-1.5 px-2 py-1.5 xl:py-2 bg-muted/80 border-t-2 border-border/60 flex-wrap">
          {/* Grupo: Operações */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-background/50 border border-border/40">
            {[
              { key: "F3", label: "Buscar", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => setShowProductList((p) => !p) },
              { key: "F5", label: "Cliente", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => setShowLoyaltyClientSelector(true) },
              { key: "F10", label: "Consulta", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => { setShowPriceLookup(true); setPriceLookupQuery(""); } },
              { key: "+", label: "Repetir", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => { if (pdv.cartItems.length > 0) { const lastItem = pdv.cartItems[pdv.cartItems.length - 1]; const product = pdv.products.find(p => p.id === lastItem.id); if (product) pdv.addToCart(product); } } },
              { key: "F11", label: "Suspender", color: "bg-warning/70 hover:bg-warning/80 text-warning-foreground border border-warning/50", action: () => handleHoldSale() },
            ].map(({ key, label, color, action }) => (
              <button key={key} onClick={action} className={`flex items-center gap-1 font-bold text-xs cursor-pointer rounded-lg px-1.5 py-1 transition-all hover:scale-[1.03] active:scale-95 ${color}`}>
                <span className="font-mono font-black px-1.5 py-0.5 rounded bg-black/25 text-[10px] border border-white/20 shadow-sm">{key}</span>
                {label}
              </button>
            ))}
          </div>
          {/* Grupo: Descontos & Edição */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-background/50 border border-border/40">
            {[
              { key: "F7", label: "Desc.Item", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => { if (selectedCartItemId) { setEditingItemDiscountId(selectedCartItemId); } else if (pdv.cartItems.length > 0) { const firstId = pdv.cartItems[0].id; setSelectedCartItemId(firstId); setEditingItemDiscountId(firstId); } } },
              { key: "F8", label: "Desc.Total", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => setEditingGlobalDiscount(true) },
              { key: "F9", label: "Qtd", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => { if (selectedCartItemId) { setEditingQtyItemId(selectedCartItemId); setEditingQtyValue(String(pdv.cartItems.find(i => i.id === selectedCartItemId)?.quantity || 1)); } else if (pdv.cartItems.length > 0) { const firstId = pdv.cartItems[0].id; setSelectedCartItemId(firstId); setEditingQtyItemId(firstId); setEditingQtyValue(String(pdv.cartItems.find(i => i.id === firstId)?.quantity || 1)); } else { toast.info("Adicione um produto antes de alterar a quantidade", { duration: 1500 }); } } },
              { key: "DEL", label: "Remover", color: "bg-destructive/80 hover:bg-destructive text-white border border-destructive/50", action: () => { if (selectedCartItemId) { pdv.removeItem(selectedCartItemId); setSelectedCartItemId(null); } } },
            ].map(({ key, label, color, action }) => (
              <button key={key} onClick={action} className={`flex items-center gap-1 font-bold text-xs cursor-pointer rounded-lg px-1.5 py-1 transition-all hover:scale-[1.03] active:scale-95 ${color}`}>
                <span className="font-mono font-black px-1.5 py-0.5 rounded bg-black/25 text-[10px] border border-white/20 shadow-sm">{key}</span>
                {label}
              </button>
            ))}
          </div>
          {/* Grupo: Extras */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-background/50 border border-border/40">
            <button onClick={() => setShowHoldRecall(true)} className="flex items-center gap-1 font-bold text-xs cursor-pointer rounded-lg px-1.5 py-1 transition-all hover:scale-[1.03] active:scale-95 bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border">
              <Play className="w-3 h-3" /> Retomar
            </button>
            <button onClick={() => setShowReturnExchange(true)} className="flex items-center gap-1 font-bold text-xs cursor-pointer rounded-lg px-1.5 py-1 transition-all hover:scale-[1.03] active:scale-95 bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border">
              <RotateCcw className="w-3 h-3" /> Devolução
            </button>
            <button onClick={() => {
              const targetItem = selectedCartItemId ? pdv.cartItems.find(i => i.id === selectedCartItemId) : pdv.cartItems[pdv.cartItems.length - 1];
              if (targetItem) setEditingItemNoteId(targetItem.id);
            }} className="flex items-center gap-1 font-bold text-xs cursor-pointer rounded-lg px-1.5 py-1 transition-all hover:scale-[1.03] active:scale-95 bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border">
              <MessageSquare className="w-3 h-3" /> Obs.
            </button>
            <button onClick={() => setShowReceiveCredit(true)} className="flex items-center gap-1 font-bold text-xs cursor-pointer rounded-lg px-1.5 py-1 transition-all hover:scale-[1.03] active:scale-95 bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border">
              <Wallet className="w-3 h-3" /> Receber Fiado
            </button>
            <button onClick={() => customerDisplay.openDisplay()} className="flex items-center gap-1 font-bold text-xs cursor-pointer rounded-lg px-1.5 py-1 transition-all hover:scale-[1.03] active:scale-95 bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border">
              <Tv className="w-3 h-3" /> 2º Monitor
            </button>
          </div>
          {/* Grupo: Finalização */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-primary/10 border border-primary/30">
            {[
              { key: "Orç.", label: "Orçamento", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => { if (pdv.cartItems.length > 0) setShowSaveQuote(true); else toast.warning("Carrinho vazio", { duration: 1200 }); } },
              { key: "F6", label: "Cancelar", color: "bg-destructive/80 hover:bg-destructive text-white border border-destructive/50", action: () => { if (pdv.cartItems.length > 0) { pdv.clearCart(); setSelectedClient(null); setSelectedCartItemId(null); setItemNotes({}); setItemDiscountValues({}); toast.info("Venda cancelada"); } } },
              { key: "F12", label: "FINALIZAR", color: "bg-primary hover:bg-primary/90 text-primary-foreground border border-primary/50 shadow-md shadow-primary/20", action: () => handleCheckout() },
            ].map(({ key, label, color, action }) => (
              <button key={key} onClick={action} className={`flex items-center gap-1 font-black text-xs cursor-pointer rounded-lg px-2 py-1.5 transition-all hover:scale-[1.05] active:scale-95 ${color}`}>
                <span className="font-mono font-black px-1.5 py-0.5 rounded bg-black/25 text-[10px] border border-white/20 shadow-sm">{key}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ════════ OVERLAYS ════════ */}

      {/* Product List Overlay */}
      {showProductList && (
        <div className="absolute inset-0 z-30 bg-background flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted flex-shrink-0">
            <span className="text-xs font-bold text-muted-foreground uppercase">Buscar Produtos (F3)</span>
            <button
              onClick={() => setShowProductList(false)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-card border border-border text-muted-foreground hover:text-foreground text-xs font-medium"
            >
              <X className="w-3 h-3" /> Fechar (Esc)
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <PDVProductGrid
              products={pdv.products}
              loading={pdv.loadingProducts}
              companyName={companyName}
              logoUrl={logoUrl}
              onAddToCart={(product) => {
                handleAddToCart(product);
                setShowProductList(false);
              }}
            />
          </div>
        </div>
      )}

      {/* TEF */}
      {showTEF && (
        <TEFProcessor total={pdv.total} onComplete={handleTEFComplete} onCancel={() => { setShowTEF(false); setTefDefaultMethod(null); }} onPrazoRequested={handlePrazoRequested} defaultMethod={tefDefaultMethod as any} pixConfig={pixKey ? { pixKey, pixKeyType: pixKeyType || undefined, merchantName: companyName || "LOJA", merchantCity: pixCity || "SAO PAULO" } : null} tefConfig={tefConfigData ? { provider: tefConfigData.provider, apiKey: tefConfigData.api_key, apiSecret: tefConfigData.api_secret, terminalId: tefConfigData.terminal_id, merchantId: tefConfigData.merchant_id, companyId: companyId || undefined, environment: tefConfigData.environment } : null} />
      )}

      {/* Client selector for credit sales */}
      {showClientSelector && (
        <PDVClientSelector open={showClientSelector} onClose={() => setShowClientSelector(false)} onSelect={handleCreditSaleConfirmed} saleTotal={pdv.total} />
      )}

      {/* Fiado receipt with signature/CPF fields */}
      {fiadoReceipt && (
        <PDVFiadoReceipt data={fiadoReceipt} onClose={() => setFiadoReceipt(null)} />
      )}

      {/* Loyalty client selector */}
      {showLoyaltyClientSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowLoyaltyClientSelector(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">Identificar Cliente {loyaltyActive && "🎁"}</h2>
              <button onClick={() => setShowLoyaltyClientSelector(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <PDVLoyaltyClientList
              onSelect={(client) => {
                setSelectedClient(client);
                setShowLoyaltyClientSelector(false);
                toast.success(`Cliente: ${client.name}`);
              }}
            />
          </div>
        </div>
      )}

      {/* Receive credit dialog */}
      {showReceiveCredit && (
        <PDVReceiveCreditDialog open={showReceiveCredit} onClose={() => setShowReceiveCredit(false)} />
      )}

      {/* Receipt */}
      {receipt && (
        <SaleReceipt
          items={receipt.items.map((i) => ({
            id: i.id, name: i.name, price: i.price, category: i.category || "",
            sku: i.sku, ncm: i.ncm || "", unit: i.unit, stock: i.stock_quantity, quantity: i.quantity,
            notes: receipt.itemNotes?.[i.id] || undefined,
          }))}
          total={receipt.total} payments={receipt.payments} nfceNumber={receipt.nfceNumber}
          accessKey={receipt.accessKey} serie={receipt.serie}
          isContingency={receipt.isContingency}
          saleId={receipt.saleId}
          slogan={slogan || undefined} logoUrl={logoUrl || undefined} companyName={companyName || undefined}
          companyCnpj={cnpj || undefined}
          companyIe={ie || undefined}
          companyPhone={phone || undefined}
          customerCpf={receipt.customerCpf}
          companyAddress={[addressStreet, addressNumber, addressNeighborhood, addressCity, addressState].filter(Boolean).join(', ') || undefined}
          onClose={() => setReceipt(null)}
        />
      )}

      {/* Cash Register */}
      {showCashRegister && (
        <CashRegister
          terminalId={terminalId}
          onClose={async () => {
            console.log("[PDV] CashRegister onClose called");
            cashRegisterDismissedRef.current = true;
            setShowCashRegister(false);
            // Reload session in background
            pdv.reloadSession(terminalId);
          }}
        />
      )}

      {/* Zero stock dialog */}
      {zeroStockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setZeroStockProduct(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-2xl border border-border shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <PackageX className="w-7 h-7 text-destructive" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Produto sem Estoque</h2>
              <p className="text-sm text-muted-foreground"><strong>{zeroStockProduct.name}</strong> está com estoque zerado.</p>
              <div className="flex gap-3 w-full mt-2">
                <button onClick={() => setZeroStockProduct(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted">Fechar</button>
                <button onClick={() => { setStockMovementProduct(zeroStockProduct); setZeroStockProduct(null); }} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Adicionar Estoque</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock movement dialog from PDV */}
      {stockMovementProduct && (
        <StockMovementDialog
          open={!!stockMovementProduct}
          onOpenChange={(v) => { if (!v) { setStockMovementProduct(null); pdv.refreshProducts(); } }}
          product={{
            ...stockMovementProduct, id: stockMovementProduct.id, name: stockMovementProduct.name,
            sku: stockMovementProduct.sku, unit: stockMovementProduct.unit,
            stock_quantity: stockMovementProduct.stock_quantity, price: stockMovementProduct.price,
            is_active: 1, created_at: "", updated_at: "", company_id: "",
            ncm: stockMovementProduct.ncm, category: stockMovementProduct.category,
            barcode: stockMovementProduct.barcode, cost_price: null, min_stock: null,
            origem: 0, cfop: "5102", cest: null, csosn: "102", cst_icms: "00",
            aliq_icms: 0, cst_pis: "01", aliq_pis: 1.65, cst_cofins: "01",
            aliq_cofins: 7.60, gtin_tributavel: null, fiscal_category_id: null,
          }}
        />
      )}

      {/* Quick product registration */}
      <PDVQuickProductDialog open={showQuickProduct} onOpenChange={setShowQuickProduct} initialBarcode={quickProductBarcode} onProductCreated={() => pdv.refreshProducts()} />

      {/* Price Lookup Dialog (F10) */}
      {showPriceLookup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowPriceLookup(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" /> Consulta de Preço (F10)
              </h2>
              <button onClick={() => setShowPriceLookup(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              <input
                type="text" value={priceLookupQuery} onChange={(e) => setPriceLookupQuery(e.target.value)}
                placeholder="Digite código, SKU ou nome..." autoFocus
                className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {priceLookupQuery.trim().length >= 2 && pdv.products
                  .filter((p) =>
                    p.name.toLowerCase().includes(priceLookupQuery.toLowerCase()) ||
                    p.sku.toLowerCase().includes(priceLookupQuery.toLowerCase()) ||
                    (p.barcode && p.barcode.includes(priceLookupQuery))
                  )
                  .slice(0, 10)
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 rounded-xl bg-muted/50 border border-border">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">SKU: {p.sku} {p.barcode && `| CB: ${p.barcode}`}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-base sm:text-lg font-black text-primary font-mono">{formatCurrency(p.price)}</p>
                        <p className={`text-xs font-mono ${p.stock_quantity > 0 ? "text-primary" : "text-destructive"}`}>
                          Est: {p.stock_quantity} {p.unit}
                        </p>
                      </div>
                    </div>
                  ))}
                {priceLookupQuery.trim().length >= 2 && pdv.products.filter((p) =>
                  p.name.toLowerCase().includes(priceLookupQuery.toLowerCase()) ||
                  p.sku.toLowerCase().includes(priceLookupQuery.toLowerCase()) ||
                  (p.barcode && p.barcode.includes(priceLookupQuery))
                ).length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">Nenhum produto encontrado</p>
                )}
                {priceLookupQuery.trim().length < 2 && (
                  <p className="text-center text-sm text-muted-foreground py-8">Digite ao menos 2 caracteres</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Quote Dialog */}
      {showSaveQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowSaveQuote(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Salvar Orçamento</h2>
              <button onClick={() => setShowSaveQuote(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{pdv.cartItems.length} item(ns)</p>
                <p className="text-2xl font-black font-mono text-primary">{formatCurrency(pdv.total)}</p>
              </div>
              {selectedClient && <div className="text-sm text-foreground">Cliente: <strong>{selectedClient.name}</strong></div>}
              <div>
                <label className="text-xs text-muted-foreground font-medium">Observações (opcional)</label>
                <textarea value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} rows={3}
                  placeholder="Ex: Validade 30 dias..."
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowSaveQuote(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted">Cancelar</button>
                <button onClick={handleSaveQuote} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2">
                  <FileText className="w-4 h-4" /> Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Picker Modal */}
      {showTerminalPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTerminalPicker(false)}>
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                <Monitor className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Selecionar Terminal</h3>
                <p className="text-xs text-muted-foreground">Identificação deste caixa</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {["01", "02", "03", "04", "05", "06", "07", "08"].map((tid) => (
                <button key={tid} onClick={() => setTempTerminalId(tid)}
                  className={`py-3 rounded-xl text-sm font-bold font-mono transition-all ${tempTerminalId === tid ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent"}`}
                >T{tid}</button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowTerminalPicker(false)} className="flex-1 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium">Cancelar</button>
              <button onClick={() => {
                const newId = tempTerminalId || "01";
                setTerminalId(newId);
                localStorage.setItem("pdv_terminal_id", newId);
                setShowTerminalPicker(false);
                toast.success(`Terminal: T${newId}`);
              }} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold">Confirmar</button>
            </div>
          </div>
        </div>
      )}
      {/* ════════ MOBILE MODAL: Item Discount ════════ */}
      {editingItemDiscountId && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden bg-black/50" onClick={() => setEditingItemDiscountId(null)}>
          <div className="w-full bg-card rounded-t-2xl border-t border-border shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Desconto do Item</h3>
              <button onClick={() => setEditingItemDiscountId(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {pdv.cartItems.find(i => i.id === editingItemDiscountId)?.name || "Item"} — Máx: {maxDiscountPercent}%
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={maxDiscountPercent}
                step={0.5}
                autoFocus
                defaultValue={pdv.itemDiscounts[editingItemDiscountId] || 0}
                className="flex-1 px-4 py-3 rounded-xl bg-background border-2 border-border text-xl font-mono text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    const val = Math.min(Math.max(0, Number((e.target as HTMLInputElement).value)), maxDiscountPercent);
                    pdv.setItemDiscount(editingItemDiscountId!, val);
                    setEditingItemDiscountId(null);
                  }
                }}
                id="mobile-item-discount-input"
              />
              <span className="text-lg font-bold text-muted-foreground">%</span>
            </div>
            <button
              onClick={() => {
                const input = document.getElementById("mobile-item-discount-input") as HTMLInputElement;
                const val = Math.min(Math.max(0, Number(input?.value || 0)), maxDiscountPercent);
                pdv.setItemDiscount(editingItemDiscountId!, val);
                setEditingItemDiscountId(null);
              }}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
            >
              Aplicar Desconto
            </button>
          </div>
        </div>
      )}

      {/* ════════ MOBILE MODAL: Global Discount ════════ */}
      {editingGlobalDiscount && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden bg-black/50" onClick={() => setEditingGlobalDiscount(false)}>
          <div className="w-full bg-card rounded-t-2xl border-t border-border shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Desconto Total</h3>
              <button onClick={() => setEditingGlobalDiscount(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">Máx: {maxDiscountPercent}%</p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={maxDiscountPercent}
                step={0.5}
                autoFocus
                defaultValue={pdv.globalDiscountPercent}
                className="flex-1 px-4 py-3 rounded-xl bg-background border-2 border-border text-xl font-mono text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    const val = Math.min(Math.max(0, Number((e.target as HTMLInputElement).value)), maxDiscountPercent);
                    pdv.setGlobalDiscountPercent(val);
                    setEditingGlobalDiscount(false);
                  }
                }}
                id="mobile-global-discount-input"
              />
              <span className="text-lg font-bold text-muted-foreground">%</span>
            </div>
            <button
              onClick={() => {
                const input = document.getElementById("mobile-global-discount-input") as HTMLInputElement;
                const val = Math.min(Math.max(0, Number(input?.value || 0)), maxDiscountPercent);
                pdv.setGlobalDiscountPercent(val);
                setEditingGlobalDiscount(false);
              }}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
            >
              Aplicar Desconto
            </button>
          </div>
        </div>
      )}

      {/* ════════ MOBILE MODAL: Change Quantity ════════ */}
      {editingQtyItemId && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden bg-black/50" onClick={() => setEditingQtyItemId(null)}>
          <div className="w-full bg-card rounded-t-2xl border-t border-border shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Alterar Quantidade</h3>
              <button onClick={() => setEditingQtyItemId(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {pdv.cartItems.find(i => i.id === editingQtyItemId)?.name || "Item"}
            </p>
            <input
              type="number"
              min={1}
              step={1}
              autoFocus
              value={editingQtyValue}
              onChange={(e) => setEditingQtyValue(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border text-xl font-mono text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  const newQty = Math.max(1, parseInt(editingQtyValue) || 1);
                  const item = pdv.cartItems.find(i => i.id === editingQtyItemId);
                  if (item) {
                    const delta = newQty - item.quantity;
                    pdv.updateQuantity(editingQtyItemId!, delta);
                  }
                  setEditingQtyItemId(null);
                }
              }}
            />
            <button
              onClick={() => {
                const newQty = Math.max(1, parseInt(editingQtyValue) || 1);
                const item = pdv.cartItems.find(i => i.id === editingQtyItemId);
                if (item) {
                  const delta = newQty - item.quantity;
                  pdv.updateQuantity(editingQtyItemId!, delta);
                }
                setEditingQtyItemId(null);
              }}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Hold/Recall Dialog */}
      <PDVHoldRecallDialog open={showHoldRecall} onClose={() => setShowHoldRecall(false)} onRecall={handleRecallSale} />

      {/* Return/Exchange Dialog */}
      <PDVReturnExchangeDialog open={showReturnExchange} onClose={() => setShowReturnExchange(false)} />

      {/* Item Notes Dialog */}
      <PDVItemNotesDialog
        open={!!editingItemNoteId}
        itemName={pdv.cartItems.find(i => i.id === editingItemNoteId)?.name || ""}
        currentNote={editingItemNoteId ? itemNotes[editingItemNoteId] || "" : ""}
        onSave={(note) => { if (editingItemNoteId) setItemNote(editingItemNoteId, note); }}
        onClose={() => setEditingItemNoteId(null)}
      />

      {/* Exit confirmation when cash register is open */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Caixa ainda aberto</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem um caixa aberto. Deseja fechar o caixa antes de sair ou sair mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowExitConfirm(false); navigate("/"); }}
              className="bg-muted text-foreground hover:bg-muted/80"
            >
              Sair sem fechar
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => { setShowExitConfirm(false); setShowCashRegister(true); }}
              className="bg-primary text-primary-foreground"
            >
              Fechar caixa primeiro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force-closed alert from manager */}
      <AlertDialog open={forceClosedAlert} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Caixa Encerrado Remotamente
            </AlertDialogTitle>
            <AlertDialogDescription>
              O gerente encerrou este terminal remotamente pelo painel de terminais. Não é possível registrar novas vendas. Para continuar operando, abra um novo caixa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => { setForceClosedAlert(false); setShowCashRegister(true); }} className="bg-primary text-primary-foreground">
              Abrir Novo Caixa
            </AlertDialogAction>
            <AlertDialogAction onClick={() => { setForceClosedAlert(false); navigate("/"); }} className="bg-muted text-foreground hover:bg-muted/80">
              Sair do PDV
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

/** Simple live clock component for the top bar */
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <span className="font-mono font-bold tracking-wider">
      {time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

/** Session duration timer for top bar */
function SessionTimer({ openedAt }: { openedAt: string }) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = Date.now() - new Date(openedAt).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setElapsed(`${h}h${String(m).padStart(2, "0")}m`);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [openedAt]);
  return (
    <span className="font-mono text-[10px] opacity-80" title="Tempo de caixa aberto">
      🕐 {elapsed}
    </span>
  );
}
