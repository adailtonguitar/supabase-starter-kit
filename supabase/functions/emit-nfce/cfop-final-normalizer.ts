/**
 * CFOP Final Normalizer — última linha de defesa antes da montagem do XML.
 *
 * Regras (ordem):
 *  1. CFOP inválido (ausente/!=4 dígitos) → "5102"
 *  2. ST (54xx/64xx) → preservar SEMPRE
 *  3. Produção própria (5101/6101) → corrigir para revenda (5102/6102)
 *  4. Ajuste por destino:
 *       - idDest=2 (interestadual) e CFOP 5xxx → trocar para 6xxx
 *       - idDest=1 (interna)        e CFOP 6xxx → trocar para 5xxx
 *
 * NÃO altera estrutura do XML, assinatura, cálculo de impostos nem regras de ST.
 */
export function normalizeFinalCfop(cfop: string | null | undefined, idDest: number): string {
  const c = String(cfop ?? "").trim();
  if (!c || !/^\d{4}$/.test(c)) return "5102";

  // ST nunca é alterado
  if (c.startsWith("54") || c.startsWith("64")) return c;

  // Produção própria → revenda (independente do destino)
  let out = c;
  if (out === "5101") out = "5102";
  else if (out === "6101") out = "6102";

  // Ajuste por destino
  if (idDest === 2 && out.startsWith("5")) {
    out = "6" + out.slice(1);
  } else if (idDest === 1 && out.startsWith("6")) {
    out = "5" + out.slice(1);
  }

  return out;
}
