/**
 * useSync — robust offline sync hook.
 * Orchestrates the sync queue with retry, conflict resolution, and status reporting.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  enqueue,
  getPending,
  updateStatus,
  handleFailure,
  getQueueStats,
  cleanup,
  resetFailed,
  getFailedItems,
} from "@/lib/sync-queue";
import { supabase, safeRpc } from "@/integrations/supabase/client";
import type {
  SyncQueueItem,
  FinalizeSaleItemInput,
  FinalizeSalePaymentInput,
  StockMovementInput,
  PaymentResult,
} from "@/services/types";
import { toast } from "sonner";
import { fiscalCircuitBreaker, CircuitBreakerOpenError } from "@/lib/circuit-breaker";

const SYNC_INTERVAL_MS = 15_000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

type SyncProcessor = (item: SyncQueueItem) => Promise<void>;

type RpcFinalizeSaleResult = {
  success?: boolean;
  error?: string;
  sale_id?: string;
  message?: string;
};

const parseString = (v: unknown): string | null => (typeof v === "string" ? v : null);
const parseFiniteNumber = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const PAYMENT_METHODS: PaymentResult["method"][] = [
  "dinheiro",
  "debito",
  "credito",
  "pix",
  "voucher",
  "outros",
  "prazo",
];

const normalizePaymentMethod = (v: unknown): PaymentResult["method"] => {
  const s = parseString(v);
  if (!s) return "outros";
  const normalized = s.trim().toLowerCase();
  return PAYMENT_METHODS.includes(normalized as PaymentResult["method"]) ? (normalized as PaymentResult["method"]) : "outros";
};

const parseFinalizeSaleItems = (items: unknown): FinalizeSaleItemInput[] => {
  if (!Array.isArray(items)) return [];
  const parsed: FinalizeSaleItemInput[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const obj = it as Record<string, unknown>;
    const product_id = parseString(obj.product_id);
    const product_name = parseString(obj.product_name);
    const quantity = parseFiniteNumber(obj.quantity);
    const unit_price = parseFiniteNumber(obj.unit_price);
    const discount_percent = parseFiniteNumber(obj.discount_percent) ?? 0;
    const subtotal = parseFiniteNumber(obj.subtotal);

    if (!product_id || !product_name) continue;
    if (quantity === null || unit_price === null || subtotal === null) continue;
    if (!Number.isFinite(quantity) || !Number.isFinite(unit_price) || !Number.isFinite(subtotal)) continue;

    parsed.push({ product_id, product_name, quantity, unit_price, discount_percent, subtotal });
  }
  return parsed;
};

const parseFinalizeSalePayments = (payments: unknown, fallbackAmount: number): FinalizeSalePaymentInput[] => {
  if (!Array.isArray(payments)) return [];
  const parsed: FinalizeSalePaymentInput[] = [];
  for (const p of payments) {
    if (!p || typeof p !== "object") continue;
    const obj = p as Record<string, unknown>;
    const method = normalizePaymentMethod(obj.method);
    const amount = parseFiniteNumber(obj.amount);
    const approvedRaw = obj.approved;
    const approved = typeof approvedRaw === "boolean" ? approvedRaw : true;
    if (amount === null) continue;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    parsed.push({ method, amount, approved });
  }
  // If queue payload had payments but they were empty/invalid, keep a safe fallback.
  return parsed.length > 0 ? parsed : [{ method: "outros", amount: fallbackAmount, approved: true }];
};

const getSessionIdForRpc = (raw: unknown): string | null => {
  const s = parseString(raw);
  if (!s) return null;
  return s.startsWith("offline_") ? null : s;
};

const processors: Record<string, SyncProcessor> = {
  sale: async (item) => {
    const p = item.payload;

    // Use the atomic RPC — same as online PDV flow
    const companyId = parseString(p.company_id);
    if (!companyId) throw new Error("Payload inválido: company_id ausente");

    const terminalId = parseString(p.terminal_id) ?? "OFFLINE";
    const sessionId = getSessionIdForRpc(p.session_id);

    const total = parseFiniteNumber(p.total);
    if (total === null) throw new Error("Payload inválido: total ausente");

    const items = parseFinalizeSaleItems(p.items);
    if (items.length === 0) throw new Error("Payload inválido: itens ausentes/invalidos");

    const subtotal = parseFiniteNumber(p.subtotal) ?? total;
    const discountPct = parseFiniteNumber(p.discount_pct) ?? 0;
    const discountVal = parseFiniteNumber(p.discount_val) ?? 0;

    const payments = parseFinalizeSalePayments(p.payments, total);
    const soldBy = parseString(p.user_id);

    const rpcFinalize = await safeRpc<RpcFinalizeSaleResult>("finalize_sale_atomic", {
      p_company_id: companyId,
      p_terminal_id: terminalId,
      p_session_id: sessionId,
      p_items: items,
      p_subtotal: subtotal,
      p_discount_pct: discountPct,
      p_discount_val: discountVal,
      p_total: total,
      p_payments: payments,
      p_sold_by: soldBy ?? null,
    });
    if (!rpcFinalize.success) throw new Error((rpcFinalize as any).error);
    const result = rpcFinalize.data ?? null;
    if (result && result.success === false) {
      throw new Error(result.error || "Erro ao sincronizar venda");
    }
  },
  stock_movement: async (item) => {
    const p = item.payload;
    const companyId = parseString(p.company_id);
    const productId = parseString(p.product_id);
    const typeRaw = parseString(p.type);
    const quantity = parseFiniteNumber(p.quantity);
    const previousStock = parseFiniteNumber(p.previous_stock);
    const newStock = parseFiniteNumber(p.new_stock);
    const performedBy = parseString(p.performed_by);
    const reason = parseString(p.reason);

    if (!companyId || !productId || !typeRaw || quantity === null || previousStock === null || newStock === null || !performedBy) {
      throw new Error("Payload inválido: stock_movement incompleto");
    }

    const allowedTypes: StockMovementInput["type"][] = ["entrada", "saida", "ajuste", "venda", "devolucao"];
    if (!allowedTypes.includes(typeRaw as StockMovementInput["type"])) {
      throw new Error(`Payload inválido: tipo stock_movement desconhecido (${typeRaw})`);
    }
    const movementType = typeRaw as StockMovementInput["type"];

    const { error } = await supabase.from("stock_movements").insert({
      company_id: companyId,
      product_id: productId,
      type: movementType,
      quantity,
      previous_stock: previousStock,
      new_stock: newStock,
      performed_by: performedBy,
      reason: reason ?? undefined,
    });
    if (error) throw new Error(error.message);
  },
  cash_movement: async (item) => {
    const p = item.payload;
    const companyId = parseString(p.company_id);
    const sessionId = getSessionIdForRpc(p.session_id);
    const type = parseString(p.type);
    const amount = parseFiniteNumber(p.amount);
    const performedBy = parseString(p.performed_by);
    const description = parseString(p.description);

    if (!companyId || !type || amount === null || !performedBy || !description) {
      throw new Error("Payload inválido: cash_movement incompleto");
    }

    const { error } = await supabase.from("cash_movements").insert({
      company_id: companyId,
      session_id: sessionId,
      type,
      amount,
      performed_by: performedBy,
      description,
    });
    if (error) throw new Error(error.message);
  },
  fiscal_contingency: async (item) => {
    // Transmit contingency NFC-e to SEFAZ via edge function
    const p = item.payload;
    const saleId = parseString(p.sale_id);
    const companyId = parseString(p.company_id);
    const configId = parseString(p.config_id);
    const contingencyNumber = parseFiniteNumber(p.contingency_number);
    const serie = parseFiniteNumber(p.serie);

    if (!saleId || !companyId || !configId || contingencyNumber === null || serie === null) {
      throw new Error("Payload inválido: fiscal_contingency incompleto");
    }

    try {
      const { data, error } = await fiscalCircuitBreaker.call(() =>
        supabase.functions.invoke("emit-nfce", {
          body: {
            action: "emit_contingency",
            sale_id: saleId,
            company_id: companyId,
            config_id: configId,
            contingency_number: contingencyNumber,
            serie,
            form: p.form,
          },
        })
      );
      if (error) {
        // Non-retryable: missing fiscal config or credentials
        const msg = error.message || "";
        if (msg.includes("non-2xx") || msg.includes("404") || msg.includes("não encontrada") || msg.includes("não configurad")) {
          console.warn("[Sync] Fiscal contingency skipped (no fiscal config):", msg);
          return; // Mark as synced — venda já foi salva, fiscal é opcional
        }
        throw new Error(msg);
      }
      if (data && !data.success) {
        const errMsg = data.error || "Erro ao transmitir NFC-e de contingência";
        // Skip non-retryable fiscal errors
        if (errMsg.includes("não encontrada") || errMsg.includes("não configurad") || errMsg.includes("Credenciais")) {
          console.warn("[Sync] Fiscal contingency skipped:", errMsg);
          return;
        }
        throw new Error(errMsg);
      }
    } catch (err: unknown) {
      // Circuit breaker open or network error → rethrow for retry later
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof CircuitBreakerOpenError || msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("TypeError") || msg.includes("Timeout")) {
        throw err;
      }
      console.warn("[Sync] Fiscal contingency failed permanently, skipping:", msg);
      // Don't rethrow — mark as synced since the sale itself was already synced
    }
  },
};

export function useSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [stats, setStats] = useState({ pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0 });
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const [failedErrors, setFailedErrors] = useState<Array<{ type: string; error: string }>>([]);

  const refreshStats = useCallback(async () => {
    const s = await getQueueStats();
    setStats(s);
    if (s.failed > 0) {
      try {
        const items = await getFailedItems();
        setFailedErrors(items.map(i => ({ type: i.entity_type, error: i.error || "Erro desconhecido" })));
      } catch { setFailedErrors([]); }
    } else {
      setFailedErrors([]);
    }
  }, []);

  const syncAll = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);

    // Reset failed items so they can be retried
    try { await resetFailed(); } catch {}

    try {
      const pending = await getPending();
      let synced = 0;

      for (const item of pending) {
        const processor = processors[item.entity_type];
        if (!processor) {
          await updateStatus(item.id, "failed", `No processor for entity type: ${item.entity_type}`);
          continue;
        }

        try {
          await updateStatus(item.id, "syncing");
          await processor(item);
          await updateStatus(item.id, "synced");
          synced++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          const isConflict = msg.includes("duplicate") || msg.includes("conflict");
          if (isConflict) {
            await updateStatus(item.id, "conflict", msg);
          } else {
            await handleFailure(item.id, msg || "Unknown error");
          }
        }
      }

      if (synced > 0) {
        toast.success(`${synced} operação(ões) sincronizada(s)`);
      }

      await refreshStats();
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [refreshStats]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Conexão restaurada! Sincronizando...");
      syncAll();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("Sem conexão. Operações serão enfileiradas.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Defer initial stats refresh to avoid "Should have a queue" React bug
    const timer = setTimeout(() => refreshStats(), 0);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(async () => {
      const s = await getQueueStats();
      setStats(s);
      if (s.pending > 0) syncAll();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isOnline, syncAll]);

  useEffect(() => {
    const interval = setInterval(() => cleanup(), CLEANUP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const queueOperation = useCallback(
    async (
      entityType: SyncQueueItem["entity_type"],
      payload: Record<string, unknown>,
      priority = 5,
      maxRetries = 3
    ) => {
      const id = await enqueue({ entity_type: entityType, payload, priority, max_retries: maxRetries });
      await refreshStats();
      if (navigator.onLine) syncAll();
      return id;
    },
    [refreshStats, syncAll]
  );

  return {
    isOnline,
    stats,
    syncing,
    syncAll,
    queueOperation,
    refreshStats,
    pendingCount: stats.pending + stats.failed,
    failedErrors,
  };
}
