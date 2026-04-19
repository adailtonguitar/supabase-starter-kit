/**
 * resolveIdDest — fonte única para o cálculo de idDest (NF-e/NFC-e).
 *  - 1 = operação interna  (UF emit == UF dest)
 *  - 2 = interestadual     (UF emit != UF dest)
 * Sempre recalcular no momento da emissão. Nunca confiar em valor anterior.
 */
export function resolveIdDest(emitUF?: string | null, destUF?: string | null): number {
  const eu = String(emitUF ?? "").toUpperCase().trim();
  const du = String(destUF ?? "").toUpperCase().trim();
  if (!eu || !du || eu.length !== 2 || du.length !== 2) return 1;
  const idDest = eu === du ? 1 : 2;
  console.log({ type: "IDDEST_RESOLVED", emitUF: eu, destUF: du, idDest });
  return idDest;
}
