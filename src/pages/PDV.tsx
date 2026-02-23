import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { isScaleBarcode } from "@/lib/scale-barcode";
import { usePermissions } from "@/hooks/usePermissions";
import { useLoyalty } from "@/hooks/useLoyalty";
import { PDVProductGrid } from "@/components/pdv/PDVProductGrid";
import { PDVLoyaltyClientList } from "@/components/pdv/PDVLoyaltyClientList";
import { PDVQuickProductDialog } from "@/components/pdv/PDVQuickProductDialog";
import { PDVClientSelector, type CreditClient } from "@/components/pdv/PDVClientSelector";
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
import { Wifi, WifiOff, Keyboard, X, Search, Monitor, FileText, User, PackageX, PackagePlus, Maximize, Minimize, Banknote, CreditCard, QrCode, Smartphone, Ticket, MoreHorizontal, Clock as ClockIcon, Trash2, Hash, Percent, AlertTriangle, Plus, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { PaymentResult } from "@/services/types";
import { openCashDrawer } from "@/lib/escpos";
import { playAddSound, playErrorSound, playSaleCompleteSound } from "@/lib/pdv-sounds";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export default function PDV() {
  const pdv = usePDV();
  const navigate = useNavigate();
  const { companyName, companyId, logoUrl, slogan, pixKey, pixKeyType, pixCity } = useCompany();
  const { config: tefConfigData } = useTEFConfig();
  const { maxDiscountPercent } = usePermissions();
  const { earnPoints, isActive: loyaltyActive } = useLoyalty();
  const { createQuote, updateQuoteStatus } = useQuotes({ skipInitialFetch: true });
  const [showSaveQuote, setShowSaveQuote] = useState(false);
  const [quoteNotes, setQuoteNotes] = useState("");
  const [showTEF, setShowTEF] = useState(false);
  const [tefDefaultMethod, setTefDefaultMethod] = useState<string | null>(null);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [receipt, setReceipt] = useState<{
    items: typeof pdv.cartItems;
    total: number;
    payments: TEFResult[];
    nfceNumber: string;
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
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const tableEndRef = useRef<HTMLTableRowElement>(null);
  const [saleNumber, setSaleNumber] = useState(() => Number(localStorage.getItem("pdv_sale_number") || "1"));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedCartItemId, setSelectedCartItemId] = useState<string | null>(null);
  const [pendingQuoteId, setPendingQuoteId] = useState<string | null>(null);
  const [lastAddedItem, setLastAddedItem] = useState<{ name: string; price: number } | null>(null);
  const lastAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useBarcodeScanner(pdv.handleBarcodeScan);

  // Load session for current terminal on mount and terminal change
  useEffect(() => {
    pdv.reloadSession(terminalId);
  }, [terminalId]);

  // Auto-open cash register dialog if no session is open (only after first load completes)
  useEffect(() => {
    if (pdv.sessionEverLoaded && !pdv.loadingSession && !pdv.currentSession && !showCashRegister) {
      setShowCashRegister(true);
    }
  }, [pdv.sessionEverLoaded, pdv.loadingSession, pdv.currentSession]);

  // Always re-focus barcode input when no modal is open
  const noModalOpen = !showTEF && !receipt && !showCashRegister && !showProductList && !showShortcuts && !showPriceLookup && !showLoyaltyClientSelector && !showQuickProduct && !showSaveQuote && !showTerminalPicker && !showClientSelector && !showReceiveCredit && !zeroStockProduct && !editingQtyItemId && !editingItemDiscountId && !editingGlobalDiscount;

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
      if (active && (active as HTMLElement).dataset?.noBarcodeFocus) return;
      if (active !== barcodeInputRef.current) {
        barcodeInputRef.current?.focus();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [noModalOpen]);

  // Auto-scroll to last item
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
    if (pdv.cartItems.length > 0) {
      setTefDefaultMethod(defaultMethod || null);
      setShowTEF(true);
    }
  }, [pdv.cartItems.length, pdv.currentSession]);

  const handleDirectPayment = useCallback((method: string) => {
    if (pdv.cartItems.length === 0) {
      toast.warning("Adicione itens ao carrinho primeiro", { duration: 1200 });
      return;
    }
    if (method === "prazo") {
      handlePrazoRequested();
      return;
    }
    handleCheckout(method);
  }, [pdv.cartItems.length, handleCheckout]);

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

    // Scale barcode
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
      for (let i = 0; i < multiplier; i++) pdv.addToCart(exactMatch);
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
      for (let i = 0; i < multiplier; i++) pdv.addToCart(searchMatch);
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
      setLastAddedItem({ name: product.name, price: product.price });
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

      // Don't intercept in modals (TEF handles its own keys)
      if (showTEF) return;

      if (receipt) {
        if (isEscape) { e.preventDefault(); setReceipt(null); }
        return;
      }
      if (showCashRegister) {
        // Only allow closing cash register via ESC if there's an active session
        if (isEscape && pdv.currentSession) { e.preventDefault(); setShowCashRegister(false); }
        return;
      }

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
        case "F1": e.preventDefault(); break;
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
            if (targetItem) { setEditingQtyItemId(targetItem.id); setEditingQtyValue(String(targetItem.quantity)); }
          }
          break;
        case "F10": e.preventDefault(); setShowPriceLookup(true); setPriceLookupQuery(""); break;
        case "F11": e.preventDefault(); pdv.repeatLastSale(); break;
        case "F12": e.preventDefault(); handleCheckout(); break;
        case "Delete":
          e.preventDefault();
          if (pdv.cartItems.length > 0) {
            const targetItem = selectedCartItemId ? pdv.cartItems.find(i => i.id === selectedCartItemId) : pdv.cartItems[pdv.cartItems.length - 1];
            if (targetItem) { pdv.removeItem(targetItem.id); setSelectedCartItemId(null); toast.info(`${targetItem.name} removido`, { duration: 1200 }); }
          }
          break;
        case "Escape":
          if (showShortcuts) { e.preventDefault(); setShowShortcuts(false); }
          else if (showPriceLookup) { e.preventDefault(); setShowPriceLookup(false); }
          else if (showProductList) { e.preventDefault(); setShowProductList(false); }
          else if (editingQtyItemId) { e.preventDefault(); setEditingQtyItemId(null); }
          else if (editingItemDiscountId) { e.preventDefault(); setEditingItemDiscountId(null); }
          else if (editingGlobalDiscount) { e.preventDefault(); setEditingGlobalDiscount(false); }
          // ESC sem modal aberto: deixa o browser sair da tela cheia normalmente
          break;
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
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [showTEF, receipt, showCashRegister, showShortcuts, showPriceLookup, showProductList, handleCheckout, pdv, editingQtyItemId, editingItemDiscountId, editingGlobalDiscount, isFullscreen, selectedCartItemId]);

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
        const result = await pdv.finalizeSale(paymentResults);
        playSaleCompleteSound();
        setReceipt({
          items: savedItems, total: savedTotal,
          payments: tefResults, nfceNumber: result.nfceNumber,
        });
        setSelectedClient(null);
        // Increment sale number
        const newNum = saleNumber + 1;
        setSaleNumber(newNum);
        localStorage.setItem("pdv_sale_number", String(newNum));
        checkLowStockAfterSale(savedItems);
        // Mark quote as converted if this sale came from a quote
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

  const handleCreditSaleConfirmed = async (client: CreditClient, mode: "fiado" | "parcelado", installments: number) => {
    setShowClientSelector(false);
    try {
      const paymentResults: PaymentResult[] = [{
        method: "prazo", approved: true, amount: pdv.total,
        credit_client_id: client.id, credit_client_name: client.name,
        credit_mode: mode, credit_installments: installments,
      }];
      const savedItems = [...pdv.cartItems];
      const savedTotal = pdv.total;
      const result = await pdv.finalizeSale(paymentResults);
      playSaleCompleteSound();
      setReceipt({
        items: savedItems, total: savedTotal,
        payments: [{ method: "prazo" as any, approved: true, amount: savedTotal }],
        nfceNumber: result.nfceNumber,
      });
      toast.success(`Venda a prazo registrada para ${client.name}`, { duration: 1500 });
      setSelectedClient(null);
      const newNum = saleNumber + 1;
      setSaleNumber(newNum);
      localStorage.setItem("pdv_sale_number", String(newNum));
      checkLowStockAfterSale(savedItems);
      // Mark quote as converted if this sale came from a quote
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
      toast.error(`Erro ao finalizar venda a prazo: ${err.message}`);
    }
  };

  const totalItems = pdv.cartItems.length;
  const totalQty = pdv.cartItems.reduce((a, i) => a + i.quantity, 0);
  const totalFinal = pdv.total;

  // Block PDV entirely if no cash session is open
  if (!pdv.loadingSession && !pdv.currentSession) {
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
      <div className="flex items-center justify-between px-3 h-9 bg-primary text-primary-foreground flex-shrink-0 text-xs overflow-x-auto whitespace-nowrap gap-2 scrollbar-none">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={() => navigate("/")}
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
            onClick={toggleFullscreen}
            className="opacity-80 hover:opacity-100 transition-opacity hidden sm:block"
            title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </button>
          <span className="flex items-center gap-1">
            {pdv.isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span className="font-bold hidden sm:inline">{pdv.isOnline ? "Online" : "Offline"}</span>
          </span>
          <LiveClock />
        </div>
      </div>

      {/* ════════ BARCODE INPUT - LARGEST ELEMENT ════════ */}
      {/* Hide on mobile when editing qty/discount to prevent focus stealing */}
      <div className={`flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2 lg:py-3 bg-card border-b-2 border-primary flex-shrink-0 ${
        (editingQtyItemId || editingItemDiscountId || editingGlobalDiscount) ? "hidden lg:flex" : "flex"
      }`}>
        <span className="text-xs lg:text-sm font-bold text-muted-foreground whitespace-nowrap">CÓDIGO:</span>
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
          className="flex-1 px-3 lg:px-4 py-2 lg:py-3 rounded-lg bg-background border-2 border-border text-foreground text-lg lg:text-xl font-mono font-bold focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50 placeholder:text-xs lg:placeholder:text-sm placeholder:font-normal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      {/* ════════ MAIN CONTENT: 70% items | 30% totals ════════ */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">

        {/* LEFT: Items Table (70%) */}
        <div className="flex-1 lg:flex-[7] flex flex-col min-w-0 border-r border-border min-h-0 max-h-[40vh] lg:max-h-none">
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr className="text-muted-foreground text-left uppercase tracking-wider">
                  <th className="px-2 py-2 font-bold w-10 text-center">#</th>
                  <th className="px-2 py-2 font-bold w-28">Código</th>
                  <th className="px-2 py-2 font-bold">Descrição</th>
                  <th className="px-2 py-2 font-bold text-center w-24">Qtd</th>
                  <th className="px-2 py-2 font-bold text-right w-24">Unitário</th>
                  <th className="px-2 py-2 font-bold text-right w-28">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {pdv.cartItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-0">
                      <div className="flex flex-col items-center justify-center py-12 gap-5">
                        {logoUrl ? (
                          <img src={logoUrl} alt={companyName || "Logo"} className="h-44 object-contain" />
                        ) : (
                          <img src="/logo-as.png" alt="AnthoSystem" className="h-36 object-contain opacity-70" />
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
                        <td className="px-2 py-2 text-center text-muted-foreground font-mono">{idx + 1}</td>
                        <td className="px-2 py-2 font-mono text-muted-foreground">{item.sku}</td>
                        <td className="px-2 py-2 text-foreground">
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
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center font-mono font-bold text-foreground">
                          {isWeighed ? item.quantity.toFixed(3) : item.quantity}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-muted-foreground">
                          {itemDiscount > 0 && (
                            <span className="line-through opacity-50 mr-1">{formatCurrency(item.price)}</span>
                          )}
                          {formatCurrency(unitPrice)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono font-bold text-primary text-sm">
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

        {/* RIGHT: Totals Sidebar (30%) */}
        <div className="shrink-0 lg:shrink lg:flex-[3] flex flex-col bg-card lg:min-w-[240px] lg:max-w-[360px] min-h-0">
          {/* Info rows */}
          <div className="flex-1 flex flex-col p-1.5 lg:p-3 gap-0.5 lg:gap-2 overflow-y-auto">
            <div className="flex justify-between items-center py-1.5 lg:py-2 border-b border-border">
              <span className="text-xs font-bold text-muted-foreground uppercase">Itens</span>
              <span className="text-base lg:text-lg font-bold text-foreground font-mono">{totalItems}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 lg:py-2 border-b border-border">
              <span className="text-xs font-bold text-muted-foreground uppercase">Qtd Total</span>
              <span className="text-base lg:text-lg font-bold text-foreground font-mono">
                {Number.isInteger(totalQty) ? totalQty : totalQty.toFixed(3)}
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5 lg:py-2 border-b border-border">
              <span className="text-xs font-bold text-muted-foreground uppercase">Subtotal</span>
              <span className="text-base lg:text-lg font-bold text-foreground font-mono">{formatCurrency(pdv.subtotal)}</span>
            </div>

            {/* Last added item highlight */}
            {lastAddedItem && (
              <div className="flex justify-between items-center py-1.5 lg:py-2 border-b border-primary/30 bg-primary/5 rounded-lg px-2 animate-fade-in">
                <span className="text-xs font-bold text-primary uppercase flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Último
                </span>
                <div className="text-right">
                  <span className="text-xs font-bold text-foreground block truncate max-w-[140px]">{lastAddedItem.name}</span>
                  <span className="text-xs font-bold text-primary font-mono">{formatCurrency(lastAddedItem.price)}</span>
                </div>
              </div>
            )}

            {/* Desconto item (F7) — mobile: fixed overlay, desktop: inline */}
            {editingItemDiscountId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 lg:relative lg:inset-auto lg:z-auto lg:bg-transparent lg:block">
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
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-xs font-bold text-muted-foreground uppercase">Desconto</span>
              {editingGlobalDiscount ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 lg:relative lg:inset-auto lg:z-auto lg:bg-transparent">
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
                  className={`text-lg font-bold font-mono ${pdv.globalDiscountPercent > 0 ? "text-destructive" : "text-muted-foreground"}`}
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
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 lg:relative lg:inset-auto lg:z-auto lg:bg-transparent lg:block">
                <div className="bg-card rounded-2xl p-6 shadow-2xl w-[85vw] max-w-xs flex flex-col items-center gap-4 lg:flex-row lg:justify-between lg:items-center lg:py-2 lg:px-2 lg:-mx-2 lg:rounded lg:p-0 lg:shadow-none lg:w-auto lg:max-w-none lg:bg-muted/50 border border-border lg:border-b lg:border-t-0 lg:border-x-0">
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
            )}
          </div>

          {/* TOTAL — BIG DISPLAY */}
          <div
            className="p-2 lg:p-4 xl:p-5 mt-auto border-t-4 transition-colors duration-300 flex-shrink-0 overflow-hidden"
            style={{
              backgroundColor: totalFinal > 0 ? "hsl(0, 72%, 40%)" : "hsl(142, 72%, 32%)",
              borderTopColor: totalFinal > 0 ? "hsl(0, 72%, 50%)" : "hsl(142, 72%, 45%)",
            }}
          >
            <div className="text-center">
              <span className="text-[10px] lg:text-sm font-bold uppercase tracking-[0.3em] block mb-0.5 lg:mb-2" style={{ color: "rgba(255,255,255,0.8)" }}>
                {totalFinal > 0 ? "TOTAL A PAGAR" : "TOTAL DA VENDA"}
              </span>
              <span className="text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl font-black font-mono tracking-tight block leading-none truncate" style={{ color: "#ffffff", textShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
                {formatCurrency(totalFinal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ════════ MOBILE ACTION BAR (visible only on mobile) ════════ */}
      <div className="flex lg:hidden items-center gap-1 px-1.5 py-1 border-t border-border bg-muted/50 overflow-x-auto scrollbar-none flex-shrink-0">
        <button
          onClick={() => setShowProductList(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sidebar-background text-sidebar-foreground border border-sidebar-border text-xs font-bold whitespace-nowrap"
        >
          <Search className="w-3.5 h-3.5" /> Buscar
        </button>
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
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sidebar-background text-sidebar-foreground border border-sidebar-border text-xs font-bold whitespace-nowrap disabled:opacity-30"
        >
          <Hash className="w-3.5 h-3.5" /> Qtd
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
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sidebar-background text-sidebar-foreground border border-sidebar-border text-xs font-bold whitespace-nowrap disabled:opacity-30"
        >
          <Percent className="w-3.5 h-3.5" /> Desc.Item
        </button>
        <button
          onClick={() => maxDiscountPercent > 0 && setEditingGlobalDiscount(true)}
          disabled={pdv.cartItems.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sidebar-background text-sidebar-foreground border border-sidebar-border text-xs font-bold whitespace-nowrap disabled:opacity-30"
        >
          <Percent className="w-3.5 h-3.5" /> Desc.Total
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
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-destructive/80 text-white border border-destructive/50 text-xs font-bold whitespace-nowrap disabled:opacity-30"
        >
          <Trash2 className="w-3.5 h-3.5" /> Remover
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
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-destructive/80 text-white border border-destructive/50 text-xs font-bold whitespace-nowrap disabled:opacity-30"
        >
          <X className="w-3.5 h-3.5" /> Cancelar
        </button>
      </div>

      {/* ════════ BOTTOM PAYMENT BAR ════════ */}
      <div className="flex flex-col flex-shrink-0 border-t border-border bg-card">
        {/* Payment method buttons */}
        <div className="flex items-stretch gap-0.5 lg:gap-1 px-1 lg:px-2 py-1 lg:py-1.5 overflow-x-auto scrollbar-none">
          {[
            { id: "dinheiro", label: "Dinheiro", icon: Banknote, colorClass: "bg-emerald-900/60 hover:bg-emerald-800/70 text-emerald-100 border border-emerald-700/40" },
            { id: "debito", label: "Débito", icon: CreditCard, colorClass: "bg-blue-900/60 hover:bg-blue-800/70 text-blue-100 border border-blue-700/40" },
            { id: "credito", label: "Crédito", icon: Wallet, colorClass: "bg-violet-900/60 hover:bg-violet-800/70 text-violet-100 border border-violet-700/40" },
            { id: "pix", label: "PIX", icon: QrCode, colorClass: "bg-teal-900/60 hover:bg-teal-800/70 text-teal-100 border border-teal-700/40" },
            { id: "voucher", label: "Voucher", icon: Ticket, colorClass: "bg-amber-900/60 hover:bg-amber-800/70 text-amber-100 border border-amber-700/40" },
            { id: "prazo", label: "A Prazo", icon: ClockIcon, colorClass: "bg-orange-900/60 hover:bg-orange-800/70 text-orange-100 border border-orange-700/40" },
            { id: "outros", label: "Outros", icon: MoreHorizontal, colorClass: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border" },
          ].map(({ id, label, icon: Icon, colorClass }, idx) => (
            <motion.button
              key={id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03, duration: 0.2 }}
              onClick={() => handleDirectPayment(id)}
              disabled={pdv.cartItems.length === 0}
              className={`flex-1 min-w-[48px] flex flex-col items-center justify-center gap-0.5 py-1.5 lg:py-2 xl:py-2.5 rounded-lg text-sm font-extrabold tracking-wide transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${colorClass}`}
            >
              <Icon className="w-4 h-4 lg:w-5 lg:h-5 xl:w-6 xl:h-6" />
              <span className="text-[10px] lg:text-[11px] xl:text-xs font-bold">{label}</span>
            </motion.button>
          ))}
        </div>
        {/* Shortcut hints row */}
        <div className="hidden lg:flex items-center justify-center gap-1.5 xl:gap-2 px-2 py-1 xl:py-1.5 bg-muted/70 border-t border-border flex-wrap">
          {[
            { key: "F3", label: "Buscar", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => setShowProductList((p) => !p) },
            { key: "F5", label: "Cliente", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => setShowLoyaltyClientSelector(true) },
            { key: "F6", label: "Cancelar", color: "bg-destructive/80 hover:bg-destructive text-white border border-destructive/50", action: () => { if (pdv.cartItems.length > 0) { pdv.clearCart(); setSelectedClient(null); setSelectedCartItemId(null); toast.info("Venda cancelada"); } } },
            { key: "F7", label: "Desc.Item", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => { if (selectedCartItemId) { setEditingItemDiscountId(selectedCartItemId); } else if (pdv.cartItems.length > 0) { const firstId = pdv.cartItems[0].id; setSelectedCartItemId(firstId); setEditingItemDiscountId(firstId); } } },
            { key: "F8", label: "Desc.Total", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => setEditingGlobalDiscount(true) },
            { key: "F9", label: "Qtd", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => { if (selectedCartItemId) { setEditingQtyItemId(selectedCartItemId); setEditingQtyValue(String(pdv.cartItems.find(i => i.id === selectedCartItemId)?.quantity || 1)); } else if (pdv.cartItems.length > 0) { const firstId = pdv.cartItems[0].id; setSelectedCartItemId(firstId); setEditingQtyItemId(firstId); setEditingQtyValue(String(pdv.cartItems.find(i => i.id === firstId)?.quantity || 1)); } } },
            { key: "DEL", label: "Remover", color: "bg-destructive/80 hover:bg-destructive text-white border border-destructive/50", action: () => { if (selectedCartItemId) { pdv.removeItem(selectedCartItemId); setSelectedCartItemId(null); } } },
            { key: "+", label: "Repetir Último", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => { if (pdv.cartItems.length > 0) { const lastItem = pdv.cartItems[pdv.cartItems.length - 1]; const product = pdv.products.find(p => p.id === lastItem.id); if (product) pdv.addToCart(product); } } },
            { key: "F10", label: "Consulta", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => { setShowPriceLookup(true); setPriceLookupQuery(""); } },
            { key: "F11", label: "Rep.Venda", color: "bg-sidebar-background hover:bg-sidebar-accent text-sidebar-foreground border border-sidebar-border", action: () => pdv.repeatLastSale() },
            { key: "F12", label: "Finalizar", color: "bg-primary hover:bg-primary/90 text-primary-foreground border border-primary/50", action: () => handleCheckout() },
          ].map(({ key, label, color, action }) => (
            <button key={key} onClick={action} className={`flex items-center gap-1 font-bold text-xs cursor-pointer rounded px-1.5 py-1 transition-all active:scale-95 ${color}`}>
              <span className="font-mono font-black px-1.5 py-0.5 rounded bg-black/20 text-[10px] border border-white/30">{key}</span>
              {label}
            </button>
          ))}
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
          }))}
          total={receipt.total} payments={receipt.payments} nfceNumber={receipt.nfceNumber}
          slogan={slogan || undefined} logoUrl={logoUrl || undefined} companyName={companyName || undefined}
          onClose={() => setReceipt(null)}
        />
      )}

      {/* Cash Register */}
      {showCashRegister && (
        <CashRegister
          terminalId={terminalId}
          onClose={() => {
            // Only allow closing if there's an active session
            if (pdv.currentSession) {
              setShowCashRegister(false);
              pdv.reloadSession(terminalId);
            } else {
              toast.warning("Abra o caixa antes de usar o PDV");
            }
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
                    <div key={p.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-muted/50 border border-border">
                      <div>
                        <p className="text-sm font-bold text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">SKU: {p.sku} {p.barcode && `| CB: ${p.barcode}`}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-primary font-mono">{formatCurrency(p.price)}</p>
                        <p className={`text-xs font-mono ${p.stock_quantity > 0 ? "text-primary" : "text-destructive"}`}>
                          Estoque: {p.stock_quantity} {p.unit}
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
