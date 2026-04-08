/**
 * Integração IBPT — Consulta alíquotas tributárias por NCM/UF
 * 
 * Fonte: ibpt.valraw.com.br (API estática open source, sem token)
 * Fallback: cache local → regras internas hardcoded
 * 
 * Dados retornados: alíquotas federal (nacional/importado), estadual, municipal
 */

// ─── Tipos ───

export type DataSource = "IBPT" | "CACHE" | "LOCAL";
export type ConfidenceLevel = "alta" | "media" | "baixa";

export interface IBPTRule {
  ncm: string;
  descricao: string;
  nacional: number;       // alíquota federal nacional (%)
  importado: number;      // alíquota federal importados (%)
  estadual: number;       // alíquota estadual (%)
  municipal: number;      // alíquota municipal (%)
  fonte: DataSource;
  confianca: ConfidenceLevel;
  atualizadoEm: string;   // ISO date
  vigenciaInicio?: string;
  vigenciaFim?: string;
  versaoTabela?: string;
}

export interface IBPTFetchOptions {
  ano?: number;
  versao?: string;  // ex: "26.1.G"
  timeout?: number;
}

// ─── Cache em memória (singleton na edge function) ───

const IBPT_CACHE = new Map<string, { data: IBPTRule; cachedAt: number }>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function getCached(key: string): IBPTRule | null {
  const entry = IBPT_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    IBPT_CACHE.delete(key);
    return null;
  }
  return { ...entry.data, fonte: "CACHE" };
}

function setCache(key: string, data: IBPTRule): void {
  if (IBPT_CACHE.size > 10000) {
    // Evict oldest
    let oldest = Infinity;
    let oldestKey = "";
    for (const [k, v] of IBPT_CACHE) {
      if (v.cachedAt < oldest) { oldest = v.cachedAt; oldestKey = k; }
    }
    if (oldestKey) IBPT_CACHE.delete(oldestKey);
  }
  IBPT_CACHE.set(key, { data, cachedAt: Date.now() });
}

// ─── UF data cache (entire UF file) ───

const UF_DATA_CACHE = new Map<string, { dados: Record<string, any>; cachedAt: number }>();
const UF_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h para o arquivo inteiro

// ─── API Base ───

const API_BASE = "https://ibpt.valraw.com.br/api";

/**
 * Busca metadados para descobrir a versão mais recente da tabela
 */
async function getLatestVersion(ano?: number): Promise<{ ano: number; versao: string } | null> {
  const targetAno = ano || new Date().getFullYear();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${API_BASE}/${targetAno}/index.json`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!resp.ok) return null;
    const data = await resp.json();
    const versoes = data?.versoes || [];
    // Pegar a última versão com registros > 0
    const valid = versoes.filter((v: any) => v.registros > 0);
    if (valid.length === 0) return null;
    return { ano: targetAno, versao: valid[valid.length - 1].tabela };
  } catch {
    return null;
  }
}

/**
 * Busca todos os dados IBPT de uma UF para um ano/versão
 */
async function fetchUFData(uf: string, ano: number, versao: string, timeout = 10000): Promise<Record<string, any> | null> {
  const cacheKey = `${ano}:${versao}:${uf}`;
  const cached = UF_DATA_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < UF_CACHE_TTL_MS) {
    return cached.dados;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const url = `${API_BASE}/${ano}/${versao}/ncm/${uf.toUpperCase()}.json.gz`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept-Encoding": "gzip" },
    });
    clearTimeout(timeoutId);
    if (!resp.ok) return null;

    const json = await resp.json();
    const dados = json?.dados || [];

    // Index por NCM para busca O(1)
    const indexed: Record<string, any> = {};
    for (const item of dados) {
      indexed[item.codigo] = item;
    }

    UF_DATA_CACHE.set(cacheKey, { dados: indexed, cachedAt: Date.now() });
    return indexed;
  } catch {
    return null;
  }
}

// ─── Função Principal ───

/**
 * Busca regra IBPT para um NCM em uma UF específica.
 * Fluxo: Cache memória → API IBPT → Fallback local
 */
export async function getIBPTRule(
  ncm: string,
  uf: string,
  options?: IBPTFetchOptions,
): Promise<IBPTRule> {
  const cleanNcm = (ncm || "").replace(/\D/g, "").padEnd(8, "0");
  const cleanUF = (uf || "MA").toUpperCase().trim();
  const cacheKey = `ibpt:${cleanNcm}:${cleanUF}`;

  // 1. Cache
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // 2. API IBPT
  try {
    const versionInfo = options?.versao
      ? { ano: options.ano || new Date().getFullYear(), versao: options.versao }
      : await getLatestVersion(options?.ano);

    if (versionInfo) {
      const ufData = await fetchUFData(cleanUF, versionInfo.ano, versionInfo.versao, options?.timeout || 10000);
      if (ufData && ufData[cleanNcm]) {
        const item = ufData[cleanNcm];
        const rule: IBPTRule = {
          ncm: cleanNcm,
          descricao: item.descricao || "",
          nacional: item.aliquotaNacionalFederal || 0,
          importado: item.aliquotaImportadosFederal || 0,
          estadual: item.aliquotaEstadual || 0,
          municipal: item.aliquotaMunicipal || 0,
          fonte: "IBPT",
          confianca: "alta",
          atualizadoEm: new Date().toISOString(),
          vigenciaInicio: item.vigenciaInicio,
          vigenciaFim: item.vigenciaFim,
          versaoTabela: versionInfo.versao,
        };
        setCache(cacheKey, rule);
        return rule;
      }
    }
  } catch (err) {
    // Log error but continue to fallback
    console.warn(`[IBPT] Falha ao buscar NCM ${cleanNcm} UF ${cleanUF}:`, err);
  }

  // 3. Fallback: expired cache (stale data is better than no data)
  const staleEntry = IBPT_CACHE.get(cacheKey);
  if (staleEntry) {
    return { ...staleEntry.data, fonte: "CACHE", confianca: "media" };
  }

  // 4. Fallback local (regra genérica)
  return {
    ncm: cleanNcm,
    descricao: "NCM sem dados IBPT — fallback local",
    nacional: 15.0,
    importado: 18.0,
    estadual: 18.0,
    municipal: 0,
    fonte: "LOCAL",
    confianca: "baixa",
    atualizadoEm: new Date().toISOString(),
  };
}

/**
 * Busca múltiplos NCMs de uma vez (otimizado — carrega UF inteira uma vez)
 */
export async function getIBPTRulesBatch(
  ncms: string[],
  uf: string,
  options?: IBPTFetchOptions,
): Promise<Map<string, IBPTRule>> {
  const results = new Map<string, IBPTRule>();
  const cleanUF = (uf || "MA").toUpperCase().trim();

  // Try to load all UF data at once
  const versionInfo = options?.versao
    ? { ano: options.ano || new Date().getFullYear(), versao: options.versao }
    : await getLatestVersion(options?.ano);

  let ufData: Record<string, any> | null = null;
  if (versionInfo) {
    ufData = await fetchUFData(cleanUF, versionInfo.ano, versionInfo.versao);
  }

  for (const ncm of ncms) {
    const cleanNcm = (ncm || "").replace(/\D/g, "").padEnd(8, "0");
    const cacheKey = `ibpt:${cleanNcm}:${cleanUF}`;

    // Cache first
    const cached = getCached(cacheKey);
    if (cached) {
      results.set(cleanNcm, cached);
      continue;
    }

    // From loaded UF data
    if (ufData && ufData[cleanNcm]) {
      const item = ufData[cleanNcm];
      const rule: IBPTRule = {
        ncm: cleanNcm,
        descricao: item.descricao || "",
        nacional: item.aliquotaNacionalFederal || 0,
        importado: item.aliquotaImportadosFederal || 0,
        estadual: item.aliquotaEstadual || 0,
        municipal: item.aliquotaMunicipal || 0,
        fonte: "IBPT",
        confianca: "alta",
        atualizadoEm: new Date().toISOString(),
        vigenciaInicio: item.vigenciaInicio,
        vigenciaFim: item.vigenciaFim,
        versaoTabela: versionInfo?.versao,
      };
      setCache(cacheKey, rule);
      results.set(cleanNcm, rule);
    } else {
      // Individual fallback
      results.set(cleanNcm, {
        ncm: cleanNcm,
        descricao: "NCM sem dados IBPT",
        nacional: 15.0, importado: 18.0, estadual: 18.0, municipal: 0,
        fonte: "LOCAL", confianca: "baixa",
        atualizadoEm: new Date().toISOString(),
      });
    }
  }

  return results;
}

// ─── Cache stats (para diagnóstico) ───

export function getIBPTCacheStats(): { size: number; ufCacheSize: number } {
  return {
    size: IBPT_CACHE.size,
    ufCacheSize: UF_DATA_CACHE.size,
  };
}

export function clearIBPTCache(): void {
  IBPT_CACHE.clear();
  UF_DATA_CACHE.clear();
}
