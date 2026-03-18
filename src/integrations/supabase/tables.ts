/**
 * Minimal strong typing for critical financial tables.
 * This is intentionally small and hand-maintained (no codegen dependency).
 */

export type UUID = string;
export type ISODate = string; // "YYYY-MM-DD"
export type ISODateTime = string; // ISO string

export type PaymentMethod = "dinheiro" | "debito" | "credito" | "pix" | "voucher" | "outros" | "prazo";

export interface SaleRow {
  id: UUID;
  company_id: UUID;
  terminal_id: string;
  session_id: UUID;
  subtotal: number;
  discount_percent: number;
  discount_value: number;
  total: number;
  status: string;
  sold_by: UUID | null;
  created_at: ISODateTime;
  // items/payments stored as jsonb in DB; keep as unknown here unless you introduce a schema.
  items: unknown;
  payments: unknown;
}

export interface SaleItemRow {
  id: UUID;
  company_id: UUID;
  sale_id: UUID;
  product_id: UUID;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  subtotal: number;
  created_at: ISODateTime | null;
}

export interface CashSessionRow {
  id: UUID;
  company_id: UUID;
  terminal_id: string;
  status: string;
  opened_at: ISODateTime;
  closed_at: ISODateTime | null;
  notes: string | null;
  opening_balance: number;
  closing_balance: number | null;
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
}

export interface FinancialEntryRow {
  id: UUID;
  company_id: UUID;
  type: "pagar" | "receber";
  description: string;
  reference: string | null;
  amount: number;
  due_date: ISODate;
  status: string;
  counterpart: string | null;
  created_by: UUID;
  created_at: ISODateTime;
  paid_amount: number | null;
  paid_date: ISODate | null;
}

