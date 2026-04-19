/**
 * resolve-cfop — Camada adicional, NÃO invasiva.
 *
 * Regra mínima:
 *   1. cfop_manual (se válido) → usa
 *   2. tipo_item === "producao" → 5101
 *   3. fallback → 5102
 *
 * NÃO altera XML. NÃO altera emit-nfce. NÃO bloqueia emissão.
 * Use apenas como helper opcional ANTES da montagem do payload.
 */

export type TipoItem = "revenda" | "producao" | string | null | undefined;

export interface ResolveCfopInput {
  cfop_manual?: string | null;
  tipo_item?: TipoItem;
  /** Se true, considera operação interestadual (não usado na regra mínima, reservado). */
  interestadual?: boolean;
}

export interface ResolveCfopResult {
  cfop: string;
  source: "manual" | "producao" | "fallback";
  reason: string;
}

const CFOP_REGEX = /^\d{4}$/;

export function resolveCfop(produto: ResolveCfopInput): ResolveCfopResult {
  const manual = (produto?.cfop_manual ?? "").toString().replace(/\D/g, "");
  if (CFOP_REGEX.test(manual)) {
    return { cfop: manual, source: "manual", reason: "cfop_manual respeitado" };
  }

  const tipo = (produto?.tipo_item ?? "").toString().toLowerCase().trim();
  if (tipo === "producao" || tipo === "produção" || tipo === "industrializacao" || tipo === "industrialização") {
    return { cfop: "5101", source: "producao", reason: "tipo_item=producao" };
  }

  return { cfop: "5102", source: "fallback", reason: "revenda/padrão seguro" };
}
