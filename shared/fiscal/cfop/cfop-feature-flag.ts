/**
 * cfop-feature-flag — Feature flag controlada por empresa.
 *
 * Default SEMPRE false (modo seguro, sem auto-aplicação).
 * Memory-only persistence for strict Supabase-only audit.
 *
 * NÃO bloqueia emissão. NÃO altera XML. NÃO altera fluxo atual.
 */

const memoryFlags: Record<string, boolean> = {};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function isAutoCfopEnabled(companyId: string | null | undefined): boolean {
  if (!companyId || !isBrowser()) return false;
  return !!memoryFlags[companyId];
}

export function setAutoCfopEnabled(companyId: string, enabled: boolean): void {
  if (!companyId || !isBrowser()) return;
  memoryFlags[companyId] = enabled;
}
