/**
 * usePDVFiscalValidation — Real-time fiscal validation for PDV cart items.
 * Blocks sale finalization if any item has invalid fiscal data.
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

export function validateCartFiscal(items: CartItem[]): FiscalValidationResult {
  const issues: FiscalValidationIssue[] = [];
  const invalidItems: Record<string, string[]> = {};

  for (const item of items) {
    const missing: string[] = [];

    if (!isValidNcm(item.ncm)) {
      missing.push("NCM");
      issues.push({
        productId: item.id, productName: item.name, field: "NCM",
        message: `NCM ausente ou inválido (necessário 8 dígitos, diferente de 00000000)`,
      });
    }

    const cfop = (item.cfop || "").trim();
    if (!cfop || cfop.length !== 4 || !/^\d{4}$/.test(cfop)) {
      missing.push("CFOP");
      issues.push({
        productId: item.id, productName: item.name, field: "CFOP",
        message: `CFOP ausente ou inválido (necessário 4 dígitos, ex: 5102)`,
      });
    }

    const cst = (item.cst_icms || "").trim();
    const csosn = (item.csosn || "").trim();
    if (!cst && !csosn) {
      missing.push("CST/CSOSN");
      issues.push({
        productId: item.id, productName: item.name, field: "CST/CSOSN",
        message: `CST ICMS ou CSOSN ausente. Informe conforme o regime tributário da empresa`,
      });
    }

    if (item.origem === undefined || item.origem === null) {
      missing.push("Origem");
      issues.push({
        productId: item.id, productName: item.name, field: "Origem",
        message: `Origem do produto ausente (0=Nacional, 1=Estrangeira importação direta, etc.)`,
      });
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
  fiscalEnabled: boolean
): FiscalValidationResult {
  return useMemo(() => {
    if (!fiscalEnabled || cartItems.length === 0) {
      return { valid: true, issues: [], invalidItems: {} };
    }
    return validateCartFiscal(cartItems);
  }, [cartItems, fiscalEnabled]);
}
