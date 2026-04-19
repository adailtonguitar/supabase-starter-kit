/**
 * Feature flag global para auto-aplicação fiscal (CFOP + tax rule).
 * Default: false (modo SHADOW puro, somente log).
 *
 * Para habilitar em runtime via console (debug):
 *   localStorage.setItem("AUTO_APPLY_FISCAL", "true")
 *
 * NÃO altera XML. NÃO altera emit-nfce. NÃO bloqueia emissão.
 */
export const AUTO_APPLY_FISCAL = false;

export function isAutoApplyFiscalEnabled(): boolean {
  if (AUTO_APPLY_FISCAL) return true;
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("AUTO_APPLY_FISCAL") === "true";
    }
  } catch { /* noop */ }
  return false;
}
