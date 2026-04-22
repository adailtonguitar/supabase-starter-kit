import { ReactNode } from "react";

/**
 * LocalDBProvider — Formerly used for IndexedDB caches.
 * Caching has been disabled to ensure Supabase is the single source of truth.
 */
export function LocalDBProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
