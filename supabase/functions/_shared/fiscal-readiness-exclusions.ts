/**
 * SKU que não devem entrar na barreira global de NFC-e (catálogo inteiro).
 * Alinha com ruído de E2E / tenants de teste; não substitui correção fiscal de produto real.
 */
export function isExcludedFromGlobalFiscalReadinessCatalog(name: string | null | undefined): boolean {
  const n = (name || "").trim();
  if (!n) return false;
  const lower = n.toLowerCase();
  if (lower.startsWith("loja demo")) return true;
  if (/\be2e\b/i.test(n)) return true;
  if (/^tenant-[ab]-\d+$/i.test(n)) return true;
  if (/__antho_test__/i.test(n)) return true;
  if (/__diag_test__/i.test(n)) return true;
  return false;
}
