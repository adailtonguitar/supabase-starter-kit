/**
 * NCM Validator — Validação inteligente de NCM (Nomenclatura Comum do Mercosul)
 *
 * Regras:
 * 1. Formato: deve ter exatamente 8 dígitos numéricos
 * 2. Tabela oficial: verificar se existe na tabela NCM conhecida
 * 3. Duplicidade: alertar se produtos com mesmo nome têm NCM diferente
 * 4. Códigos expirados/alterados pela TIPI
 */

import { NCM_TABLE } from "./ncm-table";

export interface NcmValidationResult {
  valid: boolean;
  errors: NcmIssue[];
  warnings: NcmIssue[];
}

export interface NcmIssue {
  type: "format" | "unknown" | "duplicate" | "expired";
  message: string;
}

// NCM codes that were revoked/changed by TIPI updates (examples of real revocations)
const EXPIRED_NCM_CODES: Record<string, string> = {
  "84713011": "Substituído por 84713012 (TIPI 2022)",
  "85171100": "Substituído por 85171200 (TIPI 2022)",
  "85176200": "Substituído por 85171800 (TIPI 2022)",
  "84716031": "Substituído por 84716052 (TIPI 2022)",
  "85285100": "Substituído por 85285200 (TIPI 2022)",
  "85287100": "Substituído por 85287200 (TIPI 2022)",
};

/** Build a Set for O(1) lookups */
const NCM_SET = new Set(NCM_TABLE.map((item) => item.ncm));

/**
 * Validate NCM format: exactly 8 numeric digits.
 */
export function isValidNcmFormat(ncm: string): boolean {
  return /^\d{8}$/.test(ncm.trim());
}

/**
 * Check if NCM exists in the known official table.
 */
export function isNcmInOfficialTable(ncm: string): boolean {
  return NCM_SET.has(ncm.trim());
}

/**
 * Check if NCM is expired/revoked by TIPI updates.
 */
export function isNcmExpired(ncm: string): string | null {
  return EXPIRED_NCM_CODES[ncm.trim()] || null;
}

/**
 * Get NCM description from official table.
 */
export function getNcmDescription(ncm: string): string | null {
  const entry = NCM_TABLE.find((item) => item.ncm === ncm.trim());
  return entry?.description ?? null;
}

/**
 * Full NCM validation for a single code.
 */
export function validateNcm(ncm: string | undefined | null): NcmValidationResult {
  const errors: NcmIssue[] = [];
  const warnings: NcmIssue[] = [];

  if (!ncm || ncm.trim().length === 0) {
    errors.push({ type: "format", message: "NCM não informado" });
    return { valid: false, errors, warnings };
  }

  const cleaned = ncm.trim();

  // Format check
  if (!isValidNcmFormat(cleaned)) {
    errors.push({
      type: "format",
      message: `NCM "${cleaned}" deve ter exatamente 8 dígitos numéricos`,
    });
    return { valid: false, errors, warnings };
  }

  // Expired check
  const expiredMsg = isNcmExpired(cleaned);
  if (expiredMsg) {
    errors.push({
      type: "expired",
      message: `NCM "${cleaned}" foi revogado: ${expiredMsg}`,
    });
  }

  // Official table check
  if (!isNcmInOfficialTable(cleaned)) {
    warnings.push({
      type: "unknown",
      message: `NCM "${cleaned}" não encontrado na tabela de referência. Verifique se o código está correto.`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detect NCM duplicates: products with similar names but different NCMs.
 */
export function detectNcmDuplicates(
  productName: string,
  productNcm: string,
  productId: string | undefined,
  allProducts: Array<{ id: string; name: string; ncm?: string | null }>
): NcmIssue[] {
  const warnings: NcmIssue[] = [];
  if (!productNcm || !productName) return warnings;

  const normalizedName = productName.toLowerCase().trim();
  const cleanNcm = productNcm.trim();

  for (const p of allProducts) {
    if (p.id === productId) continue;
    if (!p.ncm || p.ncm.trim() === cleanNcm) continue;

    const otherName = p.name.toLowerCase().trim();

    // Check for similar names (exact match or high overlap)
    const isSimilar =
      normalizedName === otherName ||
      normalizedName.includes(otherName) ||
      otherName.includes(normalizedName);

    if (isSimilar) {
      warnings.push({
        type: "duplicate",
        message: `Produto "${p.name}" usa NCM diferente (${p.ncm}). Verifique se ambos estão corretos.`,
      });
    }
  }

  return warnings;
}
