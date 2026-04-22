/**
 * cfop-suggestion-log — Telemetria local de sugestões de CFOP.
 * DEPRECATED: Local logging disabled to ensure Supabase is the single source of truth.
 */

export interface CfopSuggestionLogEntry {
  product_id: string;
  user_id: string | null;
  company_id: string;
  cfop_sugerido: string;
  cfop_original: string | null;
  foi_aplicado: boolean;
  usuario_alterou_depois: boolean;
  timestamp: string;
}

export function readLog(companyId: string): CfopSuggestionLogEntry[] {
  return [];
}

export function appendLog(entry: any): void {
  // No-op
}

export function markUserOverride(companyId: string, productId: string): void {
  // No-op
}

export function getAcceptanceMetrics(companyId: string): any {
  return { total: 0, applied: 0, reverted: 0, taxa_aceitacao: 0 };
}

export function clearLog(companyId: string): void {
  // No-op
}
