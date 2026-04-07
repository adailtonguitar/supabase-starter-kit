/**
 * Fiscal Rules Cache — Cache de regras tributárias com TTL
 * 
 * Armazena regras ST, PIS/COFINS e ICMS em memória
 * com invalidação automática por TTL (24h padrão).
 */

// ─── Tipos ───

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  key: string;
}

export interface CacheConfig {
  ttlMs: number;             // TTL em milissegundos (padrão: 24h)
  maxEntries: number;        // Máximo de entradas no cache
}

// ─── Cache genérico ───

export class FiscalRulesCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private config: CacheConfig;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      ttlMs: config?.ttlMs ?? 24 * 60 * 60 * 1000, // 24h
      maxEntries: config?.maxEntries ?? 1000,
    };
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Verificar TTL
    if (Date.now() - entry.cachedAt > this.config.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    // Eviction se exceder limite
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      cachedAt: Date.now(),
      key,
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Invalida entradas que contenham o prefixo na chave
   */
  invalidateByPrefix(prefix: string): void {
    for (const [key] of this.cache) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  get size(): number {
    return this.cache.size;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.cachedAt < oldestTime) {
        oldestTime = entry.cachedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

// ─── Caches pré-configurados (singletons) ───

export interface STRuleCached {
  ncm: string;
  cest?: string;
  uf: string;
  mva: number;
  aliquota: number;
  reducaoBC: number;
  dataInicio?: string;
  dataFim?: string;
}

export interface PisCofinsRuleCached {
  ncm: string;
  mode: "normal" | "monofasico" | "isento" | "st" | "aliquota_zero";
  cstPis: string;
  cstCofins: string;
  aliqPis: number;
  aliqCofins: number;
}

// Cache keys builders
export function buildSTCacheKey(ncm: string, uf: string): string {
  return `st:${ncm}:${uf}`;
}

export function buildPisCofinsKey(ncm: string, crt: number): string {
  return `piscofins:${ncm}:${crt}`;
}

export function buildCompanyRulesKey(companyId: string): string {
  return `company_rules:${companyId}`;
}

// Singletons
let stCache: FiscalRulesCache<STRuleCached> | null = null;
let pisCofinsCache: FiscalRulesCache<PisCofinsRuleCached> | null = null;

export function getSTCache(): FiscalRulesCache<STRuleCached> {
  if (!stCache) {
    stCache = new FiscalRulesCache<STRuleCached>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 5000 });
  }
  return stCache;
}

export function getPisCofinsCache(): FiscalRulesCache<PisCofinsRuleCached> {
  if (!pisCofinsCache) {
    pisCofinsCache = new FiscalRulesCache<PisCofinsRuleCached>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 5000 });
  }
  return pisCofinsCache;
}
