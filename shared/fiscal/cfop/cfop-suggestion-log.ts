/**
 * cfop-suggestion-log — Telemetria local de sugestões de CFOP.
 *
 * Persistido em localStorage (sem migration, sem RPC).
 * Usado para calcular `taxa_aceitacao` que habilita auto-aplicação segura.
 *
 * NÃO interfere em emissão. NÃO bloqueia. NÃO modifica produto.
 */

export interface CfopSuggestionLogEntry {
  product_id: string;
  user_id: string | null;
  company_id: string;
  cfop_sugerido: string;
  cfop_original: string | null;
  foi_aplicado: boolean;
  /** Atualizado posteriormente se o usuário alterar o CFOP após aplicação automática. */
  usuario_alterou_depois: boolean;
  timestamp: string;
}

const KEY_PREFIX = "cfop_suggestion_log::";
const MAX_ENTRIES = 500;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function key(companyId: string): string {
  return KEY_PREFIX + companyId;
}

export function readLog(companyId: string): CfopSuggestionLogEntry[] {
  if (!companyId || !isBrowser()) return [];
  try {
    const raw = localStorage.getItem(key(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendLog(entry: Omit<CfopSuggestionLogEntry, "timestamp">): void {
  if (!entry?.company_id || !isBrowser()) return;
  try {
    const list = readLog(entry.company_id);
    list.push({ ...entry, timestamp: new Date().toISOString() });
    // mantém apenas as últimas N entradas
    const trimmed = list.length > MAX_ENTRIES ? list.slice(-MAX_ENTRIES) : list;
    localStorage.setItem(key(entry.company_id), JSON.stringify(trimmed));
  } catch {
    /* noop */
  }
}

/**
 * Marca, retroativamente, que o usuário alterou o CFOP de um produto após sugestão.
 * Atualiza apenas a entrada mais recente daquele produto.
 */
export function markUserOverride(companyId: string, productId: string): void {
  if (!companyId || !productId || !isBrowser()) return;
  try {
    const list = readLog(companyId);
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].product_id === productId) {
        list[i].usuario_alterou_depois = true;
        break;
      }
    }
    localStorage.setItem(key(companyId), JSON.stringify(list));
  } catch {
    /* noop */
  }
}

export interface CfopAcceptanceMetrics {
  total: number;
  applied: number;
  reverted: number;
  taxa_aceitacao: number; // 0..1
}

/**
 * taxa_aceitacao = (sugestões aplicadas E não revertidas pelo usuário) / total
 */
export function getAcceptanceMetrics(companyId: string): CfopAcceptanceMetrics {
  const list = readLog(companyId);
  const total = list.length;
  if (total === 0) {
    return { total: 0, applied: 0, reverted: 0, taxa_aceitacao: 0 };
  }
  const applied = list.filter(e => e.foi_aplicado).length;
  const reverted = list.filter(e => e.foi_aplicado && e.usuario_alterou_depois).length;
  const acceptedClean = applied - reverted;
  return {
    total,
    applied,
    reverted,
    taxa_aceitacao: total > 0 ? acceptedClean / total : 0,
  };
}

/** Helper de teste / admin */
export function clearLog(companyId: string): void {
  if (!companyId || !isBrowser()) return;
  try {
    localStorage.removeItem(key(companyId));
  } catch {
    /* noop */
  }
}
