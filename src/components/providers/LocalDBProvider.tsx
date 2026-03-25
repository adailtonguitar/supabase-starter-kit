/**
 * LocalDBProvider — Initializes IndexedDB caches and keeps them in sync.
 * Downloads products and clients into IndexedDB for offline access.
 */
import { useEffect, useRef, ReactNode } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cacheSet, REFRESH_INTERVAL_MS } from "@/lib/offline-cache";

async function syncProducts(companyId: string) {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    if (data) {
      await cacheSet("products", companyId, data);
      // console.log(`[LocalDB] Cached ${data.length} products`);
    }
  } catch (err) {
    console.warn("[LocalDB] Failed to sync products:", err);
  }
}

async function syncClients(companyId: string) {
  try {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    if (data) {
      await cacheSet("clients", companyId, data);
      // console.log(`[LocalDB] Cached ${data.length} clients`);
    }
  } catch (err) {
    console.warn("[LocalDB] Failed to sync clients:", err);
  }
}

export function LocalDBProvider({ children }: { children: ReactNode }) {
  const { companyId } = useCompany();
  const { user, session } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    // Require a real session (not just cached user) to avoid 401s
    if (!companyId || !user || !session) return;

    // Initial sync
    const doSync = () => {
      if (!navigator.onLine) return;
      syncProducts(companyId);
      syncClients(companyId);
    };

    doSync();

    // Background refresh
    intervalRef.current = setInterval(doSync, REFRESH_INTERVAL_MS);

    // Also sync when coming back online
    const onOnline = () => {
      // console.log("[LocalDB] Back online — refreshing cache");
      doSync();
    };
    window.addEventListener("online", onOnline);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("online", onOnline);
    };
  }, [companyId, user, session]);

  return <>{children}</>;
}
