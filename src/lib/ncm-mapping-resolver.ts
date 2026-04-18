/**
 * Motor de classificação fiscal automática (NCM) baseado em SKU estruturado.
 *
 * Resolução em cascata via RPC `resolve_ncm_mapping`:
 *   1) CAT + VAR exato (prioridade máxima)
 *   2) CAT exato (fallback)
 *   3) descricao_pattern ILIKE (fallback)
 *
 * Empresa tem prioridade sobre global. Confiança 0–100.
 *
 * SEGURANÇA:
 *   - Nunca sobrescreve NCM manual já preenchido (use applyNcmIfSafe).
 *   - Nunca bloqueia emissão; só sugere/aplica em camada de produto.
 *   - Não usa IA generativa.
 */
import { supabase } from "@/integrations/supabase/client";

export interface NcmMappingSuggestion {
  ncm: string;
  cest: string | null;
  confianca: number; // 0–100
  regra: "cat_var" | "cat" | "pattern";
  source: "company" | "global";
}

const sanitizeNcm = (v: string | null | undefined): string =>
  (v || "").replace(/\D/g, "");

/**
 * Consulta a RPC e devolve a melhor sugestão (ou null).
 * Falha silenciosa: nunca quebra o caller.
 */
export async function resolveNcmMapping(params: {
  companyId: string | null | undefined;
  category?: string | null;
  variacao?: string | null; // tipo_material / voltage / brand
  descricao?: string | null;
}): Promise<NcmMappingSuggestion | null> {
  const { companyId, category, variacao, descricao } = params;
  if (!companyId) return null;
  const cat = (category || "").trim();
  if (!cat && !descricao) return null;

  try {
    const { data, error } = await (supabase.rpc as any)("resolve_ncm_mapping", {
      p_company_id: companyId,
      p_categoria: cat || null,
      p_variacao: (variacao || "").trim() || null,
      p_descricao: (descricao || "").trim() || null,
    });
    if (error) {
      console.warn("[NCM-MAP] resolve_ncm_mapping erro:", error.message);
      return null;
    }
    if (!data || typeof data !== "object") return null;
    const ncm = sanitizeNcm((data as any).ncm);
    if (ncm.length !== 8) return null;
    const confianca = Number((data as any).confianca);
    if (!Number.isFinite(confianca)) return null;
    const regra = (data as any).regra;
    if (regra !== "cat_var" && regra !== "cat" && regra !== "pattern") return null;
    return {
      ncm,
      cest: sanitizeNcm((data as any).cest) || null,
      confianca: Math.max(0, Math.min(100, Math.round(confianca))),
      regra,
      source: (data as any).source === "company" ? "company" : "global",
    };
  } catch (err) {
    console.warn("[NCM-MAP] resolve_ncm_mapping exceção:", err);
    return null;
  }
}

/**
 * Decide com segurança se aplica a sugestão.
 * Regra: só aplica se NCM atual estiver vazio E confianca >= 80.
 * Caso contrário, retorna o NCM atual (no-op) e loga aviso.
 */
export function applyNcmIfSafe(
  currentNcm: string | null | undefined,
  suggestion: NcmMappingSuggestion | null
): { ncm: string; applied: boolean; reason?: string } {
  const current = sanitizeNcm(currentNcm);
  if (!suggestion) {
    return { ncm: current, applied: false, reason: "no_suggestion" };
  }
  if (current && current.length === 8) {
    console.info("[NCM-MAP] mantém NCM manual:", { current, suggestion });
    return { ncm: current, applied: false, reason: "manual_ncm_present" };
  }
  if (suggestion.confianca < 80) {
    console.info("[NCM-MAP] confiança baixa, não aplicado:", suggestion);
    return { ncm: current, applied: false, reason: "low_confidence" };
  }
  return { ncm: suggestion.ncm, applied: true };
}
