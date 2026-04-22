/**
 * NCM Learning Engine — Aprendizado automático de NCM baseado no uso.
 * DEPRECATED: Local learning disabled to ensure Supabase is the single source of truth.
 */

export function aprenderNCM(descricao: string, ncm: string): void {
  // No-op
}

export function sugerirNCM(descricao: string): { ncm: string; termo: string; count: number } | null {
  return null;
}

export function getNCMLearningData(): Record<string, any> {
  return {};
}

export function clearNCMLearningData(): void {
  // No-op
}
