/**
 * SKU Estruturado — formato CAT-MOD-VAR-SEQ
 *
 * Coexiste com o SKU livre legado (campo `sku`). Não substitui, não migra antigos.
 * - CAT: primeiros 4 chars normalizados de `category`
 * - MOD: primeiros 4 chars normalizados de `modelo`
 * - VAR: primeiros 4 chars normalizados de `tipo_material` (fallback voltage/brand/marca)
 * - SEQ: 3 dígitos sequenciais por (company_id, base) — gerado via RPC atômica
 *
 * Validação: ^[A-Z0-9-]+$, máx 30 chars.
 * Se faltar qualquer token → retorna null (fallback ao SKU legado).
 */
import { supabase } from "@/integrations/supabase/client";

export const SKU_STRUCTURED_REGEX = /^[A-Z0-9-]+$/;
export const SKU_STRUCTURED_MAX_LEN = 30;

export interface SkuStructuredInput {
  category?: string | null;
  modelo?: string | null;
  tipo_material?: string | null;
  voltage?: string | null;
  brand?: string | null;
  marca?: string | null;
}

const stripDiacritics = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const tokenize = (raw: string | null | undefined, max = 4): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = stripDiacritics(trimmed)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return null;
  return cleaned.slice(0, Math.max(1, max));
};

/** Monta a base CAT-MOD-VAR (sem o seq). Retorna null se faltar qualquer token. */
export function buildSkuStructuredBase(input: SkuStructuredInput): string | null {
  const cat = tokenize(input.category);
  const mod = tokenize(input.modelo);
  const varToken =
    tokenize(input.tipo_material) ??
    tokenize(input.voltage) ??
    tokenize(input.brand) ??
    tokenize(input.marca);

  if (!cat || !mod || !varToken) return null;
  const base = `${cat}-${mod}-${varToken}`;
  // Reserva 4 chars para "-XXX"
  if (base.length > SKU_STRUCTURED_MAX_LEN - 4) return null;
  return base;
}

/** Valida formato/tamanho de um SKU estruturado completo. */
export function isValidSkuStructured(sku: string | null | undefined): boolean {
  if (!sku) return false;
  if (sku.length > SKU_STRUCTURED_MAX_LEN) return false;
  return SKU_STRUCTURED_REGEX.test(sku);
}

/**
 * Gera o SKU estruturado completo via RPC atômica `generate_sku_structured`.
 * Retorna null em qualquer falha (caller deve usar fallback no `sku` legado).
 */
export async function generateSkuStructured(
  companyId: string | null | undefined,
  input: SkuStructuredInput
): Promise<string | null> {
  if (!companyId) return null;
  const base = buildSkuStructuredBase(input);
  if (!base) return null;

  try {
    const { data, error } = await supabase.rpc("generate_sku_structured", {
      p_company_id: companyId,
      p_base: base,
    });
    if (error) {
      console.warn("[SKU] generate_sku_structured RPC error:", error.message);
      return null;
    }
    const candidate = typeof data === "string" ? data : null;
    return isValidSkuStructured(candidate) ? candidate : null;
  } catch (err) {
    console.warn("[SKU] generate_sku_structured exception:", err);
    return null;
  }
}
