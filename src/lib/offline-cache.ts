/**
 * OfflineCache — IndexedDB cache layer for offline-first data access.
 * Uses the same DB as sync-queue (pdv_sync_v2) with the entity_cache store.
 */

const DB_NAME = "pdv_sync_v2";
const DB_VERSION = 1;
const STORE_CACHE = "entity_cache";

// Cache TTL: 30 minutes for products/clients
const CACHE_TTL_MS = 30 * 60 * 1000;
// Background refresh interval: 5 minutes (was 2)
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sync_queue")) {
        const store = db.createObjectStore("sync_queue", { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("priority", "priority", { unique: false });
        store.createIndex("entity_type", "entity_type", { unique: false });
        store.createIndex("status_priority", ["status", "priority"], { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        const cache = db.createObjectStore(STORE_CACHE, { keyPath: "key" });
        cache.createIndex("entity_type", "entity_type", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface CacheEntry<T = unknown> {
  key: string;
  entity_type: string;
  data: T;
  cached_at: string;
}

/** Save an array of items under a cache key */
export async function cacheSet<T>(entityType: string, companyId: string, data: T): Promise<void> {
  try {
    const db = await openDB();
    const key = `${entityType}:${companyId}`;
    const entry: CacheEntry<T> = {
      key,
      entity_type: entityType,
      data,
      cached_at: new Date().toISOString(),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, "readwrite");
      tx.objectStore(STORE_CACHE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[OfflineCache] cacheSet error:", err);
  }
}

/** Get cached data for a given entity type and company */
export async function cacheGet<T>(entityType: string, companyId: string): Promise<{ data: T; stale: boolean } | null> {
  try {
    const db = await openDB();
    const key = `${entityType}:${companyId}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, "readonly");
      const req = tx.objectStore(STORE_CACHE).get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry<T> | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        const age = Date.now() - new Date(entry.cached_at).getTime();
        resolve({ data: entry.data, stale: age > CACHE_TTL_MS });
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[OfflineCache] cacheGet error:", err);
    return null;
  }
}

/** Clear cache for a specific entity type and company */
export async function cacheClear(entityType: string, companyId: string): Promise<void> {
  try {
    const db = await openDB();
    const key = `${entityType}:${companyId}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, "readwrite");
      tx.objectStore(STORE_CACHE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[OfflineCache] cacheClear error:", err);
  }
}

/** Get cache stats */
export async function getCacheStats(): Promise<{ totalEntries: number; entities: string[] }> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, "readonly");
      const index = tx.objectStore(STORE_CACHE).index("entity_type");
      const req = index.getAll();
      req.onsuccess = () => {
        const entries = req.result as CacheEntry[];
        const entities = [...new Set(entries.map(e => e.entity_type))];
        resolve({ totalEntries: entries.length, entities });
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return { totalEntries: 0, entities: [] };
  }
}
