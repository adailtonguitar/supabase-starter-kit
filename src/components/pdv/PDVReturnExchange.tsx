import { useState, useCallback, useRef } from "react";
import { Search, X, RotateCcw, Check, Package, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { logAction } from "@/services/ActionLogger";
import { ReturnReceipt } from "./ReturnReceipt";
import { FiscalReturnHandler } from "./FiscalReturnHandler";

interface SaleResult {
  id: string;
  total: number;
  created_at: string;
  status: string;
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

type SaleLookupRow = {
  id: string;
  total: number;
  created_at: string;
  status: string;
  items: unknown;
};

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

interface PDVReturnExchangeProps {
  open: boolean;
  onClose: () => void;
}

export function PDVReturnExchangeDialog({ open, onClose }: PDVReturnExchangeProps) {
  const { companyId } = useCompany();
  const [searchQuery, setSearchQuery] = useState("");
  const [foundSale, setFoundSale] = useState<SaleResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [processing, setProcessing] = useState(false);
  const [completedReturn, setCompletedReturn] = useState<{
    saleId: string;
    saleDate: string;
    originalTotal: number;
    refundAmount: number;
    items: Array<{ product_name: string; quantity: number; unit_price: number }>;
  } | null>(null);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !companyId) return;
    setSearching(true);
    setFoundSale(null);
    setSelectedItems({});
    try {
      const query = searchQuery.trim().toLowerCase();

      // Try exact UUID match first, then prefix search with limited fetch
      let sale: SaleLookupRow | null = null;

      // If query looks like a full UUID, fetch directly
      if (query.length >= 36) {
        const { data } = await supabase
          .from("sales")
          .select("id, total, created_at, status, items")
          .eq("company_id", companyId)
          .eq("id", query)
          .maybeSingle();
        sale = data;
      }

      // Otherwise use server-side text search with limited results
      if (!sale) {
        const { data: sales } = await supabase
          .from("sales")
          .select("id, total, created_at, status, items")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(50);

        sale = (sales || []).find(s => s.id.toLowerCase().startsWith(query));
      }

      if (!sale) {
        toast.warning("Venda não encontrada", { duration: 1500 });
        setSearching(false);
        return;
      }
      
      // Try sale_items table first, fallback to JSONB items column
      const { data: saleItems } = await supabase
        .from("sale_items")
        .select("id, product_id, product_name, quantity, unit_price, subtotal")
        .eq("sale_id", sale.id);

      let parsedItems = (saleItems || []) as SaleResult["items"];
      
      // Fallback: parse JSONB items from sales table
      if (parsedItems.length === 0 && sale.items) {
        const jsonItems = Array.isArray(sale.items)
          ? sale.items
          : typeof sale.items === "string"
            ? (JSON.parse(sale.items) as unknown[])
            : [];
        parsedItems = jsonItems.map((item, idx) => {
          const it = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
          const quantity = Number(it.quantity ?? 1);
          const unitPrice = Number(it.unit_price ?? it.price ?? 0);
          return {
            id: String(it.id ?? `json-${idx}`),
            product_id: String(it.product_id ?? ""),
            product_name: String(it.product_name ?? it.name ?? "Produto"),
            quantity,
            unit_price: unitPrice,
            subtotal: Number(it.subtotal ?? quantity * unitPrice),
          };
        });
      }

      setFoundSale({
        ...sale,
        items: parsedItems,
      });
    } catch (err: unknown) {
      toast.error(`Erro na busca: ${toErrorMessage(err)}`);
    }
    setSearching(false);
  }, [searchQuery, companyId]);

  const toggleItem = (itemId: string, maxQty: number) => {
    setSelectedItems(prev => {
      if (prev[itemId]) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: maxQty };
    });
  };

  const updateReturnQty = (itemId: string, qty: number) => {
    setSelectedItems(prev => ({ ...prev, [itemId]: Math.max(1, qty) }));
  };

  const totalRefund = foundSale?.items
    .filter(i => selectedItems[i.id])
    .reduce((sum, i) => sum + i.unit_price * (selectedItems[i.id] || 0), 0) || 0;

  const handleProcessReturn = async () => {
    if (!foundSale || !companyId || Object.keys(selectedItems).length === 0) return;
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Build items payload for atomic RPC
      const returnItems = foundSale.items
        .filter(item => selectedItems[item.id] && selectedItems[item.id] > 0)
        .map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: selectedItems[item.id],
        }));

      // Single atomic RPC call: status + stock + financial + audit
      const { data: result, error: rpcError } = await supabase.rpc("cancel_sale_atomic", {
        p_sale_id: foundSale.id,
        p_company_id: companyId,
        p_user_id: user?.id || null,
        p_items: returnItems,
        p_refund_amount: totalRefund,
        p_reason: "Devolução via PDV",
      });

      if (rpcError) throw new Error(rpcError.message);
      const rpcResult = result as { success: boolean; error?: string };
      if (!rpcResult.success) throw new Error(rpcResult.error || "Erro desconhecido");

      // Complementary frontend log with session metadata (browser, screen, platform)
      logAction({
        companyId,
        userId: user?.id || null,
        action: "sale_return_session_meta",
        module: "vendas",
        details: `Devolução PDV - Venda #${foundSale.id.substring(0, 8)} - Estorno ${formatCurrency(totalRefund)}`,
      });

      // Save completed return data for receipt
      const receiptItems = returnItems.map(ri => {
        const orig = foundSale.items.find(i => i.product_id === ri.product_id);
        return {
          product_name: ri.product_name,
          quantity: ri.quantity,
          unit_price: orig?.unit_price || 0,
        };
      });

      setCompletedReturn({
        saleId: foundSale.id,
        saleDate: foundSale.created_at,
        originalTotal: foundSale.total,
        refundAmount: totalRefund,
        items: receiptItems,
      });

      toast.success(`Devolução processada: ${formatCurrency(totalRefund)} devolvido`, { duration: 3000 });
    } catch (err: unknown) {
      toast.error(`Erro ao processar devolução: ${toErrorMessage(err)}`);
    }
    setProcessing(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-primary" /> Troca / Devolução
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <input
              data-no-barcode-capture="true"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") handleSearch(); }}
              placeholder="ID da venda (primeiros 8 caracteres)..."
              autoFocus
              className="flex-1 px-4 py-3 rounded-xl bg-muted border border-border text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button onClick={handleSearch} disabled={searching} className="px-4 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50">
              <Search className="w-4 h-4" />
            </button>
          </div>

          {/* Sale found */}
          {foundSale && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-mono">#{foundSale.id.substring(0, 8)}</span>
                <span className="text-muted-foreground">{new Date(foundSale.created_at).toLocaleDateString("pt-BR")}</span>
                <span className="font-bold text-foreground font-mono">{formatCurrency(foundSale.total)}</span>
              </div>

              <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                {foundSale.items.map(item => {
                  const isSelected = !!selectedItems[item.id];
                  return (
                    <div key={item.id}
                      onClick={() => toggleItem(item.id, item.quantity)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-muted/30 hover:bg-muted/60"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity}x {formatCurrency(item.unit_price)}
                        </p>
                      </div>
                      {isSelected && (
                        <input
                          data-no-barcode-capture="true"
                          type="number"
                          min={1}
                          max={item.quantity}
                          value={selectedItems[item.id] || 1}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateReturnQty(item.id, parseInt(e.target.value) || 1)}
                          onKeyDown={e => e.stopPropagation()}
                          className="w-14 px-2 py-1 rounded-lg bg-background border border-primary text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      )}
                      <span className="text-sm font-bold text-primary font-mono whitespace-nowrap">
                        {formatCurrency(item.subtotal)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {Object.keys(selectedItems).length > 0 && (
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-bold">Valor da Devolução</p>
                    <p className="text-2xl font-black text-destructive font-mono">{formatCurrency(totalRefund)}</p>
                  </div>
                  <button
                    onClick={handleProcessReturn}
                    disabled={processing}
                    className="px-6 py-3 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm disabled:opacity-50 flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {processing ? "Processando..." : "Processar Devolução"}
                  </button>
                </div>
              )}

              {completedReturn && (
                <div className="space-y-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-primary uppercase font-bold">✓ Devolução Concluída</p>
                      <p className="text-lg font-bold text-foreground font-mono">{formatCurrency(completedReturn.refundAmount)}</p>
                    </div>
                    <div className="flex gap-2">
                      <ReturnReceipt
                        saleId={completedReturn.saleId}
                        saleDate={completedReturn.saleDate}
                        originalTotal={completedReturn.originalTotal}
                        refundAmount={completedReturn.refundAmount}
                        items={completedReturn.items}
                        onClose={onClose}
                      />
                      <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>

                  {/* Fiscal handling: cancel NFC-e or warn about NF-e de Devolução */}
                  {companyId && (
                    <FiscalReturnHandler
                      saleId={completedReturn.saleId}
                      companyId={companyId}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {!foundSale && !searching && (
            <div className="flex flex-col items-center py-8 gap-2">
              <Package className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Busque uma venda pelo número</p>
            </div>
          )}

          {searching && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
