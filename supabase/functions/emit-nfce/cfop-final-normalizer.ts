/**
 * CFOP Final Normalizer + Validator — última linha de defesa antes da montagem do XML.
 *
 * normalizeFinalCfop — corrige automaticamente o que é seguro:
 *  1. CFOP inválido (ausente/!=4 dígitos) → "5102"
 *  2. ST (54xx/64xx) → preservar SEMPRE
 *  3. Produção própria (5101/6101) → corrigir para revenda (5102/6102)
 *  4. Ajuste por destino:
 *       - idDest=2 (interestadual) e CFOP 5xxx → trocar para 6xxx
 *       - idDest=1 (interna)        e CFOP 6xxx → trocar para 5xxx
 *
 * validateFinalCfop — fail-safe absoluto: se algo escapou da normalização, BLOQUEIA.
 *
 * NÃO altera estrutura do XML, assinatura, cálculo de impostos nem regras de ST.
 */
/**
 * fixRevendaCfop — corrige CFOP de produção própria (5101/6101) para revenda (5102/6102).
 * Preserva ST (54xx/64xx). Loga toda mudança via CFOP_REV_FIX.
 * Deve ser chamado ANTES de normalizeFinalCfop.
 */
export function fixRevendaCfop(cfop: string | null | undefined, idDest: number): string {
  const c = String(cfop ?? "").trim();
  if (!c) {
    const fallback = idDest === 2 ? "6102" : "5102";
    console.log({ type: "CFOP_REV_FIX", before: cfop, after: fallback, idDest, reason: "empty" });
    return fallback;
  }
  // ST nunca é alterado
  if (c.startsWith("54") || c.startsWith("64")) {
    return c;
  }
  let out = c;
  if (c === "5101") out = "5102";
  else if (c === "6101") out = "6102";
  if (out !== c) {
    console.log({ type: "CFOP_REV_FIX", before: c, after: out, idDest });
  }
  return out;
}

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

/**
 * Fail-safe final. Lança erro se CFOP estiver fiscalmente inconsistente.
 * Deve ser chamado IMEDIATAMENTE antes de inserir o CFOP no XML.
 *
 * Permite ST (54xx/64xx) independente do idDest — ST tem regras próprias.
 */
export function validateFinalCfop(cfop: string, idDest: number): void {
  if (!cfop || !/^\d{4}$/.test(cfop)) {
    throw new Error(`CFOP inválido: "${cfop}" (esperado 4 dígitos)`);
  }

  if (cfop === "5101" || cfop === "6101") {
    throw new Error(`CFOP "${cfop}" (produção própria) não permitido para revenda`);
  }

  // ST: regras próprias, não validar prefixo por idDest
  if (cfop.startsWith("54") || cfop.startsWith("64")) {
    console.log({ type: "FISCAL_VALIDATION", cfop, idDest, valid: true, st: true });
    return;
  }

  if (idDest === 1 && !cfop.startsWith("5")) {
    throw new Error(`CFOP "${cfop}" incompatível com operação interna (idDest=1, esperado 5xxx)`);
  }
  if (idDest === 2 && !cfop.startsWith("6")) {
    throw new Error(`CFOP "${cfop}" incompatível com operação interestadual (idDest=2, esperado 6xxx)`);
  }

  console.log({ type: "FISCAL_VALIDATION", cfop, idDest, valid: true });
}
