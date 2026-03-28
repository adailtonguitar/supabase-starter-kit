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
        productId: item.id,
        productName: item.name,
        field: "NCM",
        message: `NCM ausente ou inválido (necessário 8 dígitos, diferente de 00000000)`,
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
