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
  return /^\d{8}$/.test(ncm.trim().replace(/[\.\-\/\s]/g, ""));
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

  const cleaned = ncm.trim().replace(/[\.\-\/\s]/g, "");

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

/**
 * NCM hint entries: keyword → expected NCM.
 * Used to detect obvious mismatches between product description and NCM.
 */
const NCM_HINT_ENTRIES: Array<{ keywords: string[]; ncm: string; desc: string }> = [
  { keywords: ["cerveja"], ncm: "22030000", desc: "Cerveja de malte" },
  { keywords: ["refrigerante", "refri"], ncm: "22021000", desc: "Refrigerantes" },
  { keywords: ["agua mineral", "água mineral"], ncm: "22011000", desc: "Água mineral" },
  { keywords: ["suco", "néctar", "nectar"], ncm: "20098900", desc: "Sucos de frutas" },
  { keywords: ["cosmetico", "cosmético", "maquiagem"], ncm: "33049990", desc: "Cosméticos" },
  { keywords: ["shampoo", "xampu"], ncm: "33051000", desc: "Shampoo" },
  { keywords: ["sabonete"], ncm: "34011190", desc: "Sabonetes" },
  { keywords: ["cigarro", "cigarros"], ncm: "24022000", desc: "Cigarros" },
  { keywords: ["gasolina"], ncm: "27101259", desc: "Gasolina" },
  { keywords: ["etanol", "álcool combustível", "alcool combustivel"], ncm: "22071000", desc: "Etanol" },
  { keywords: ["diesel", "óleo diesel", "oleo diesel"], ncm: "27101921", desc: "Diesel" },
  { keywords: ["cimento"], ncm: "25232900", desc: "Cimento" },
  { keywords: ["pneu", "pneus"], ncm: "40111000", desc: "Pneus" },
  { keywords: ["tinta", "tintas", "verniz"], ncm: "32091000", desc: "Tintas e vernizes" },
  { keywords: ["chocolate"], ncm: "18063100", desc: "Chocolate" },
  { keywords: ["cafe", "café"], ncm: "09012100", desc: "Café torrado" },
  { keywords: ["arroz"], ncm: "10063021", desc: "Arroz" },
  { keywords: ["feijao", "feijão"], ncm: "07133319", desc: "Feijão" },
  { keywords: ["açúcar", "acucar", "açucar"], ncm: "17019900", desc: "Açúcar" },
  { keywords: ["farinha de trigo"], ncm: "11010010", desc: "Farinha de trigo" },
  { keywords: ["oleo de soja", "óleo de soja"], ncm: "15079011", desc: "Óleo de soja" },
  { keywords: ["leite"], ncm: "04012010", desc: "Leite" },
];

/**
 * Validate NCM against product description using keyword hints.
 * Returns the suggested NCM + description if a mismatch is detected, or null if OK.
 */
export function validarNCMporDescricao(
  ncm: string | undefined | null,
  descricao: string
): { sugestao: string; desc: string } | null {
  if (!ncm || !descricao) return null;
  const cleaned = ncm.replace(/\D/g, "");
  const descLower = descricao
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const entry of NCM_HINT_ENTRIES) {
    const match = entry.keywords.some((kw) =>
      descLower.includes(
        kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      )
    );
    if (match && cleaned !== entry.ncm) {
      return { sugestao: entry.ncm, desc: entry.desc };
    }
  }
  return null;
}
