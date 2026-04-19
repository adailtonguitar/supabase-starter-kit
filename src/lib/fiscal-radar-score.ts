/**
 * Modelo de score para o Radar Fiscal.
 * NÃO altera dados nem regras de emissão — apenas pontua risco fiscal por produto.
 */
import { auditProductFiscal, type AuditableProduct, type ProductAuditIssue } from "@/lib/product-fiscal-audit";

export type FiscalRiskLevel = "critical" | "warn" | "ok";

export interface FiscalScoreMetrics {
  sales_count?: number;
}

export interface FiscalScoreResult {
  score: number;
  level: FiscalRiskLevel;
  issues: ProductAuditIssue[];
}

export function computeFiscalScore(product: AuditableProduct, metrics: FiscalScoreMetrics = {}): FiscalScoreResult {
  let score = 0;
  const cfop = String(product?.cfop ?? "").trim();

  // ERROS CRÍTICOS
  if (cfop === "5101" || cfop === "6101") score += 50;
  if (!cfop || cfop.length !== 4) score += 40;

  // ALERTAS (ST informativo)
  if (/^54/.test(cfop)) score += 10;

  // IMPACTO (peso por vendas)
  score += (metrics.sales_count || 0) * 2;

  const level: FiscalRiskLevel = score >= 80 ? "critical" : score >= 40 ? "warn" : "ok";

  return { score, level, issues: auditProductFiscal(product) };
}

export function suggestCfopFix(cfop?: string | null): string | null {
  const c = String(cfop ?? "").trim();
  if (c === "5101") return "5102";
  if (c === "6101") return "6102";
  return null;
}
