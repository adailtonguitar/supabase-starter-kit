/**
 * Shared fiscal types used across PDV, emission dialogs, and fiscal pages.
 * Eliminates `any` casts in fiscal workflows.
 */

// ── Fiscal Config (from fiscal_configs table) ──
export interface FiscalConfigRecord {
  id: string;
  company_id: string;
  doc_type: "nfce" | "nfe" | "sat";
  is_active: boolean;
  environment: "homologacao" | "producao";
  certificate_path: string | null;
  a3_thumbprint: string | null;
  serie: string;
  next_number: number;
  csc_id: string | null;
  csc_token: string | null;
  created_at: string;
  updated_at: string;
}

// ── Fiscal emission result from Edge Function ──
export interface FiscalEmissionResult {
  success: boolean;
  status?: "autorizada" | "pendente" | "rejeitada" | "contingencia" | "simulado";
  error?: string;
  access_key?: string;
  nfce_number?: string;
  numero?: number;
  number?: number;
  serie?: string;
  fiscal_doc_id?: string;
  nuvem_fiscal_id?: string;
  id?: string;
  rejection_reason?: string;
  details?: {
    error?: { message?: string };
    [key: string]: unknown;
  };
  _cert_diag?: Record<string, unknown>;
}

// ── Fiscal consult result ──
export interface FiscalConsultResult {
  success: boolean;
  status?: string;
  number?: number;
  access_key?: string;
  error?: string;
  details?: Record<string, unknown>;
}

// ── Fiscal backup result ──
export interface FiscalBackupResult {
  success: boolean;
  error?: string;
  message?: string;
  backed?: number;
}

// ── PDF download result ──
export interface FiscalPdfResult {
  pdf_base64?: string;
  base64?: string;
  error?: string;
}

// ── Cash session (minimal shape used across PDV and Caixa) ──
export interface CashSessionRecord {
  id: string;
  company_id: string;
  terminal_id: string;
  status: string;
  opened_at: string;
  opened_by: string;
  closed_at: string | null;
  closed_by: string | null;
  opening_balance: number;
  closing_balance: number | null;
  counted_dinheiro: number | null;
  counted_debito: number | null;
  counted_credito: number | null;
  counted_pix: number | null;
  difference: number | null;
  notes: string | null;
  sales_count: number;
  total_vendas: number;
  total_dinheiro: number;
  total_debito: number;
  total_credito: number;
  total_pix: number;
  total_voucher: number;
  total_outros: number;
  total_sangria: number;
  total_suprimento: number;
  created_at: string;
}

// ── Cash movement (for fiado queries etc.) ──
export interface CashMovementRecord {
  id: string;
  session_id: string | null;
  amount: number;
  type: string;
  description: string | null;
  payment_method: string | null;
}

// ── Promotion record (used in PDV promo engine) ──
export interface PromotionRecord {
  id: string;
  company_id: string;
  name: string;
  promo_type: string;
  discount_percent: number;
  fixed_price: number;
  buy_quantity: number;
  pay_quantity: number;
  scope: string;
  category_name: string | null;
  min_quantity: number;
  starts_at: string;
  ends_at: string | null;
  active_days: number[] | null;
  product_ids: string[] | null;
  is_active: boolean;
}

// ── Sale record (partial, as used in reports and PDV) ──
export interface SaleRecord {
  id: string;
  company_id: string;
  total: number;
  payments: unknown;
  status: string | null;
  created_at: string;
  payment_method: string | null;
  client_name: string | null;
  sale_number: number | null;
}

// ── Sale item record ──
export interface SaleItemRecord {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  sale_id: string;
  discount_percent?: number;
  subtotal?: number;
}

// ── Product (partial, for cost lookups) ──
export interface ProductCostRecord {
  id: string;
  cost_price: number | null;
}

// ── Guard functions ──

export function isFiscalEmissionResult(data: unknown): data is FiscalEmissionResult {
  return typeof data === "object" && data !== null && "success" in data;
}

export function isFiscalConsultResult(data: unknown): data is FiscalConsultResult {
  return typeof data === "object" && data !== null && "success" in data;
}

export function isFiscalPdfResult(data: unknown): data is FiscalPdfResult {
  return typeof data === "object" && data !== null && ("pdf_base64" in data || "base64" in data || "error" in data);
}
