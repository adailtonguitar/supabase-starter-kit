import type { Product } from "@/hooks/useProducts";
import type { FiscalCategory } from "@/hooks/useFiscalCategories";
import { getSuggestedCodes, type TaxRegime } from "@/lib/cst-csosn-validator";
import { isTypicalStNcm } from "@/lib/icms-st-engine";
import {
  cfopConflictMessage,
  csosnConflictMessage,
  cstIcmsConflictMessage,
  fiscalConflictBadgeLabel,
  fiscalPendingBadgeLabel,
  stCategoryConflictMessage,
} from "../../shared/fiscal/fiscal-copy";

export function getFiscalGaps(product: Product): string[] {
  const gaps: string[] = [];
  const ncm = (product.ncm || "").replace(/\D/g, "");
  const cfop = (product.cfop || "").trim();
  const hasCst = !!(product.csosn || "").trim() || !!(product.cst_icms || "").trim();

  if (ncm.length !== 8 || ncm === "00000000") gaps.push("NCM");
  if (!/^\d{4}$/.test(cfop) || !cfop.startsWith("5")) gaps.push("CFOP");
  if (!hasCst) gaps.push("CST/CSOSN");
  if (product.origem === undefined || product.origem === null || product.origem < 0 || product.origem > 8) gaps.push("Origem");

  return gaps;
}

export function getSuggestedFiscalUpdate(
  product: Product,
  fiscalCategories: FiscalCategory[],
  taxRegime: TaxRegime,
): Partial<Product> {
  const fiscalCategory = fiscalCategories.find((category) => category.id === product.fiscal_category_id);
  const ncmSignalsSt = isTypicalStNcm(product.ncm).isTypical;
  const productType = fiscalCategory?.product_type === "st" || (!fiscalCategory && ncmSignalsSt) ? "st" : "normal";
  const suggestedCode = getSuggestedCodes(taxRegime, productType)[0]?.code;

  return {
    origem: product.origem ?? 0,
    cfop: fiscalCategory?.cfop || (productType === "st" ? "5405" : "5102"),
    csosn: taxRegime === "simples_nacional"
      ? (fiscalCategory?.csosn || suggestedCode || (productType === "st" ? "500" : "102"))
      : "",
    cst_icms: taxRegime === "simples_nacional"
      ? ""
      : (fiscalCategory?.cst_icms || suggestedCode || (productType === "st" ? "60" : "00")),
  };
}

export function getChangedFiscalFields(product: Product, suggestion: Partial<Product>): string[] {
  const changes: string[] = [];
  if (suggestion.origem !== undefined && product.origem !== suggestion.origem) changes.push(`Origem: ${String(suggestion.origem)}`);
  if (suggestion.cfop !== undefined && (product.cfop || "") !== suggestion.cfop) changes.push(`CFOP: ${suggestion.cfop}`);
  if (suggestion.csosn !== undefined && (product.csosn || "") !== suggestion.csosn) changes.push(`CSOSN: ${suggestion.csosn || "-"}`);
  if (suggestion.cst_icms !== undefined && (product.cst_icms || "") !== suggestion.cst_icms) changes.push(`CST ICMS: ${suggestion.cst_icms || "-"}`);
  return changes;
}

export function getFiscalSuggestionDiagnostics(
  product: Product,
  fiscalCategories: FiscalCategory[],
  taxRegime: TaxRegime,
): {
  warnings: string[];
  suggestsStCategory: boolean;
  suggestedStCategoryId?: string;
  suggestedStCategoryName?: string;
  hasCategoryConflict: boolean;
} {
  const warnings: string[] = [];
  const fiscalCategory = fiscalCategories.find((category) => category.id === product.fiscal_category_id);
  const stSignal = isTypicalStNcm(product.ncm);
  const suggestion = getSuggestedFiscalUpdate(product, fiscalCategories, taxRegime);
  const suggestedStCategory = fiscalCategories.find(
    (category) => category.regime === taxRegime && category.product_type === "st" && category.is_active,
  );
  const suggestsStCategory = stSignal.isTypical && fiscalCategory?.product_type !== "st";
  let hasCategoryConflict = false;

  if (suggestsStCategory) {
    warnings.push(stCategoryConflictMessage(stSignal.description));
  }

  if (fiscalCategory) {
    if (suggestion.cfop && fiscalCategory.cfop && suggestion.cfop !== fiscalCategory.cfop) {
      hasCategoryConflict = true;
      warnings.push(cfopConflictMessage(fiscalCategory.cfop, suggestion.cfop));
    }
    if (taxRegime === "simples_nacional" && suggestion.csosn && fiscalCategory.csosn && suggestion.csosn !== fiscalCategory.csosn) {
      hasCategoryConflict = true;
      warnings.push(csosnConflictMessage(fiscalCategory.csosn, suggestion.csosn));
    }
    if (taxRegime !== "simples_nacional" && suggestion.cst_icms && fiscalCategory.cst_icms && suggestion.cst_icms !== fiscalCategory.cst_icms) {
      hasCategoryConflict = true;
      warnings.push(cstIcmsConflictMessage(fiscalCategory.cst_icms, suggestion.cst_icms));
    }
  }

  return {
    warnings,
    suggestsStCategory,
    suggestedStCategoryId: suggestedStCategory?.id,
    suggestedStCategoryName: suggestedStCategory?.name,
    hasCategoryConflict,
  };
}

export function getBulkFiscalFixAnalysis(
  products: Product[],
  fiscalCategories: FiscalCategory[],
  taxRegime: TaxRegime,
): {
  pendingFiscalProducts: Product[];
  criticalConflictProducts: Product[];
  pendingBulkFixProducts: Product[];
  excludedCriticalBulkProducts: Product[];
  actionableBulkFixCount: number;
  bulkFixPreview: Array<{ id: string; name: string; changes: string[] }>;
} {
  const pendingFiscalProducts = products.filter((product) => getFiscalGaps(product).length > 0);
  const criticalConflictProducts = products.filter((product) => {
    const diagnostics = getFiscalSuggestionDiagnostics(product, fiscalCategories, taxRegime);
    return diagnostics.suggestsStCategory || diagnostics.hasCategoryConflict;
  });
  const excludedCriticalIds = new Set(criticalConflictProducts.map((product) => product.id));
  const pendingBulkFixProducts = pendingFiscalProducts.filter((product) => !excludedCriticalIds.has(product.id));
  const actionableBulkFixProducts = pendingBulkFixProducts
    .map((product) => {
      const suggestion = getSuggestedFiscalUpdate(product, fiscalCategories, taxRegime);
      const changes = getChangedFiscalFields(product, suggestion);
      return { product, changes };
    })
    .filter((item) => item.changes.length > 0);

  return {
    pendingFiscalProducts,
    criticalConflictProducts,
    pendingBulkFixProducts,
    excludedCriticalBulkProducts: pendingFiscalProducts.filter((product) => excludedCriticalIds.has(product.id)),
    actionableBulkFixCount: actionableBulkFixProducts.length,
    bulkFixPreview: actionableBulkFixProducts.slice(0, 8).map(({ product, changes }) => ({
      id: product.id,
      name: product.name,
      changes,
    })),
  };
}

export function getProductFiscalStatus(
  product: Product,
  fiscalCategories: FiscalCategory[],
  taxRegime: TaxRegime,
): {
  gaps: string[];
  diagnostics: ReturnType<typeof getFiscalSuggestionDiagnostics>;
  hasFiscalGap: boolean;
  hasCriticalConflict: boolean;
  blocksFiscalEmission: boolean;
  tone: "ok" | "warning" | "critical";
  badgeLabel?: string;
} {
  const gaps = getFiscalGaps(product);
  const diagnostics = getFiscalSuggestionDiagnostics(product, fiscalCategories, taxRegime);
  const hasFiscalGap = gaps.length > 0;
  const hasCriticalConflict = diagnostics.suggestsStCategory || diagnostics.hasCategoryConflict;

  return {
    gaps,
    diagnostics,
    hasFiscalGap,
    hasCriticalConflict,
    blocksFiscalEmission: hasFiscalGap || hasCriticalConflict,
    tone: hasCriticalConflict ? "critical" : hasFiscalGap ? "warning" : "ok",
    badgeLabel: hasCriticalConflict
      ? fiscalConflictBadgeLabel()
      : hasFiscalGap
        ? fiscalPendingBadgeLabel(gaps)
        : undefined,
  };
}
