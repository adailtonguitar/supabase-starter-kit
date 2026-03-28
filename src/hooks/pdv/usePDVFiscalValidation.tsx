/**
 * usePDVFiscalValidation — Real-time fiscal validation for PDV cart items.
 * Blocks sale finalization if any item has invalid fiscal data.
 * Includes semantic rules: regime-aware CST/CSOSN, CFOP context, origin range.
 */
import { useMemo } from "react";
import type { CartItem } from "./usePDVCart";

export interface FiscalValidationIssue {
  productId: string;
  productName: string;
  field: string;
  message: string;
}

export interface FiscalValidationResult {
  valid: boolean;
  issues: FiscalValidationIssue[];
  /** Map of productId → list of missing fields for quick badge display */
  invalidItems: Record<string, string[]>;
}

function isValidNcm(ncm: string | undefined | null): boolean {
  if (!ncm) return false;
  const clean = ncm.replace(/\D/g, "");
  return clean.length === 8 && clean !== "00000000";
}

// Valid CSOSN codes for Simples Nacional
const VALID_CSOSN = new Set(["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"]);
// Valid CST ICMS codes for regime normal
const VALID_CST_ICMS = new Set(["00", "10", "20", "30", "40", "41", "50", "51", "60", "70", "90"]);
// NFC-e only allows CFOP 5xxx (internal operations)
const CFOP_NFCE_BLOCKED_PREFIX = new Set(["6", "7"]);

type TaxRegime = "simples_nacional" | "lucro_presumido" | "lucro_real" | string | null;

function isSimplesNacional(regime: TaxRegime): boolean {
  if (!regime) return false;
  return regime === "simples_nacional" || regime.toLowerCase().includes("simples");
}

function push(issues: FiscalValidationIssue[], missing: string[], id: string, name: string, field: string, message: string) {
  missing.push(field);
  issues.push({ productId: id, productName: name, field, message });
}

export function validateCartFiscal(items: CartItem[], regime: TaxRegime): FiscalValidationResult {
  const issues: FiscalValidationIssue[] = [];
  const invalidItems: Record<string, string[]> = {};
  const isSN = isSimplesNacional(regime);

  for (const item of items) {
    const missing: string[] = [];

    // 1. NCM
    if (!isValidNcm(item.ncm)) {
      push(issues, missing, item.id, item.name, "NCM",
        "NCM ausente ou inválido (necessário 8 dígitos, diferente de 00000000)");
    }

    // 2. CFOP
    const cfop = (item.cfop || "").trim();
    if (!cfop || cfop.length !== 4 || !/^\d{4}$/.test(cfop)) {
      push(issues, missing, item.id, item.name, "CFOP",
        "CFOP ausente ou inválido (necessário 4 dígitos, ex: 5102)");
    } else {
      // NFC-e (modelo 65) só aceita CFOP 5xxx
      if (CFOP_NFCE_BLOCKED_PREFIX.has(cfop[0])) {
        push(issues, missing, item.id, item.name, "CFOP",
          `CFOP "${cfop}" é interestadual/exterior e NÃO é permitido em NFC-e. Use CFOP iniciado por 5 (operação interna)`);
      }
    }

    // 3. CST/CSOSN conforme regime
    const cst = (item.cst_icms || "").trim();
    const csosn = (item.csosn || "").trim();
    if (isSN) {
      if (!csosn) {
        push(issues, missing, item.id, item.name, "CSOSN",
          "CSOSN obrigatório para Simples Nacional (ex: 102, 500)");
      } else if (!VALID_CSOSN.has(csosn)) {
        push(issues, missing, item.id, item.name, "CSOSN",
          `CSOSN "${csosn}" inválido. Valores aceitos: ${[...VALID_CSOSN].join(", ")}`);
      }
    } else {
      if (!cst) {
        push(issues, missing, item.id, item.name, "CST ICMS",
          "CST ICMS obrigatório para Lucro Presumido/Real (ex: 00, 60)");
      } else if (!VALID_CST_ICMS.has(cst)) {
        push(issues, missing, item.id, item.name, "CST ICMS",
          `CST ICMS "${cst}" inválido. Valores aceitos: ${[...VALID_CST_ICMS].join(", ")}`);
      }
    }

    // 4. Origem (0-8)
    if (item.origem === undefined || item.origem === null) {
      push(issues, missing, item.id, item.name, "Origem",
        "Origem do produto ausente (0=Nacional, 1=Estrangeira importação direta, etc.)");
    } else if (item.origem < 0 || item.origem > 8) {
      push(issues, missing, item.id, item.name, "Origem",
        `Origem "${item.origem}" inválida. Aceito: 0 a 8`);
    }

    // 5. CFOP ST × CST/CSOSN ST coerência
    if (cfop && /^\d{4}$/.test(cfop)) {
      const isCfopST = ["5401", "5402", "5403", "5405", "6401", "6402", "6403", "6404"].includes(cfop);
      if (isCfopST) {
        const cstIndicaST = isSN
          ? ["201", "202", "203", "500"].includes(csosn)
          : ["10", "30", "60", "70"].includes(cst);
        if (!cstIndicaST) {
          push(issues, missing, item.id, item.name, "CFOP×CST",
            `CFOP "${cfop}" é de Substituição Tributária, mas ${isSN ? "CSOSN" : "CST"} não indica ST. Use ${isSN ? "201, 202, 203 ou 500" : "10, 30, 60 ou 70"}`);
        }
      }
    }

    if (missing.length > 0) {
      invalidItems[item.id] = missing;
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    invalidItems,
  };
}

export function usePDVFiscalValidation(
  cartItems: CartItem[],
  fiscalEnabled: boolean,
  taxRegime?: string | null
): FiscalValidationResult {
  return useMemo(() => {
    if (!fiscalEnabled || cartItems.length === 0) {
      return { valid: true, issues: [], invalidItems: {} };
    }
    return validateCartFiscal(cartItems, taxRegime ?? null);
  }, [cartItems, fiscalEnabled, taxRegime]);
}
