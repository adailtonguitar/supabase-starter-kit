/**
 * Shared types for the service layer.
 * All services operate on these types, decoupled from Supabase internals.
 */

export interface SaleItem {
  product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  unit: string;
  ncm?: string;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  total: number;
  payment_method: string;
  company_id: string;
  session_id?: string;
  customer_cpf?: string;
  customer_name?: string;
  created_at: string;
  nfce_number?: string;
  synced: boolean;
}

export interface PaymentResult {
  method: "dinheiro" | "debito" | "credito" | "pix" | "voucher" | "outros" | "prazo" | "multi";
  approved: boolean;
  amount: number;
  nsu?: string;
  auth_code?: string;
  card_brand?: string;
  card_last_digits?: string;
  installments?: number;
  change_amount?: number;
  pix_tx_id?: string;
  credit_client_id?: string;
  credit_client_name?: string;
  credit_mode?: "fiado" | "parcelado" | "sinal";
  credit_installments?: number;
}

// ===== PDV / FINANCE CRITICAL INPUTS =====

export interface FinalizeSaleItemInput {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  subtotal: number;
  ncm?: string;
  cfop?: string;
  csosn?: string;
  cst_icms?: string;
  origem?: number;
  cst_pis?: string;
  cst_cofins?: string;
  aliq_icms?: number;
  cest?: string;
  mva?: number;
  unit?: string;
}

export interface FinalizeSalePaymentInput {
  method: PaymentResult["method"];
  amount: number;
  approved: boolean;
  /** Preserva na venda para emissão fiscal (fila / tPag PIX). */
  pix_tx_id?: string;
}

export interface StockMovementInput {
  product_id: string;
  type: "entrada" | "saida" | "ajuste" | "venda" | "devolucao";
  quantity: number;
  unit_cost?: number;
  reason?: string;
  reference?: string;
}

export interface CashSessionSummary {
  id: string;
  is_open: boolean;
  opening_balance: number;
  terminal: string;
  opened_at: string;
  sales_count: number;
  total_dinheiro: number;
  total_debito: number;
  total_credito: number;
  total_pix: number;
  total_sangria: number;
  total_suprimento: number;
  total_vendas: number;
}

export interface SyncQueueItem {
  id: string;
  entity_type: "sale" | "stock_movement" | "cash_movement" | "fiscal_document" | "fiscal_contingency";
  payload: Record<string, unknown>;
  priority: number;
  retry_count: number;
  max_retries: number;
  status: "pending" | "syncing" | "synced" | "failed" | "conflict";
  error?: string;
  created_at: string;
  last_attempt_at?: string;
}
