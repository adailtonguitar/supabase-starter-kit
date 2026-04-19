/**
 * cfop-feature-flag — Feature flag controlada por empresa.
 *
 * Default SEMPRE false (modo seguro, sem auto-aplicação).
 * Persistida em localStorage por company_id para isolamento multi-tenant.
 *
 * NÃO bloqueia emissão. NÃO altera XML. NÃO altera fluxo atual.
 */

const KEY_PREFIX = "auto_cfop_enabled::";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function isAutoCfopEnabled(companyId: string | null | undefined): boolean {
  if (!companyId || !isBrowser()) return false;
  try {
    return localStorage.getItem(KEY_PREFIX + companyId) === "true";
  } catch {
    return false;
  }
}

export function setAutoCfopEnabled(companyId: string, enabled: boolean): void {
  if (!companyId || !isBrowser()) return;
  try {
    localStorage.setItem(KEY_PREFIX + companyId, enabled ? "true" : "false");
  } catch {
    /* noop */
  }
}
