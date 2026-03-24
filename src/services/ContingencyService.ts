/**
 * ContingencyService — manages offline NFC-e contingency.
 * Handles local numbering, contingency payload generation, XML signing, and post-sync reconciliation.
 */

import { signNfceXml, buildContingencyNfceXml, hasCertificateA1 } from "./LocalXmlSigner";

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
  signed_xml?: string;
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
  emitente?: { cnpj: string; name: string; ie: string; uf: string; crt: number };
  environment?: "homologacao" | "producao";
}): Promise<ContingencyPayload> {
  const number = await getNextContingencyNumber(params.serie);
  const now = new Date();

  const payload: ContingencyPayload = {
    sale_id: params.saleId,
    company_id: params.companyId,
    config_id: params.configId,
    contingency_number: number,
    serie: params.serie,
    tp_emis: 9,
    created_at: now.toISOString(),
    form: params.form,
  };

  // Try to sign XML locally if A1 certificate is available
  try {
    const hasCert = await hasCertificateA1(params.companyId);
    if (hasCert && params.emitente) {
      const totalValue = params.form.items.reduce(
        (sum, it) => sum + it.qty * it.unit_price - (it.discount || 0),
        0
      );

      // Generate a pseudo access key for the XML (44 digits)
      const ufCode = getUfCode(params.emitente.uf);
      const aamm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
      const cnpjClean = params.emitente.cnpj.replace(/\D/g, "");
      const mod = "65";
      const serieStr = String(params.serie).padStart(3, "0");
      const nNF = String(number).padStart(9, "0");
      const cNF = String(Math.floor(Math.random() * 99999999)).padStart(8, "0");
      const baseKey = `${ufCode}${aamm}${cnpjClean}${mod}${serieStr}${nNF}9${cNF}`;
      const cDV = calculateMod11(baseKey);
      const accessKey = `${baseKey}${cDV}`;

      const unsignedXml = buildContingencyNfceXml({
        accessKey,
        contingencyNumber: number,
        serie: params.serie,
        emitente: params.emitente,
        items: params.form.items.map((it) => ({
          name: it.name,
          ncm: it.ncm,
          cfop: it.cfop,
          qty: it.qty,
          unitPrice: it.unit_price,
          unit: it.unit,
        })),
        totalValue,
        paymentMethod: params.form.payment_method,
        paymentValue: params.form.payment_value,
        change: params.form.change,
        dhEmi: now.toISOString(),
        tpAmb: params.environment === "producao" ? 1 : 2,
      });

      payload.signed_xml = await signNfceXml(unsignedXml, params.companyId);
      // console.log("[Contingency] XML assinado localmente com sucesso");
    }
  } catch (err) {
    console.warn("[Contingency] Falha ao assinar XML localmente:", err);
    // Continue without signed XML — will be signed server-side on sync
  }

  return payload;
}

// ── Helpers for access key generation ──

function getUfCode(uf: string): string {
  const codes: Record<string, string> = {
    AC: "12", AL: "27", AM: "13", AP: "16", BA: "29", CE: "23", DF: "53", ES: "32",
    GO: "52", MA: "21", MG: "31", MS: "50", MT: "51", PA: "15", PB: "25", PE: "26",
    PI: "22", PR: "41", RJ: "33", RN: "24", RO: "11", RR: "14", RS: "43", SC: "42",
    SE: "28", SP: "35", TO: "17",
  };
  return codes[uf.toUpperCase()] || "35";
}

function calculateMod11(key: string): string {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9];
  let sum = 0;
  const digits = key.split("").reverse();
  for (let i = 0; i < digits.length; i++) {
    sum += parseInt(digits[i]) * weights[i % weights.length];
  }
  const remainder = sum % 11;
  const dv = remainder < 2 ? 0 : 11 - remainder;
  return String(dv);
}
