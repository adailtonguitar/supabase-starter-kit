/**
 * ContingencyService — manages offline NFC-e contingency.
 * Handles local numbering, contingency payload generation, and post-sync reconciliation.
 */

const DB_NAME = "pdv_sync_v2";
const DB_VERSION = 1;
const STORE_CACHE = "entity_cache";

const CONTINGENCY_NUM_KEY = "contingency:next_number";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Get next contingency number for a given serie, then increment */
export async function getNextContingencyNumber(serie: number = 1): Promise<number> {
  const db = await openDB();
  const key = `${CONTINGENCY_NUM_KEY}:${serie}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readwrite");
    const store = tx.objectStore(STORE_CACHE);
    const getReq = store.get(key);

    getReq.onsuccess = () => {
      const current = getReq.result?.data as number || 900001; // start at 900001 to avoid collisions
      const next = current + 1;
      store.put({
        key,
        entity_type: "contingency_config",
        data: next,
        cached_at: new Date().toISOString(),
      });
      resolve(current);
    };

    tx.onerror = () => reject(tx.error);
  });
}

/** Initialize contingency numbering from server's next_number */
export async function initContingencyNumber(serie: number, serverNextNumber: number): Promise<void> {
  const db = await openDB();
  const key = `${CONTINGENCY_NUM_KEY}:${serie}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readwrite");
    const store = tx.objectStore(STORE_CACHE);
    const getReq = store.get(key);

    getReq.onsuccess = () => {
      // Only set if not already initialized (don't overwrite higher numbers)
      if (!getReq.result) {
        store.put({
          key,
          entity_type: "contingency_config",
          data: Math.max(serverNextNumber, 900001),
          cached_at: new Date().toISOString(),
        });
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface ContingencyPayload {
  sale_id: string;
  company_id: string;
  config_id: string;
  contingency_number: number;
  serie: number;
  tp_emis: 9;
  created_at: string;
  form: {
    customer_name?: string;
    customer_doc?: string;
    nat_op: string;
    inf_adic?: string;
    payment_method: string;
    payment_value: number;
    change: number;
    items: Array<{
      name: string;
      ncm: string;
      cfop: string;
      cst: string;
      unit: string;
      qty: number;
      unit_price: number;
      discount: number;
      pis_cst: string;
      cofins_cst: string;
      icms_aliquota?: number;
    }>;
  };
}

/** Build a contingency payload ready to be enqueued in sync-queue */
export async function buildContingencyPayload(params: {
  saleId: string;
  companyId: string;
  configId: string;
  serie: number;
  form: ContingencyPayload["form"];
}): Promise<ContingencyPayload> {
  const number = await getNextContingencyNumber(params.serie);

  return {
    sale_id: params.saleId,
    company_id: params.companyId,
    config_id: params.configId,
    contingency_number: number,
    serie: params.serie,
    tp_emis: 9,
    created_at: new Date().toISOString(),
    form: params.form,
  };
}
