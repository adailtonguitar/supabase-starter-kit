/**
 * Robust offline sync queue with retry, priority, conflict detection, and generic entity support.
 */
import type { SyncQueueItem } from "@/services/types";

const DB_NAME = "pdv_sync_v2";
const DB_VERSION = 1;
const STORE_QUEUE = "sync_queue";
const STORE_CACHE = "entity_cache";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const store = db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
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

export async function enqueue(item: Omit<SyncQueueItem, "id" | "created_at" | "retry_count" | "status">): Promise<string> {
  const db = await openDB();
  const id = crypto.randomUUID();
  const entry: SyncQueueItem = {
    ...item,
    id,
    status: "pending",
    retry_count: 0,
    created_at: new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readwrite");
    tx.objectStore(STORE_QUEUE).put(entry);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPending(): Promise<SyncQueueItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readonly");
    const index = tx.objectStore(STORE_QUEUE).index("status");
    const request = index.getAll(IDBKeyRange.only("pending"));
    request.onsuccess = () => {
      const items = request.result as SyncQueueItem[];
      items.sort((a, b) => a.priority - b.priority);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function updateStatus(
  id: string,
  status: SyncQueueItem["status"],
  error?: string
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readwrite");
    const store = tx.objectStore(STORE_QUEUE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      if (getReq.result) {
        const item = getReq.result as SyncQueueItem;
        item.status = status;
        item.last_attempt_at = new Date().toISOString();
        if (error) item.error = error;
        if (status === "pending") item.retry_count++;
        store.put(item);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function handleFailure(id: string, error: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readwrite");
    const store = tx.objectStore(STORE_QUEUE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      if (getReq.result) {
        const item = getReq.result as SyncQueueItem;
        item.last_attempt_at = new Date().toISOString();
        item.retry_count++;
        item.error = error;
        item.status = item.retry_count >= item.max_retries ? "failed" : "pending";
        store.put(item);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueueStats(): Promise<Record<SyncQueueItem["status"], number>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readonly");
    const store = tx.objectStore(STORE_QUEUE);
    const request = store.getAll();
    request.onsuccess = () => {
      const items = request.result as SyncQueueItem[];
      const stats = { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0 };
      for (const item of items) {
        stats[item.status] = (stats[item.status] || 0) + 1;
      }
      resolve(stats);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function cleanup(olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
  const db = await openDB();
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readwrite");
    const store = tx.objectStore(STORE_QUEUE);
    const request = store.getAll();
    let deleted = 0;
    request.onsuccess = () => {
      for (const item of request.result as SyncQueueItem[]) {
        if ((item.status === "synced" || item.status === "failed") && item.created_at < cutoff) {
          store.delete(item.id);
          deleted++;
        }
      }
    };
    tx.oncomplete = () => resolve(deleted);
    tx.onerror = () => reject(tx.error);
  });
}

// ===== ENTITY CACHE =====

interface CachedEntity {
  key: string;
  entity_type: string;
  data: unknown;
  cached_at: string;
}

export async function cacheEntity(entityType: string, key: string, data: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readwrite");
    tx.objectStore(STORE_CACHE).put({
      key: `${entityType}:${key}`,
      entity_type: entityType,
      data,
      cached_at: new Date().toISOString(),
    } as CachedEntity);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cacheEntities(entityType: string, items: Array<{ id: string } & Record<string, unknown>>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readwrite");
    const store = tx.objectStore(STORE_CACHE);
    for (const item of items) {
      store.put({
        key: `${entityType}:${item.id}`,
        entity_type: entityType,
        data: item,
        cached_at: new Date().toISOString(),
      } as CachedEntity);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedEntities<T = unknown>(entityType: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readonly");
    const index = tx.objectStore(STORE_CACHE).index("entity_type");
    const request = index.getAll(IDBKeyRange.only(entityType));
    request.onsuccess = () => {
      resolve((request.result as CachedEntity[]).map((e) => e.data as T));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearEntityCache(entityType?: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readwrite");
    const store = tx.objectStore(STORE_CACHE);
    if (!entityType) {
      store.clear();
    } else {
      const index = store.index("entity_type");
      const request = index.openCursor(IDBKeyRange.only(entityType));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
