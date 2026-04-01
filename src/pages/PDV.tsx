import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { PDVTopBar } from "@/components/pdv/PDVTopBar";
import { PDVCartTable } from "@/components/pdv/PDVCartTable";
import { PDVPaymentBar } from "@/components/pdv/PDVPaymentBar";
import { PDVTotalsSidebar } from "@/components/pdv/PDVTotalsSidebar";
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
import { Search, X, FileText, PackageX, Printer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { PaymentResult } from "@/services/types";
import { openCashDrawer } from "@/lib/escpos";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { playAddSound, playErrorSound, playSaleCompleteSound } from "@/lib/pdv-sounds";
import { formatCurrency } from "@/lib/utils";
import { logAction } from "@/services/ActionLogger";
import { assertNonNegativeMoney, ensureMoneyEquals, fromCents, roundMoney, splitInstallments, toCents } from "@/lib/money";
import type { FinancialEntryInsert } from "@/hooks/useFinancialEntries";
import type { CashSessionRow } from "@/integrations/supabase/tables";
import { AlertTriangle } from "lucide-react";
import { usePDVFiscalValidation } from "@/hooks/pdv/usePDVFiscalValidation";

export default function PDV() {
  const pdv = usePDV();
  const navigate = useNavigate();
  const { companyName, companyId, logoUrl, slogan, pixKey, pixKeyType, pixCity, cnpj, ie, phone, addressStreet, addressNumber, addressNeighborhood, addressCity, addressState, taxRegime, pdvAutoEmitNfce } = useCompany();
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
  const skipFiscalEmission = useMemo(() => {
    if (!canUseFiscal) return true;
    return !pdvAutoEmitNfce;
  }, [canUseFiscal, pdvAutoEmitNfce]);
  const fiscalValidation = usePDVFiscalValidation(pdv.cartItems, canUseFiscal && !skipFiscalEmission, taxRegime);
  const [showFiscalErrors, setShowFiscalErrors] = useState(false);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [receipt, setReceipt] = useState<{
    items: typeof pdv.cartItems;
    total: number;
    payments: TEFResult[];
    nfceNumber: string;
    accessKey?: string;
    serie?: string;
    isContingency?: boolean;
    isHomologacao?: boolean;
    saleId?: string;
    customerName?: string;
    customerDoc?: string;
    protocolNumber?: string;
    protocolDate?: string;
    itemNotes?: Record<string, string>;
    promoMatches?: Record<string, { promoName: string; originalPrice: number; finalPrice: number; savingsPerUnit: number; totalSavings: number }>;
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
  const [saleNumber, setSaleNumber] = useState(() => Number(localStorage.getItem("pdv_sale_number") || "1"));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wantsFullscreenRef = useRef(false);
  const [selectedCartItemId, setSelectedCartItemId] = useState<string | null>(null);
  const [pendingQuoteId, setPendingQuoteId] = useState<string | null>(null);
  const [lastAddedItem, setLastAddedItem] = useState<{ name: string; price: number; image_url?: string } | null>(null);
  const lastAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizingSale = pdv.finalizingSale;
  const requireCashSession = localStorage.getItem("pdv_require_cash_session") !== "false";
  const [showHoldRecall, setShowHoldRecall] = useState(false);
  const [showReturnExchange, setShowReturnExchange] = useState(false);
  const [editingItemNoteId, setEditingItemNoteId] = useState<string | null>(null);
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [itemDiscountValues, setItemDiscountValues] = useState<Record<string, number>>({});
  const customerDisplay = useCustomerDisplay();
  const selectedClientDoc = (selectedClient?.cpf || "").replace(/\D/g, "");
  const fiscalCustomerReady = selectedClientDoc.length === 11 || selectedClientDoc.length === 14;
  const fiscalFinalizeBlocked = canUseFiscal && !skipFiscalEmission && !!selectedClient && !fiscalCustomerReady;
  const fiscalFinalizeBlockReason = fiscalFinalizeBlocked
    ? "Cliente selecionado sem CPF/CNPJ valido para NFC-e"
    : "";

  // ── Fullscreen ──
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
      if (!isFull && wantsFullscreenRef.current) {
        setTimeout(() => {
          if (!document.fullscreenElement && wantsFullscreenRef.current) {
            document.documentElement.requestFullscreen().catch(() => { wantsFullscreenRef.current = false; });
          }
        }, 300);
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useBarcodeScanner(pdv.handleBarcodeScan);

  // ── Cash session management ──
  const cashRegisterDismissedRef = useRef(false);
  const [forceClosedAlert, setForceClosedAlert] = useState(false);
  type ForceClosedSnapshot = {
    terminal_id: string; opened_at?: string; closed_at: string;
    openBalance: number; totalVendas: number; salesCount: number;
    totalDinheiro: number; totalDebito: number; totalCredito: number; totalPix: number;
    totalSangria: number; totalSuprimento: number; totalFiadoRecebido: number; fiadoCount: number;
    totalExpected: number; totalCounted: number; difference: number; closingNotes: string;
  };
  const [forceClosedSnapshot, setForceClosedSnapshot] = useState<ForceClosedSnapshot | null>(null);
  const forceClosedRef = useRef(false);
  const selfClosingRef = useRef(false);

  useEffect(() => {
    if (!companyId) return;
    cashRegisterDismissedRef.current = false;
    pdv.reloadSession(terminalId);
    const checkForceClosedHistory = async () => {
      try {
        const { data } = await supabase.from("cash_sessions").select("id, notes, closed_at, terminal_id").eq("company_id", companyId).eq("terminal_id", terminalId).eq("status", "fechado").ilike("notes", "%[ADMIN_FORCE_CLOSED]%").order("closed_at", { ascending: false }).limit(1).maybeSingle();
        if (data) {
          const closedAt = new Date(data.closed_at).getTime();
          const dismissKey = `admin_force_close_seen_${data.id}`;
          if (!localStorage.getItem(dismissKey) && Date.now() - closedAt < 48 * 3600000) {
            toast.warning("Seu caixa anterior foi fechado automaticamente por permanecer aberto por muito tempo.", { duration: 15000, id: "admin-force-close-notice" });
            localStorage.setItem(dismissKey, "1");
          }
        }
      } catch {}
    };
    checkForceClosedHistory();
  }, [terminalId, companyId]);

  // Realtime listener for force-close
  useEffect(() => {
    if (!companyId || !pdv.currentSession) return;
    const sessionId = pdv.currentSession.id;
    const channel = supabase.channel(`pdv-session-${sessionId}`).on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "cash_sessions", filter: `id=eq.${sessionId}`,
    }, (payload) => {
      if (selfClosingRef.current) return;
      const s = (payload as unknown as { new?: Partial<CashSessionRow> | null }).new ?? null;
      if (s?.status === "fechado") {
        setForceClosedSnapshot({
          terminal_id: s.terminal_id || terminalId, opened_at: s.opened_at,
          closed_at: s.closed_at || new Date().toISOString(), openBalance: Number(s.opening_balance || 0),
          totalVendas: Number(s.total_vendas || 0), salesCount: Number(s.sales_count || 0),
          totalDinheiro: Number(s.total_dinheiro || 0), totalDebito: Number(s.total_debito || 0),
          totalCredito: Number(s.total_credito || 0), totalPix: Number(s.total_pix || 0),
          totalSangria: Number(s.total_sangria || 0), totalSuprimento: Number(s.total_suprimento || 0),
          totalFiadoRecebido: 0, fiadoCount: 0,
          totalExpected: Number(s.closing_balance || 0), totalCounted: Number(s.closing_balance || 0),
          difference: 0, closingNotes: s.notes || "",
        });
        forceClosedRef.current = true;
        setShowCashRegister(false);
        setForceClosedAlert(true);
        playErrorSound();
        const isAdminClose = s.notes?.includes("[ADMIN_FORCE_CLOSED]");
        toast.error(isAdminClose ? "Seu caixa foi fechado automaticamente por estar aberto por tempo excessivo." : "Caixa fechado remotamente pelo gerente!", { duration: 15000 });
      }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, pdv.currentSession?.id, terminalId]);

  useEffect(() => { if (showCashRegister) selfClosingRef.current = true; }, [showCashRegister]);

  useEffect(() => {
    if (forceClosedRef.current) return;
    if (requireCashSession && pdv.sessionEverLoaded && !pdv.loadingSession && !pdv.currentSession && !showCashRegister && !cashRegisterDismissedRef.current && !forceClosedAlert) {
      setShowCashRegister(true);
    }
  }, [pdv.sessionEverLoaded, pdv.loadingSession, pdv.currentSession, showCashRegister, requireCashSession, forceClosedAlert]);

  // ── Focus management ──
  const noModalOpen = !showTEF && !receipt && !showCashRegister && !showProductList && !showShortcuts && !showPriceLookup && !showLoyaltyClientSelector && !showQuickProduct && !showSaveQuote && !showTerminalPicker && !showClientSelector && !showReceiveCredit && !zeroStockProduct && !stockMovementProduct && !editingQtyItemId && !editingItemDiscountId && !editingGlobalDiscount && !showHoldRecall && !showReturnExchange && !editingItemNoteId;

  useEffect(() => {
    if (noModalOpen) { const t = setTimeout(() => barcodeInputRef.current?.focus(), 50); return () => clearTimeout(t); }
  }, [noModalOpen]);

  useEffect(() => {
    if (!noModalOpen) return;
    const interval = setInterval(() => {
      const active = document.activeElement;
      if (active && (active as HTMLElement).dataset?.noBarcodeCapture) return;
      if (active !== barcodeInputRef.current) barcodeInputRef.current?.focus();
    }, 500);
    return () => clearInterval(interval);
  }, [noModalOpen]);

  // ── Customer display broadcast ──
  useEffect(() => {
    customerDisplay.broadcast({
      items: pdv.cartItems, total: pdv.total, subtotal: pdv.subtotal,
      globalDiscountPercent: pdv.globalDiscountPercent, globalDiscountValue: pdv.globalDiscountValue,
      itemDiscounts: pdv.itemDiscounts, companyName: companyName || "", logoUrl, lastAdded: lastAddedItem,
    });
  }, [pdv.cartItems, pdv.total, pdv.subtotal, pdv.globalDiscountPercent, pdv.itemDiscounts, lastAddedItem]);

  // ── Hold/Recall ──
  const handleHoldSale = useCallback(() => {
    if (pdv.cartItems.length === 0) { toast.warning("Carrinho vazio", { duration: 1200 }); return; }
    const held: HeldSale = {
      id: crypto.randomUUID(), items: pdv.cartItems.map(i => ({ ...i })),
      itemDiscounts: { ...pdv.itemDiscounts }, globalDiscountPercent: pdv.globalDiscountPercent,
      clientName: selectedClient?.name, total: pdv.total, heldAt: new Date().toISOString(),
    };
    saveHeldSale(held);
    pdv.clearCart(); setSelectedClient(null); setSelectedCartItemId(null);
    toast.success(`Venda suspensa (${getHeldSales().length} pendente${getHeldSales().length > 1 ? "s" : ""})`, { duration: 1500 });
  }, [pdv, selectedClient]);

  const handleRecallSale = useCallback((sale: HeldSale) => {
    if (pdv.cartItems.length > 0) handleHoldSale();
    sale.items.forEach(item => {
      const product = pdv.products.find(p => p.id === item.id);
      if (product) { for (let i = 0; i < item.quantity; i++) pdv.addToCart(product); }
    });
    Object.entries(sale.itemDiscounts).forEach(([id, disc]) => pdv.setItemDiscount(id, disc));
    pdv.setGlobalDiscountPercent(sale.globalDiscountPercent);
    toast.info("Venda retomada", { duration: 1200 });
  }, [pdv, handleHoldSale]);

  const setItemNote = useCallback((id: string, note: string) => {
    setItemNotes(prev => ({ ...prev, [id]: note }));
    setEditingItemNoteId(null);
  }, []);

  const setItemFixedDiscount = useCallback((id: string, value: number) => {
    setItemDiscountValues(prev => ({ ...prev, [id]: value }));
    const item = pdv.cartItems.find(i => i.id === id);
    if (item && item.price > 0) pdv.setItemDiscount(id, Math.min((value / item.price) * 100, 100));
  }, [pdv.cartItems, pdv.setItemDiscount]);

  // ── Quote loading ──
  useEffect(() => {
    const raw = sessionStorage.getItem("pdv_load_quote");
    if (raw && pdv.products.length > 0) {
      sessionStorage.removeItem("pdv_load_quote");
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return;
        const obj = parsed as { quoteId?: unknown; items?: unknown; clientName?: unknown };
        const quoteId = typeof obj.quoteId === "string" ? obj.quoteId : null;
        if (quoteId) setPendingQuoteId(quoteId);
        type QuoteLoadItem = { product_id: string; quantity: number };
        const items = Array.isArray(obj.items) ? (obj.items as unknown[]) : [];
        const safeItems: QuoteLoadItem[] = items.map((it) => {
          if (!it || typeof it !== "object") return null;
          const rec = it as Record<string, unknown>;
          const product_id = typeof rec.product_id === "string" ? rec.product_id : null;
          const quantity = typeof rec.quantity === "number" && Number.isFinite(rec.quantity) ? rec.quantity : 1;
          if (!product_id) return null;
          return { product_id, quantity };
        }).filter((v): v is QuoteLoadItem => !!v);
        for (const item of safeItems) {
          const product = pdv.products.find((p) => p.id === item.product_id);
          if (!product) continue;
          const q = Math.max(1, Math.floor(item.quantity || 1));
          for (let i = 0; i < q; i++) pdv.addToCart(product);
        }
        if (safeItems.length > 0) toast.info("Orçamento carregado no carrinho", { duration: 1500 });
      } catch {}
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
        items, discountPercent: pdv.globalDiscountPercent, discountValue: pdv.globalDiscountValue,
        total: pdv.total, clientName: selectedClient?.name, clientId: selectedClient?.id,
        notes: quoteNotes || undefined, validDays: 30,
      } as any);
      toast.success("Orçamento salvo com sucesso!", { duration: 1500 });
      pdv.clearCart(); setSelectedClient(null); setShowSaveQuote(false); setQuoteNotes("");
    } catch (err: unknown) {
      toast.error(`Erro ao salvar orçamento: ${err instanceof Error ? err.message : "Erro"}`);
    }
  };

  // ── Checkout / Payment ──
  const handleCheckout = useCallback((defaultMethod?: string) => {
    if (!pdv.currentSession) { toast.warning("Abra o caixa antes de finalizar uma venda", { duration: 1500 }); setShowCashRegister(true); return; }
    if (pdv.cartItems.length === 0) { toast.warning("Adicione itens ao carrinho primeiro", { duration: 1200 }); return; }
    if (finalizingSale) { toast.warning("Venda em processamento, aguarde...", { duration: 1200 }); return; }
    if (fiscalFinalizeBlocked) { playErrorSound(); toast.error(fiscalFinalizeBlockReason, { duration: 2500 }); return; }
    if (!fiscalValidation.valid) {
      playErrorSound();
      setShowFiscalErrors(true);
      return;
    }
    setTefDefaultMethod(defaultMethod || null);
    setShowTEF(true);
  }, [pdv.cartItems.length, pdv.currentSession, finalizingSale, fiscalFinalizeBlocked, fiscalFinalizeBlockReason, fiscalValidation.valid]);

  const handleDirectPayment = useCallback((method: string) => {
    if (pdv.cartItems.length === 0) { toast.warning("Adicione itens ao carrinho primeiro", { duration: 1200 }); return; }
    if (finalizingSale) { toast.warning("Venda em processamento, aguarde...", { duration: 1200 }); return; }
    if (fiscalFinalizeBlocked) { playErrorSound(); toast.error(fiscalFinalizeBlockReason, { duration: 2500 }); return; }
    if (method === "prazo") { handlePrazoRequested(); return; }
    handleCheckout(method);
  }, [pdv.cartItems.length, handleCheckout, finalizingSale, fiscalFinalizeBlocked, fiscalFinalizeBlockReason]);

  // ── Barcode ──
  const handleBarcodeSubmit = () => {
    const raw = barcodeInput.trim();
    if (!raw) return;
    if (!pdv.currentSession) { toast.warning("Abra o caixa antes de registrar produtos", { duration: 1500 }); setShowCashRegister(true); setBarcodeInput(""); return; }
    let query = raw;
    let multiplier = 1;
    if (raw.includes("*")) {
      const multiMatch = raw.match(/^(\d+)\*(.+)$/);
      if (!multiMatch || !multiMatch[2].trim()) { playErrorSound(); toast.error("Formato inválido. Use quantidade*código.", { duration: 2000 }); setBarcodeInput(""); return; }
      multiplier = Math.max(1, parseInt(multiMatch[1], 10));
      query = multiMatch[2].trim();
    }
    if (isScaleBarcode(query)) { pdv.handleBarcodeScan(query); playAddSound(); setBarcodeInput(""); return; }
    const exactMatch = pdv.products.find((p) => p.sku === query || p.barcode === query || p.id === query || p.ncm === query);
    if (exactMatch) {
      if (exactMatch.stock_quantity <= 0) { playErrorSound(); setZeroStockProduct(exactMatch); setBarcodeInput(""); return; }
      const qty = Math.min(multiplier, exactMatch.stock_quantity);
      if (qty < multiplier) toast.warning(`Estoque insuficiente (${exactMatch.stock_quantity} ${exactMatch.unit}). Adicionando ${qty}.`, { duration: 2000 });
      for (let i = 0; i < qty; i++) pdv.addToCart(exactMatch);
      playAddSound(); setBarcodeInput(""); return;
    }
    const searchMatch = pdv.products.find((p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.toLowerCase().includes(query.toLowerCase()) || (p.ncm && p.ncm.includes(query)));
    if (searchMatch) {
      if (searchMatch.stock_quantity <= 0) { playErrorSound(); setZeroStockProduct(searchMatch); setBarcodeInput(""); return; }
      const qty = Math.min(multiplier, searchMatch.stock_quantity);
      if (qty < multiplier) toast.warning(`Estoque insuficiente (${searchMatch.stock_quantity} ${searchMatch.unit}). Adicionando ${qty}.`, { duration: 2000 });
      for (let i = 0; i < qty; i++) pdv.addToCart(searchMatch);
      playAddSound();
    } else {
      playErrorSound();
      toast.error(`Produto não encontrado: ${query}`, { action: { label: "Cadastrar", onClick: () => { setQuickProductBarcode(query); setShowQuickProduct(true); } } });
    }
    setBarcodeInput("");
  };

  const handleAddToCart = useCallback((product: PDVProduct) => {
    if (product.stock_quantity <= 0) { playErrorSound(); setZeroStockProduct(product); return; }
    const added = pdv.addToCart(product);
    if (added) {
      playAddSound();
      setLastAddedItem({ name: product.name, price: product.price, image_url: product.image_url });
      if (lastAddedTimerRef.current) clearTimeout(lastAddedTimerRef.current);
      lastAddedTimerRef.current = setTimeout(() => setLastAddedItem(null), 3000);
      // Fiscal validation warning on add
      if (canUseFiscal && !skipFiscalEmission) {
        const gaps: string[] = [];
        const ncm = (product.ncm || "").replace(/\D/g, "");
        if (!ncm || ncm.length !== 8 || ncm === "00000000") gaps.push("NCM");
        const cfop = (product.cfop || "").trim();
        if (!cfop || cfop.length !== 4) gaps.push("CFOP");
        if (!(product.cst_icms || "").trim() && !(product.csosn || "").trim()) gaps.push("CST/CSOSN");
        if (product.origem === undefined || product.origem === null) gaps.push("Origem");
        if (gaps.length > 0) {
          toast.warning(`⚠️ "${product.name}" — dados fiscais incompletos: ${gaps.join(", ")}`, { duration: 4000, id: `fiscal-warn-${product.id}` });
        }
      }
    }
  }, [pdv, canUseFiscal, skipFiscalEmission]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isFKey = e.key.startsWith("F") && e.key.length <= 3;
      const isDelete = e.key === "Delete";
      const isEscape = e.key === "Escape";
      const isArrow = e.key === "ArrowUp" || e.key === "ArrowDown";
      const isPlus = e.key === "+" && !(e.target instanceof HTMLInputElement);
      if (!isFKey && !isDelete && !isEscape && !isArrow && !isPlus) return;

      if (showTEF) {
        if (isEscape && isFullscreen) { e.preventDefault(); e.stopImmediatePropagation(); setTimeout(() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); }, 200); }
        return;
      }
      if (receipt) { if (e.key === "F1") { e.preventDefault(); setReceipt(null); reenterFullscreen(); } return; }
      if (showCashRegister) { if (isEscape && pdv.currentSession) { e.preventDefault(); setShowCashRegister(false); reenterFullscreen(); } return; }
      if (stockMovementProduct) return;
      if (showProductList && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")) return;

      switch (e.key) {
        case "ArrowDown": e.preventDefault(); navigateCart(1); break;
        case "ArrowUp": e.preventDefault(); navigateCart(-1); break;
        case "F1": e.preventDefault(); if (receipt) setReceipt(null); else setShowCashRegister(true); break;
        case "F2": e.preventDefault(); handleCheckout(); break;
        case "F3": e.preventDefault(); setShowProductList((p) => !p); break;
        case "F4": e.preventDefault(); openCashDrawer(); toast.info("Sangria/Gaveta aberta", { duration: 1200 }); break;
        case "F5": e.preventDefault(); setShowLoyaltyClientSelector(true); break;
        case "F6": e.preventDefault(); if (pdv.cartItems.length > 0) { pdv.clearCart(); setSelectedClient(null); setSelectedCartItemId(null); toast.info("Venda cancelada", { duration: 1500 }); } break;
        case "F7": e.preventDefault(); { const t = getTargetItem(); if (t) setEditingItemDiscountId(t.id); } break;
        case "F8": e.preventDefault(); setEditingGlobalDiscount(true); break;
        case "F9": e.preventDefault(); { const t = getTargetItem(); if (t) { setSelectedCartItemId(t.id); setEditingQtyItemId(t.id); setEditingQtyValue(String(t.quantity)); } else toast.info("Adicione um produto antes de alterar a quantidade", { duration: 1500 }); } break;
        case "F10": e.preventDefault(); setShowPriceLookup(true); setPriceLookupQuery(""); break;
        case "F11": e.preventDefault(); handleHoldSale(); break;
        case "F12": e.preventDefault(); handleCheckout(); break;
        case "Delete": e.preventDefault(); { const t = getTargetItem(); if (t) { pdv.removeItem(t.id); setSelectedCartItemId(null); toast.info(`${t.name} removido`, { duration: 1200 }); } } break;
        case "Escape": handleEscapeKey(e); break;
        case "+": e.preventDefault(); if (pdv.cartItems.length > 0) { const last = pdv.cartItems[pdv.cartItems.length - 1]; const p = pdv.products.find(pr => pr.id === last.id); if (p) { pdv.addToCart(p); playAddSound(); } } break;
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [showTEF, receipt, showCashRegister, showShortcuts, showPriceLookup, showProductList, handleCheckout, pdv, editingQtyItemId, editingItemDiscountId, editingGlobalDiscount, isFullscreen, selectedCartItemId, stockMovementProduct, showHoldRecall, showReturnExchange, editingItemNoteId, handleHoldSale]);

  const navigateCart = (dir: number) => {
    if (pdv.cartItems.length === 0) return;
    const currentIdx = selectedCartItemId ? pdv.cartItems.findIndex(i => i.id === selectedCartItemId) : (dir > 0 ? -1 : 0);
    const nextIdx = dir > 0 ? (currentIdx < pdv.cartItems.length - 1 ? currentIdx + 1 : 0) : (currentIdx > 0 ? currentIdx - 1 : pdv.cartItems.length - 1);
    setSelectedCartItemId(pdv.cartItems[nextIdx].id);
  };

  const getTargetItem = () => {
    if (pdv.cartItems.length === 0) return null;
    return selectedCartItemId ? pdv.cartItems.find(i => i.id === selectedCartItemId) : pdv.cartItems[pdv.cartItems.length - 1];
  };

  const reenterFullscreen = () => {
    if (isFullscreen) setTimeout(() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); }, 200);
  };

  const handleEscapeKey = (e: KeyboardEvent) => {
    const anyModalOpen = showShortcuts || showPriceLookup || showProductList || editingQtyItemId || editingItemDiscountId || editingGlobalDiscount || showSaveQuote || showLoyaltyClientSelector || showQuickProduct || showClientSelector || showReceiveCredit || !!zeroStockProduct || showHoldRecall || showReturnExchange || !!editingItemNoteId;
    if (anyModalOpen) {
      e.preventDefault();
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
      reenterFullscreen();
    } else if (isFullscreen) {
      e.preventDefault();
      reenterFullscreen();
    }
  };

  // ── Sale finalization ──
  const checkLowStockAfterSale = useCallback((soldItems: typeof pdv.cartItems) => {
    const lowStockItems: string[] = [];
    for (const item of soldItems) {
      const product = pdv.products.find((p) => p.id === item.id);
      if (!product) continue;
      const reorderPoint = product.reorder_point ?? 0;
      if (reorderPoint > 0) {
        const remainingStock = product.stock_quantity - item.quantity;
        if (remainingStock <= reorderPoint) lowStockItems.push(`${product.name} (${remainingStock} ${product.unit})`);
      }
    }
    if (lowStockItems.length > 0) toast.warning(`⚠️ Estoque baixo:\n${lowStockItems.join(", ")}`, { duration: 6000 });
  }, [pdv.products]);

  const handleTEFComplete = async (tefResults: TEFResult[]) => {
    const allApproved = tefResults.every((r) => r.approved);

    // ✅ Fecha o modal TEF IMEDIATAMENTE — não bloqueia mais a UI
    setShowTEF(false);
    setTefDefaultMethod(null);

    if (!allApproved || finalizingSale) return;

    // Captura estado antes de limpar
    const savedItems = [...pdv.cartItems];
    const savedTotal = pdv.total;
    const savedClient = selectedClient;
    const savedItemNotes = { ...itemNotes };
    const savedPromoMatches = { ...pdv.promoMatches };

    try {
      const paymentResults: PaymentResult[] = tefResults.map((r) => ({
        method: r.method as PaymentResult["method"], approved: r.approved, amount: r.amount,
        nsu: r.nsu, auth_code: r.authCode, card_brand: r.cardBrand,
        card_last_digits: r.cardLastDigits, installments: r.installments,
        change_amount: r.changeAmount, pix_tx_id: r.pixTxId,
      }));

      toast.info("Finalizando venda e emitindo NFC-e...", { duration: 3000 });

      const result = await pdv.finalizeSale(paymentResults, {
        skipFiscal: skipFiscalEmission,
        maxDiscountPercent,
        fiscalCustomer: selectedClient
          ? { name: selectedClient.name, doc: selectedClient.cpf }
          : undefined,
      });
      playSaleCompleteSound();
      setReceipt({
        items: savedItems, total: savedTotal, payments: tefResults, nfceNumber: result.nfceNumber,
        accessKey: result.accessKey, serie: result.serie, isContingency: result.isContingency,
        isHomologacao: result.isHomologacao,
        saleId: result.saleId, customerName: savedClient?.name || undefined, customerDoc: savedClient?.cpf || undefined,
        itemNotes: savedItemNotes, promoMatches: savedPromoMatches,
      });
      setSelectedClient(null);
      const newNum = saleNumber + 1; setSaleNumber(newNum); localStorage.setItem("pdv_sale_number", String(newNum));
      checkLowStockAfterSale(savedItems);
      if (pendingQuoteId) { updateQuoteStatus(pendingQuoteId, "convertido").catch(() => {}); setPendingQuoteId(null); }
      if (loyaltyActive && savedClient?.id) {
        const pts = await earnPoints(savedClient.id, savedTotal, result.fiscalDocId);
        if (pts > 0) toast.info(`🎁 ${savedClient.name} ganhou ${pts} pontos de fidelidade!`, { duration: 2000 });
      }
    } catch (err: unknown) {
      playErrorSound();
      toast.error(`Erro ao finalizar venda: ${err instanceof Error ? err.message : "Erro"}`);
    }
  };

  const handlePrazoRequested = () => { setShowTEF(false); setTefDefaultMethod(null); setShowClientSelector(true); };

  const handleCreditSaleConfirmed = async (client: CreditClient, mode: "fiado" | "parcelado" | "sinal", installments: number, downPaymentAmount?: number) => {
    setShowClientSelector(false);
    if (finalizingSale) return;
    try {
      const total = roundMoney(pdv.total);
      assertNonNegativeMoney(total, "total da venda");
      const down = downPaymentAmount === undefined ? 0 : roundMoney(downPaymentAmount);
      assertNonNegativeMoney(down, "valor do sinal");
      const isSignal = mode === "sinal" && down > 0;
      const remainingAmount = isSignal ? roundMoney(total - down) : total;
      assertNonNegativeMoney(remainingAmount, "saldo restante");

      const paymentResults: PaymentResult[] = [{
        method: "prazo", approved: true, amount: total,
        credit_client_id: client.id, credit_client_name: client.name,
        credit_mode: isSignal ? "sinal" : mode, credit_installments: installments,
      }];
      const savedItems = [...pdv.cartItems];
      const savedTotal = total;
      const result = await pdv.finalizeSale(paymentResults, {
        skipFiscal: skipFiscalEmission,
        maxDiscountPercent,
        fiscalCustomer: { name: client.name, doc: client.cpf },
      });
      playSaleCompleteSound();

      if (result.saleId) {
        const currentBalance = Number(client.credit_balance || 0);
        assertNonNegativeMoney(currentBalance, "saldo atual do cliente");
        const creditAmount = isSignal ? remainingAmount : savedTotal;
        assertNonNegativeMoney(creditAmount, "valor a creditar");
        const newBalance = currentBalance + creditAmount;
        assertNonNegativeMoney(newBalance, "novo saldo do cliente");
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const userId = authUser?.id || null;
        const throwErr = (label: string, error: unknown) => {
          if (!error) return;
          const msg = error instanceof Error ? error.message : "erro desconhecido";
          console.error(`[Fiado] ${label} failed:`, error);
          throw new Error(`${label}: ${msg}`);
        };
        const { error: saleErr } = await supabase.from("sales").update({ status: isSignal ? "sinal" : "fiado" }).eq("id", result.saleId);
        throwErr("Atualizar status da venda", saleErr);
        const { error: balErr } = await supabase.from("clients").update({ credit_balance: newBalance }).eq("id", client.id);
        throwErr("Atualizar saldo do cliente", balErr);

        if (isSignal || (mode === "parcelado" && installments > 1)) {
          const { error: delErr } = await supabase.from("financial_entries").delete().eq("reference", result.saleId).eq("company_id", companyId);
          throwErr("Remover lançamento automático", delErr);
          if (!companyId) throw new Error("Empresa não carregada");
          const today = new Date().toISOString().split("T")[0];
          const entriesToInsert: FinancialEntryInsert[] = [];
          if (isSignal) {
            entriesToInsert.push({ company_id: companyId, type: "receber", description: `Sinal (entrada) - ${client.name}`, reference: result.saleId, counterpart: client.name, amount: down, due_date: today, status: "pago", paid_amount: down, paid_date: today, created_by: userId });
          }
          const baseAmount = isSignal ? remainingAmount : savedTotal;
          const numInstallments = isSignal ? (installments > 1 ? installments : 1) : installments;
          const centsParts = splitInstallments(baseAmount, numInstallments);
          ensureMoneyEquals(fromCents(centsParts.reduce((s, c) => s + c, 0)), baseAmount, "parcelas vs total");
          for (let i = 0; i < numInstallments; i++) {
            const dueDate = new Date(); dueDate.setMonth(dueDate.getMonth() + i + 1);
            const value = fromCents(centsParts[i] ?? 0);
            assertNonNegativeMoney(value, "valor da parcela");
            entriesToInsert.push({ company_id: companyId, type: "receber", description: numInstallments > 1 ? `Parcela ${i + 1}/${numInstallments}${isSignal ? " (saldo)" : ""} - ${client.name}` : `Saldo (na entrega) - ${client.name}`, reference: result.saleId, counterpart: client.name, amount: value, due_date: dueDate.toISOString().split("T")[0], status: "pendente", created_by: userId });
          }
          const sumInserted = entriesToInsert.filter((e) => e.status === "pendente").reduce((s, e) => s + toCents(e.amount), 0);
          if (sumInserted !== toCents(baseAmount)) throw new Error("parcelas geradas não conferem com o total");
          const { error: insErr } = await supabase.from("financial_entries").insert(entriesToInsert);
          throwErr("Criar parcelas financeiras", insErr);
        } else {
          const { error: updErr } = await supabase.from("financial_entries").update({ status: "pendente", paid_amount: 0, paid_date: null, counterpart: client.name }).eq("reference", result.saleId).eq("company_id", companyId);
          throwErr("Atualizar lançamento para pendente", updErr);
        }
      }

      setReceipt({ items: savedItems, total: savedTotal, payments: [{ method: "prazo", approved: true, amount: savedTotal }], nfceNumber: result.nfceNumber, accessKey: result.accessKey, serie: result.serie, isContingency: result.isContingency, isHomologacao: result.isHomologacao, saleId: result.saleId, promoMatches: { ...pdv.promoMatches } });
      setFiadoReceipt({ clientName: client.name, cpf: client.cpf, total: savedTotal, items: savedItems.map(i => ({ name: i.name, qty: i.quantity, price: i.price })), companyName: companyName || undefined, companyCnpj: cnpj || undefined, companyPhone: phone || undefined, storeSlogan: slogan || undefined, mode: isSignal ? "sinal" : mode, installments, saleNumber, downPayment: isSignal ? downPaymentAmount : undefined });
      const modeLabel = isSignal ? `com sinal de ${formatCurrency(downPaymentAmount)}` : mode === "fiado" ? "fiado" : `parcelado ${installments}x`;
      if (companyId) { const logUserId = (await supabase.auth.getUser()).data?.user?.id; logAction({ companyId, userId: logUserId, action: "Venda a prazo registrada", module: "vendas", details: `Cliente: ${client.name} | ${modeLabel} | ${formatCurrency(savedTotal)}` }); }
      toast.success(`Venda ${modeLabel} registrada para ${client.name}`, { duration: 1500 });
      setSelectedClient(null);
      const newNum = saleNumber + 1; setSaleNumber(newNum); localStorage.setItem("pdv_sale_number", String(newNum));
      checkLowStockAfterSale(savedItems);
      if (pendingQuoteId) { updateQuoteStatus(pendingQuoteId, "convertido").catch(() => {}); setPendingQuoteId(null); }
      if (loyaltyActive && client.id) { const pts = await earnPoints(client.id, savedTotal, result.fiscalDocId); if (pts > 0) toast.info(`🎁 ${client.name} ganhou ${pts} pontos de fidelidade!`, { duration: 2000 }); }
    } catch (err: unknown) {
      playErrorSound();
      toast.error(`Erro ao finalizar venda: ${err instanceof Error ? err.message : "Erro"}`);
    }
  };

  // ── Render: blocked states ──
  if (requireCashSession && !pdv.loadingSession && !pdv.currentSession) {
    return (
      <div className="flex flex-col h-screen bg-background text-foreground relative">
        <button onClick={() => navigate("/")} className="absolute top-4 left-4 z-[60] px-4 py-2 rounded-lg bg-destructive text-destructive-foreground font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg">← Sair do PDV</button>
        <CashRegister terminalId={terminalId} preventClose initialSession={null} skipInitialLoad onClose={() => { pdv.reloadSession(terminalId); }} />
      </div>
    );
  }
  if (pdv.loadingSession) {
    return <div className="flex items-center justify-center h-screen bg-background text-foreground"><p className="text-muted-foreground animate-pulse">Carregando sessão de caixa...</p></div>;
  }

  // ── Main render ──
  return (
    <div className={`pdv-theme flex flex-col h-screen bg-background text-foreground overflow-hidden select-none ${pdv.trainingMode ? "ring-4 ring-warning/60 ring-inset" : ""}`}>

      {/* TOP BAR */}
      <PDVTopBar
        companyName={companyName}
        terminalId={terminalId}
        saleNumber={saleNumber}
        isOnline={pdv.isOnline}
        isFullscreen={isFullscreen}
        trainingMode={pdv.trainingMode}
        contingencyMode={pdv.contingencyMode}
        syncStats={pdv.syncStats}
        currentSession={pdv.currentSession}
        selectedClientName={selectedClient?.name}
        selectedClientDoc={selectedClientDoc || undefined}
        fiscalCustomerReady={fiscalCustomerReady}
        onExit={() => { if (pdv.currentSession) setShowExitConfirm(true); else navigate("/"); }}
        onTerminalClick={() => { setTempTerminalId(terminalId); setShowTerminalPicker(true); }}
        onCashRegisterClick={() => setShowCashRegister(true)}
        onToggleFullscreen={toggleFullscreen}
        onClearClient={() => setSelectedClient(null)}
      />

      {/* BARCODE INPUT */}
      <div data-tour="pdv-search" className={`flex items-center gap-3 lg:gap-4 px-3 lg:px-5 py-3.5 lg:py-5 bg-gradient-to-r from-primary/15 via-card to-primary/15 border-b-[3px] border-primary flex-shrink-0 shadow-[0_4px_20px_-6px_hsl(var(--primary)/0.35)] ${(editingQtyItemId || editingItemDiscountId || editingGlobalDiscount) ? "hidden lg:flex" : "flex"}`}>
        <div className="flex items-center gap-2 bg-primary/20 rounded-xl px-3.5 py-2.5 shadow-sm">
          <Search className="w-5 h-5 lg:w-6 lg:h-6 text-primary" />
          <span className="text-xs lg:text-sm font-black text-primary tracking-widest whitespace-nowrap uppercase">Código</span>
        </div>
        <div className="relative flex-1">
          <input
            ref={barcodeInputRef} type="text" value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (!barcodeInput.trim()) setShowProductList((p) => !p); else handleBarcodeSubmit(); } }}
            placeholder="Leia ou digite o código de barras... (ex: 5*789123 para multiplicar)"
            className="w-full px-4 lg:px-6 py-3 lg:py-4 rounded-xl bg-background border-[3px] border-primary/50 text-foreground text-lg lg:text-2xl xl:text-3xl font-mono font-black tracking-widest focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/25 focus:shadow-[0_0_30px_-4px_hsl(var(--primary)/0.4)] placeholder:text-muted-foreground/35 placeholder:text-xs lg:placeholder:text-sm placeholder:font-normal placeholder:tracking-normal transition-all duration-300"
            autoComplete="off" autoCorrect="off" spellCheck={false}
          />
          {barcodeInput && (
            <button onClick={() => setBarcodeInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-muted hover:bg-destructive/20 transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        <PDVCartTable
          cartItems={pdv.cartItems}
          products={pdv.products}
          itemDiscounts={pdv.itemDiscounts}
          promoMatches={pdv.promoMatches}
          itemNotes={itemNotes}
          selectedCartItemId={selectedCartItemId}
          onSelectItem={setSelectedCartItemId}
          companyName={companyName}
          logoUrl={logoUrl}
          slogan={slogan}
          fiscalInvalidItems={fiscalValidation.invalidItems}
        />
        <PDVTotalsSidebar
          cartItems={pdv.cartItems}
          products={pdv.products}
          subtotal={pdv.subtotal}
          total={pdv.total}
          globalDiscountPercent={pdv.globalDiscountPercent}
          globalDiscountValue={pdv.globalDiscountValue}
          promoSavings={pdv.promoSavings}
          selectedCartItemId={selectedCartItemId}
          editingItemDiscountId={editingItemDiscountId}
          editingGlobalDiscount={editingGlobalDiscount}
          editingQtyItemId={editingQtyItemId}
          editingQtyValue={editingQtyValue}
          maxDiscountPercent={maxDiscountPercent}
          itemDiscounts={pdv.itemDiscounts}
          onSetItemDiscount={pdv.setItemDiscount}
          onSetGlobalDiscount={pdv.setGlobalDiscountPercent}
          onCloseItemDiscount={() => setEditingItemDiscountId(null)}
          onCloseGlobalDiscount={() => setEditingGlobalDiscount(false)}
          onCloseQtyEdit={() => setEditingQtyItemId(null)}
          onUpdateQuantity={pdv.updateQuantity}
          onQtyValueChange={setEditingQtyValue}
        />
      </div>

      {/* PAYMENT BAR */}
      <PDVPaymentBar
        cartItems={pdv.cartItems}
        canUseFiscal={canUseFiscal}
        skipFiscalEmission={skipFiscalEmission}
        selectedClientName={selectedClient?.name}
        fiscalCustomerDoc={selectedClientDoc || undefined}
        fiscalCustomerReady={fiscalCustomerReady}
        fiscalFinalizeBlocked={fiscalFinalizeBlocked}
        fiscalFinalizeBlockReason={fiscalFinalizeBlockReason || undefined}
        pdvAutoEmitNfce={pdvAutoEmitNfce}
        onDirectPayment={handleDirectPayment}
        onCheckout={() => handleCheckout()}
        onClearCart={() => pdv.clearCart()}
        onHoldSale={handleHoldSale}
        onShowHoldRecall={() => setShowHoldRecall(true)}
        onShowReturnExchange={() => setShowReturnExchange(true)}
        onShowProductList={() => setShowProductList((p) => !p)}
        onShowLoyaltyClient={() => setShowLoyaltyClientSelector(true)}
        onShowPriceLookup={() => { setShowPriceLookup(true); setPriceLookupQuery(""); }}
        onShowSaveQuote={() => setShowSaveQuote(true)}
        onShowReceiveCredit={() => setShowReceiveCredit(true)}
        onOpenCustomerDisplay={() => customerDisplay.openDisplay()}
        onEditItemNote={() => { const t = getTargetItem(); if (t) setEditingItemNoteId(t.id); }}
        onAddLastItem={() => { if (pdv.cartItems.length > 0) { const last = pdv.cartItems[pdv.cartItems.length - 1]; const p = pdv.products.find(pr => pr.id === last.id); if (p) pdv.addToCart(p); } }}
        onEditQty={() => { const t = getTargetItem(); if (t) { setEditingQtyItemId(t.id); setEditingQtyValue(String(t.quantity)); } }}
        onEditItemDiscount={() => { const t = getTargetItem(); if (t) setEditingItemDiscountId(t.id); }}
        onEditGlobalDiscount={() => setEditingGlobalDiscount(true)}
        onRemoveItem={() => { const t = getTargetItem(); if (t) { pdv.removeItem(t.id); setSelectedCartItemId(null); toast.info(`${t.name} removido`, { duration: 1200 }); } }}
        selectedCartItemId={selectedCartItemId}
        onClearClient={() => setSelectedClient(null)}
        onClearSelectedItem={() => setSelectedCartItemId(null)}
        maxDiscountPercent={maxDiscountPercent}
      />

      {/* ════════ OVERLAYS / DIALOGS ════════ */}

      {/* Product List */}
      {showProductList && (
        <div className="absolute inset-0 z-30 bg-background flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted flex-shrink-0">
            <span className="text-xs font-bold text-muted-foreground uppercase">Buscar Produtos (F3)</span>
            <button onClick={() => setShowProductList(false)} className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-card border border-border text-muted-foreground hover:text-foreground text-xs font-medium">
              <X className="w-3 h-3" /> Fechar (Esc)
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <PDVProductGrid products={pdv.products} loading={pdv.loadingProducts} companyName={companyName} logoUrl={logoUrl} onAddToCart={(product) => { handleAddToCart(product); setShowProductList(false); }} />
          </div>
        </div>
      )}

      {/* TEF */}
      {showTEF && (
        <TEFProcessor total={pdv.total} onComplete={handleTEFComplete} onCancel={() => { setShowTEF(false); setTefDefaultMethod(null); }} onPrazoRequested={handlePrazoRequested} defaultMethod={tefDefaultMethod}
          pixConfig={pixKey ? { pixKey, pixKeyType: pixKeyType || undefined, merchantName: companyName || "LOJA", merchantCity: pixCity || "SAO PAULO" } : null}
          tefConfig={tefConfigData ? { provider: tefConfigData.provider, apiKey: tefConfigData.api_key, apiSecret: tefConfigData.api_secret, terminalId: tefConfigData.terminal_id, merchantId: tefConfigData.merchant_id, companyId: companyId || undefined, environment: tefConfigData.environment } : null}
        />
      )}

      {showClientSelector && <PDVClientSelector open={showClientSelector} onClose={() => setShowClientSelector(false)} onSelect={handleCreditSaleConfirmed} saleTotal={pdv.total} />}
      {fiadoReceipt && <PDVFiadoReceipt data={fiadoReceipt} onClose={() => setFiadoReceipt(null)} />}

      {/* Loyalty client selector */}
      {showLoyaltyClientSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowLoyaltyClientSelector(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">Identificar Cliente {loyaltyActive && "🎁"}</h2>
              <button onClick={() => setShowLoyaltyClientSelector(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <PDVLoyaltyClientList onSelect={(client) => {
              setSelectedClient({
                id: client.id,
                name: client.name,
                cpf: client.cpf_cnpj,
              });
              setShowLoyaltyClientSelector(false);
              toast.success(`Cliente: ${client.name}`);
            }} />
          </div>
        </div>
      )}

      {showReceiveCredit && <PDVReceiveCreditDialog open={showReceiveCredit} onClose={() => setShowReceiveCredit(false)} />}

      {/* Receipt */}
      {receipt && (
        <SaleReceipt
          items={receipt.items.map((i) => ({ id: i.id, name: i.name, price: i.price, category: i.category || "", sku: i.sku, ncm: i.ncm || "", unit: i.unit, stock: i.stock_quantity, quantity: i.quantity, notes: receipt.itemNotes?.[i.id] || undefined, discount: receipt.promoMatches?.[i.id]?.totalSavings || 0, promoName: receipt.promoMatches?.[i.id]?.promoName }))}
          total={receipt.total} payments={receipt.payments} nfceNumber={receipt.nfceNumber}
          accessKey={receipt.accessKey} serie={receipt.serie} isContingency={receipt.isContingency} isHomologacao={receipt.isHomologacao} saleId={receipt.saleId}
          slogan={slogan || undefined} logoUrl={logoUrl || undefined} companyName={companyName || undefined} companyCnpj={cnpj || undefined} companyIe={ie || undefined} companyPhone={phone || undefined} companyUf={addressState || undefined} customerName={receipt.customerName} customerDoc={receipt.customerDoc}
          companyAddress={[addressStreet, addressNumber, addressNeighborhood, addressCity, addressState].filter(Boolean).join(', ') || undefined}
          onClose={() => setReceipt(null)}
        />
      )}

      {/* Cash Register */}
      {showCashRegister && !forceClosedAlert && (
        <CashRegister terminalId={terminalId} onClose={async () => { selfClosingRef.current = false; cashRegisterDismissedRef.current = true; setShowCashRegister(false); pdv.reloadSession(terminalId); }} />
      )}

      {/* Zero stock dialog */}
      {zeroStockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setZeroStockProduct(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-2xl border border-border shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center"><PackageX className="w-7 h-7 text-destructive" /></div>
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

      {stockMovementProduct && (
        <StockMovementDialog open={!!stockMovementProduct} onOpenChange={(v) => { if (!v) { setStockMovementProduct(null); pdv.refreshProducts(); } }}
          product={{ ...stockMovementProduct, id: stockMovementProduct.id, name: stockMovementProduct.name, sku: stockMovementProduct.sku, unit: stockMovementProduct.unit, stock_quantity: stockMovementProduct.stock_quantity, price: stockMovementProduct.price, ncm: stockMovementProduct.ncm, category: stockMovementProduct.category, barcode: stockMovementProduct.barcode, cost_price: null, min_stock: null, origem: 0, cfop: "5102", cest: null, csosn: "102", cst_icms: "00", aliq_icms: 0, cst_pis: "01", aliq_pis: 1.65, cst_cofins: "01", aliq_cofins: 7.60, gtin_tributavel: null, fiscal_category_id: null } as any}
        />
      )}

      <PDVQuickProductDialog open={showQuickProduct} onOpenChange={setShowQuickProduct} initialBarcode={quickProductBarcode} onProductCreated={() => pdv.refreshProducts()} />

      {/* Price Lookup (F10) */}
      {showPriceLookup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowPriceLookup(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Search className="w-5 h-5 text-primary" /> Consulta de Preço (F10)</h2>
              <button onClick={() => setShowPriceLookup(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              <input type="text" value={priceLookupQuery} onChange={(e) => setPriceLookupQuery(e.target.value)} placeholder="Digite código, SKU ou nome..." autoFocus className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {priceLookupQuery.trim().length >= 2 && pdv.products.filter((p) => p.name.toLowerCase().includes(priceLookupQuery.toLowerCase()) || p.sku.toLowerCase().includes(priceLookupQuery.toLowerCase()) || (p.barcode && p.barcode.includes(priceLookupQuery))).slice(0, 10).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 rounded-xl bg-muted/50 border border-border">
                    <div className="min-w-0 flex-1"><p className="text-sm font-bold text-foreground truncate">{p.name}</p><p className="text-xs text-muted-foreground font-mono truncate">SKU: {p.sku} {p.barcode && `| CB: ${p.barcode}`}</p></div>
                    <div className="text-right flex-shrink-0"><p className="text-base sm:text-lg font-black text-primary font-mono">{formatCurrency(p.price)}</p><p className={`text-xs font-mono ${p.stock_quantity > 0 ? "text-primary" : "text-destructive"}`}>Est: {p.stock_quantity} {p.unit}</p></div>
                  </div>
                ))}
                {priceLookupQuery.trim().length >= 2 && pdv.products.filter((p) => p.name.toLowerCase().includes(priceLookupQuery.toLowerCase()) || p.sku.toLowerCase().includes(priceLookupQuery.toLowerCase()) || (p.barcode && p.barcode.includes(priceLookupQuery))).length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">Nenhum produto encontrado</p>
                )}
                {priceLookupQuery.trim().length < 2 && <p className="text-center text-sm text-muted-foreground py-8">Digite ao menos 2 caracteres</p>}
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
              <div><p className="text-sm text-muted-foreground mb-1">{pdv.cartItems.length} item(ns)</p><p className="text-2xl font-black font-mono text-primary">{formatCurrency(pdv.total)}</p></div>
              {selectedClient && <div className="text-sm text-foreground">Cliente: <strong>{selectedClient.name}</strong></div>}
              <div>
                <label className="text-xs text-muted-foreground font-medium">Observações (opcional)</label>
                <textarea value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} rows={3} placeholder="Ex: Validade 30 dias..." className="w-full mt-1 px-3 py-2 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowSaveQuote(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted">Cancelar</button>
                <button onClick={handleSaveQuote} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold">Salvar Orçamento</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Picker */}
      {showTerminalPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowTerminalPicker(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-2xl border border-border shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4">
            <div className="text-center"><h2 className="text-lg font-bold text-foreground">Selecionar Terminal</h2><p className="text-xs text-muted-foreground">Identificação deste caixa</p></div>
            <div className="grid grid-cols-4 gap-2">
              {["01", "02", "03", "04", "05", "06", "07", "08"].map((tid) => (
                <button key={tid} onClick={() => setTempTerminalId(tid)} className={`py-3 rounded-xl text-sm font-bold font-mono transition-all ${tempTerminalId === tid ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent"}`}>T{tid}</button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowTerminalPicker(false)} className="flex-1 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium">Cancelar</button>
              <button onClick={() => { const newId = tempTerminalId || "01"; setTerminalId(newId); localStorage.setItem("pdv_terminal_id", newId); setShowTerminalPicker(false); toast.success(`Terminal: T${newId}`); }} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile modal: Item Discount */}
      {editingItemDiscountId && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden bg-black/50" onClick={() => setEditingItemDiscountId(null)}>
          <div className="w-full bg-card rounded-t-2xl border-t border-border shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-base font-bold text-foreground">Desconto do Item</h3><button onClick={() => setEditingItemDiscountId(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button></div>
            <p className="text-sm text-muted-foreground">{pdv.cartItems.find(i => i.id === editingItemDiscountId)?.name || "Item"} — Máx: {maxDiscountPercent}%</p>
            <div className="flex items-center gap-3">
              <input type="number" min={0} max={maxDiscountPercent} step={0.5} autoFocus defaultValue={pdv.itemDiscounts[editingItemDiscountId] || 0} className="flex-1 px-4 py-3 rounded-xl bg-background border-2 border-border text-xl font-mono text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" onClick={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { const val = Math.min(Math.max(0, Number((e.target as HTMLInputElement).value)), maxDiscountPercent); pdv.setItemDiscount(editingItemDiscountId!, val); setEditingItemDiscountId(null); } }} id="mobile-item-discount-input" />
              <span className="text-lg font-bold text-muted-foreground">%</span>
            </div>
            <button onClick={() => { const input = document.getElementById("mobile-item-discount-input") as HTMLInputElement; const val = Math.min(Math.max(0, Number(input?.value || 0)), maxDiscountPercent); pdv.setItemDiscount(editingItemDiscountId!, val); setEditingItemDiscountId(null); }} className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold">Aplicar Desconto</button>
          </div>
        </div>
      )}

      {/* Mobile modal: Global Discount */}
      {editingGlobalDiscount && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden bg-black/50" onClick={() => setEditingGlobalDiscount(false)}>
          <div className="w-full bg-card rounded-t-2xl border-t border-border shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-base font-bold text-foreground">Desconto Total</h3><button onClick={() => setEditingGlobalDiscount(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button></div>
            <p className="text-sm text-muted-foreground">Máx: {maxDiscountPercent}%</p>
            <div className="flex items-center gap-3">
              <input type="number" min={0} max={maxDiscountPercent} step={0.5} autoFocus defaultValue={pdv.globalDiscountPercent} className="flex-1 px-4 py-3 rounded-xl bg-background border-2 border-border text-xl font-mono text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" onClick={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { const val = Math.min(Math.max(0, Number((e.target as HTMLInputElement).value)), maxDiscountPercent); pdv.setGlobalDiscountPercent(val); setEditingGlobalDiscount(false); } }} id="mobile-global-discount-input" />
              <span className="text-lg font-bold text-muted-foreground">%</span>
            </div>
            <button onClick={() => { const input = document.getElementById("mobile-global-discount-input") as HTMLInputElement; const val = Math.min(Math.max(0, Number(input?.value || 0)), maxDiscountPercent); pdv.setGlobalDiscountPercent(val); setEditingGlobalDiscount(false); }} className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold">Aplicar Desconto</button>
          </div>
        </div>
      )}

      {/* Mobile modal: Change Quantity */}
      {editingQtyItemId && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden bg-black/50" onClick={() => setEditingQtyItemId(null)}>
          <div className="w-full bg-card rounded-t-2xl border-t border-border shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-base font-bold text-foreground">Alterar Quantidade</h3><button onClick={() => setEditingQtyItemId(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button></div>
            <p className="text-sm text-muted-foreground">{pdv.cartItems.find(i => i.id === editingQtyItemId)?.name || "Item"}</p>
            <input type="number" min={1} step={1} autoFocus value={editingQtyValue} onChange={(e) => setEditingQtyValue(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border text-xl font-mono text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" onClick={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { const newQty = Math.max(1, parseInt(editingQtyValue) || 1); const item = pdv.cartItems.find(i => i.id === editingQtyItemId); if (item) pdv.updateQuantity(editingQtyItemId!, newQty - item.quantity); setEditingQtyItemId(null); } }} />
            <button onClick={() => { const newQty = Math.max(1, parseInt(editingQtyValue) || 1); const item = pdv.cartItems.find(i => i.id === editingQtyItemId); if (item) pdv.updateQuantity(editingQtyItemId!, newQty - item.quantity); setEditingQtyItemId(null); }} className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold">Confirmar</button>
          </div>
        </div>
      )}

      <PDVHoldRecallDialog open={showHoldRecall} onClose={() => setShowHoldRecall(false)} onRecall={handleRecallSale} />
      <PDVReturnExchangeDialog open={showReturnExchange} onClose={() => setShowReturnExchange(false)} />
      <PDVItemNotesDialog open={!!editingItemNoteId} itemName={pdv.cartItems.find(i => i.id === editingItemNoteId)?.name || ""} currentNote={editingItemNoteId ? itemNotes[editingItemNoteId] || "" : ""} onSave={(note) => { if (editingItemNoteId) setItemNote(editingItemNoteId, note); }} onClose={() => setEditingItemNoteId(null)} />

      {/* Fiscal validation errors dialog */}
      <AlertDialog open={showFiscalErrors} onOpenChange={setShowFiscalErrors}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Produtos com dados fiscais incompletos
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 mt-2">
                <p className="text-sm text-muted-foreground">Corrija os produtos abaixo antes de finalizar a venda:</p>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {fiscalValidation.issues.map((issue, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">{issue.productName}</p>
                        <p className="text-xs text-muted-foreground">{issue.field}: {issue.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Fechar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowFiscalErrors(false); navigate("/produtos"); }} className="bg-primary text-primary-foreground">
              Ir para Cadastro de Produtos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Exit confirmation */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Caixa ainda aberto</AlertDialogTitle><AlertDialogDescription>Você tem um caixa aberto. Deseja fechar o caixa antes de sair ou sair mesmo assim?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowExitConfirm(false); navigate("/"); }} className="bg-muted text-foreground hover:bg-muted/80">Sair sem fechar</AlertDialogAction>
            <AlertDialogAction onClick={() => { setShowExitConfirm(false); setShowCashRegister(true); }} className="bg-primary text-primary-foreground">Fechar caixa primeiro</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force-closed alert */}
      <AlertDialog open={forceClosedAlert} onOpenChange={() => {}}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg z-[9999] overflow-y-auto max-h-[90vh]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" />Caixa Encerrado Remotamente</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">O gerente encerrou este terminal remotamente. Confira o resumo abaixo:</p>
                {forceClosedSnapshot && (
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between font-bold text-foreground border-b border-border pb-2"><span>Terminal T{forceClosedSnapshot.terminal_id}</span><span>{forceClosedSnapshot.closed_at ? new Date(forceClosedSnapshot.closed_at).toLocaleString("pt-BR") : ""}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Fundo Inicial:</span><span className="font-mono font-bold text-foreground">{formatCurrency(forceClosedSnapshot.openBalance)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Vendas:</span><span className="font-mono font-bold text-primary">{formatCurrency(forceClosedSnapshot.totalVendas)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Nº Vendas:</span><span className="font-mono font-bold text-foreground">{forceClosedSnapshot.salesCount}</span></div>
                    <div className="border-t border-border pt-2 mt-2 space-y-1">
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Dinheiro:</span><span className="font-mono text-foreground">{formatCurrency(forceClosedSnapshot.totalDinheiro)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Débito:</span><span className="font-mono text-foreground">{formatCurrency(forceClosedSnapshot.totalDebito)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Crédito:</span><span className="font-mono text-foreground">{formatCurrency(forceClosedSnapshot.totalCredito)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">PIX:</span><span className="font-mono text-foreground">{formatCurrency(forceClosedSnapshot.totalPix)}</span></div>
                    </div>
                    <div className="border-t border-border pt-2 mt-2 space-y-1">
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Sangrias:</span><span className="font-mono text-destructive">-{formatCurrency(forceClosedSnapshot.totalSangria)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Suprimentos:</span><span className="font-mono text-success">+{formatCurrency(forceClosedSnapshot.totalSuprimento)}</span></div>
                    </div>
                    <div className="border-t border-border pt-2 mt-2"><p className="text-xs italic text-muted-foreground">{forceClosedSnapshot.closingNotes}</p></div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              if (!forceClosedSnapshot) return;
              const s = forceClosedSnapshot;
              const now = new Date();
              const html = `<html><head><title>Fechamento Forçado</title><style>@page{size:80mm auto;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:8px;width:80mm;color:#000;background:#fff}.center{text-align:center}.bold{font-weight:bold}.line{border-top:1px dashed #000;margin:6px 0}.row{display:flex;justify-content:space-between;padding:2px 0}</style></head><body><div class="center bold"><h2>FECHAMENTO DE CAIXA</h2></div><div class="center">${companyName || "PDV"}</div><div class="center">Terminal: T${s.terminal_id}</div><div class="center">${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}</div><div class="center bold" style="color:red;margin-top:4px">FECHAMENTO FORÇADO</div><div class="line"></div><div class="row"><span>Fundo Inicial:</span><span>${formatCurrency(s.openBalance)}</span></div><div class="row"><span>Total Vendas:</span><span>${formatCurrency(s.totalVendas)}</span></div><div class="row"><span>Nº Vendas:</span><span>${s.salesCount}</span></div><div class="line"></div><div class="row"><span>Dinheiro:</span><span>${formatCurrency(s.totalDinheiro)}</span></div><div class="row"><span>Débito:</span><span>${formatCurrency(s.totalDebito)}</span></div><div class="row"><span>Crédito:</span><span>${formatCurrency(s.totalCredito)}</span></div><div class="row"><span>PIX:</span><span>${formatCurrency(s.totalPix)}</span></div><div class="line"></div><div class="row"><span>Sangrias:</span><span>-${formatCurrency(s.totalSangria)}</span></div><div class="row"><span>Suprimentos:</span><span>+${formatCurrency(s.totalSuprimento)}</span></div></body></html>`;
              const w = window.open("", "_blank", "width=350,height=600");
              if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
            }}><Printer className="w-4 h-4 mr-1" /> Imprimir Relatório</Button>
            <AlertDialogAction onClick={() => { forceClosedRef.current = false; setForceClosedAlert(false); setForceClosedSnapshot(null); pdv.reloadSession(terminalId); setShowCashRegister(true); }} className="bg-primary text-primary-foreground">Abrir Novo Caixa</AlertDialogAction>
            <AlertDialogAction onClick={() => { forceClosedRef.current = false; setForceClosedAlert(false); setForceClosedSnapshot(null); navigate("/"); }} className="bg-muted text-foreground hover:bg-muted/80">Sair do PDV</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
