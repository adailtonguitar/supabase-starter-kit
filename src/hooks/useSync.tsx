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
import { supabase } from "@/integrations/supabase/client";
import type { SyncQueueItem } from "@/services/types";
import { toast } from "sonner";

const SYNC_INTERVAL_MS = 15_000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

type SyncProcessor = (item: SyncQueueItem) => Promise<void>;

const processors: Record<string, SyncProcessor> = {
  sale: async (item) => {
    const p = item.payload;

    // Use the atomic RPC — same as online PDV flow
    const { data: rpcResult, error: rpcError } = await supabase.rpc("finalize_sale_atomic", {
      p_company_id: p.company_id as string,
      p_terminal_id: p.terminal_id as string || "OFFLINE",
      p_session_id: typeof p.session_id === "string" && p.session_id.startsWith("offline_") ? null : (p.session_id as string || null),
      p_items: p.items as any,
      p_subtotal: p.subtotal as number || p.total as number,
      p_discount_pct: (p.discount_pct as number) || 0,
      p_discount_val: (p.discount_val as number) || 0,
      p_total: p.total as number,
      p_payments: p.payments as any || [{ method: p.payment_method || "dinheiro", amount: p.total, approved: true }],
      p_sold_by: (p.user_id as string) || null,
    });

    if (rpcError) throw new Error(rpcError.message);
    const result = rpcResult as any;
    if (result && !result.success) throw new Error(result.error || "Erro ao sincronizar venda");
  },
  stock_movement: async (item) => {
    const p = item.payload;
    const { error } = await supabase.from("stock_movements").insert({
      company_id: p.company_id as string,
      product_id: p.product_id as string,
      type: p.type as any,
      quantity: p.quantity as number,
      previous_stock: p.previous_stock as number,
      new_stock: p.new_stock as number,
      performed_by: p.performed_by as string,
      reason: p.reason as string,
    });
    if (error) throw new Error(error.message);
  },
  cash_movement: async (item) => {
    const p = item.payload;
    const { error } = await supabase.from("cash_movements").insert({
      company_id: p.company_id as string,
      session_id: typeof p.session_id === "string" && p.session_id.startsWith("offline_") ? null : (p.session_id as string),
      type: p.type as any,
      amount: p.amount as number,
      performed_by: p.performed_by as string,
      description: p.description as string,
    });
    if (error) throw new Error(error.message);
  },
  fiscal_contingency: async (item) => {
    // Transmit contingency NFC-e to SEFAZ via edge function
    const p = item.payload;
    const { data, error } = await supabase.functions.invoke("emit-nfce", {
      body: {
        action: "emit_contingency",
        sale_id: p.sale_id as string,
        company_id: p.company_id as string,
        config_id: p.config_id as string,
        contingency_number: p.contingency_number as number,
        serie: p.serie as number,
        form: p.form,
      },
    });
    if (error) throw new Error(error.message);
    if (data && !data.success) throw new Error(data.error || "Erro ao transmitir NFC-e de contingência");
    // Success — the edge function updates fiscal_documents and sales
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
        } catch (err: any) {
          const isConflict = err.message?.includes("duplicate") || err.message?.includes("conflict");
          if (isConflict) {
            await updateStatus(item.id, "conflict", err.message);
          } else {
            await handleFailure(item.id, err.message || "Unknown error");
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
    refreshStats();
    return () => {
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
  };
}
