import { useState, useEffect, useCallback } from "react";

export function useSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const syncAll = useCallback(async () => {
    // Sync queue removed. All operations now direct to Supabase.
  }, []);

  const queueOperation = useCallback(
    async (entityType: string, payload: any) => {
      console.warn(`[useSync] queueOperation called for ${entityType}, but sync queue is disabled. Payload:`, payload);
      throw new Error("Sincronização offline desativada. Use apenas modo online.");
    },
    []
  );

  return {
    isOnline,
    stats: { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0 },
    syncing: false,
    syncAll,
    queueOperation,
    refreshStats: async () => {},
    pendingCount: 0,
    failedErrors: [],
  };
}
