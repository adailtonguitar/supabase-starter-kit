/**
 * Supabase Database Types — hand-maintained based on actual schema usage.
 *
 * Run `supabase gen types typescript` against a live DB to regenerate automatically.
 * Until then, this file provides real type safety for all known tables.
 */

// ── Utility types ──────────────────────────────────────────────────────
type UUID = string;
type ISODate = string;
type ISODateTime = string;
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Auto-generated columns omitted from Insert */
type AutoCols = "id" | "created_at" | "updated_at";

/**
 * Helper: coerce interface into index-signature-compatible form
 * required by Supabase's GenericTable constraint (Record<string, unknown>).
 */
type Widen<T> = { [K in keyof T]: T[K] } & Record<string, unknown>;

/** Helper: build Table shape from Row */
type TableDef<R extends object> = {
  Row: Widen<R>;
  Insert: Widen<Omit<R, AutoCols> & Partial<Pick<R, Extract<keyof R, AutoCols>>>>;
  Update: Widen<Partial<R>>;
  Relationships: [];
};

// ── Enums ──────────────────────────────────────────────────────────────
export type PaymentMethod = "dinheiro" | "debito" | "credito" | "pix" | "voucher" | "outros" | "prazo";
export type CashMovementType = "abertura" | "venda" | "sangria" | "suprimento" | "estorno" | "fechamento";
export type FinancialEntryType = "pagar" | "receber";
export type FinancialEntryStatus = "pendente" | "pago" | "vencido" | "cancelado" | "parcial";
export type TransferStatus = "pending" | "in_transit" | "received" | "cancelled";
export type CompanyUserRole = "admin" | "gerente" | "supervisor" | "caixa";
export type AdminRole = "super_admin";

// ── Row types ──────────────────────────────────────────────────────────

export interface ActionLogRow {
  id: UUID;
  company_id: UUID;
  user_id: UUID | null;
  action: string;
  module: string;
  details: string | null;
  diff: Json | null;
  session_id: string | null;
  created_at: ISODateTime;
}

export interface AdminNotificationRow {
  id: UUID;
  title: string;
  message: string;
  type: string;
  target_role: string | null;
  target_company_id: UUID | null;
  created_at: ISODateTime;
}

export interface AdminRoleRow {
  id: UUID;
  user_id: UUID;
  role: AdminRole;
  created_at: ISODateTime;
}

export interface CardAdministratorRow {
  id: UUID;
  company_id: UUID;
  name: string;
  fee_debit: number | null;
  fee_credit: number | null;
  fee_credit_installment: number | null;
  settlement_days_debit: number | null;
  settlement_days_credit: number | null;
  notes: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface CarrierRow {
  id: UUID;
  company_id: UUID;
  name: string;
  cnpj: string | null;
  ie: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface CashMovementRow {
  id: UUID;
  company_id: UUID;
  session_id: UUID | null;
  type: CashMovementType;
  amount: number;
  performed_by: UUID;
  payment_method: PaymentMethod | null;
  description: string | null;
  sale_id: UUID | null;
  created_at: ISODateTime;
}

export interface CashSessionRow {
  id: UUID;
  company_id: UUID;
  terminal_id: string;
  status: string;
  opened_by: UUID;
  opened_at: ISODateTime;
  closed_at: ISODateTime | null;
  closed_by: UUID | null;
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
  created_at: ISODateTime;
}

export interface ClientRow {
  id: UUID;
  company_id: UUID;
  name: string;
  cpf_cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  loyalty_points: number;
  credit_balance: number;
  credit_limit: number | null;
  birth_date: ISODate | null;
  is_active: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface CompanyRow {
  id: UUID;
  name: string;
  trade_name: string | null;
  cnpj: string | null;
  ie: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  slogan: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  pix_city: string | null;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_complement: string | null;
  crt: string | null;
  is_demo: boolean;
  is_blocked: boolean;
  block_reason: string | null;
  parent_company_id: UUID | null;
  furniture_mode: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface CompanyPlanRow {
  id: UUID;
  company_id: UUID;
  plan: string;
  status: string;
  started_at: ISODateTime | null;
  expires_at: ISODateTime | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface CompanyUserRow {
  id: UUID;
  company_id: UUID;
  user_id: UUID;
  role: CompanyUserRole;
  is_active: boolean;
  created_at: ISODateTime;
}

export interface CostCenterRow {
  id: UUID;
  company_id: UUID;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: ISODateTime;
}

export interface DiscountLimitRow {
  id: UUID;
  company_id: UUID;
  role: string;
  max_discount_percent: number;
  created_at: ISODateTime;
}

export interface EmployeeRow {
  id: UUID;
  company_id: UUID;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  salary: number | null;
  commission_percent: number | null;
  admission_date: ISODate | null;
  is_active: boolean;
  notes: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface FinancialEntryRow {
  id: UUID;
  company_id: UUID;
  type: FinancialEntryType;
  description: string;
  category: string | null;
  reference: string | null;
  counterpart: string | null;
  amount: number;
  due_date: ISODate;
  paid_date: ISODate | null;
  paid_amount: number | null;
  payment_method: string | null;
  status: FinancialEntryStatus;
  notes: string | null;
  created_by: UUID;
  cost_center_id: UUID | null;
  recurrence: string | null;
  recurrence_end: ISODate | null;
  parent_entry_id: UUID | null;
  bank_account: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface FiscalAuditLogRow {
  id: UUID;
  company_id: UUID;
  event_type: string;
  document_id: UUID | null;
  sale_id: UUID | null;
  details: Json | null;
  created_at: ISODateTime;
}

export interface FiscalConfigRow {
  id: UUID;
  company_id: UUID;
  serie: string;
  next_number: number;
  environment: string;
  certificate_thumbprint: string | null;
  emissor_client_id: string | null;
  auto_emit: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface FiscalDocumentRow {
  id: UUID;
  company_id: UUID;
  sale_id: UUID | null;
  type: string;
  number: number | null;
  serie: string | null;
  status: string;
  access_key: string | null;
  xml_url: string | null;
  pdf_url: string | null;
  protocol: string | null;
  total_value: number | null;
  issued_by: UUID | null;
  customer_name: string | null;
  customer_cpf: string | null;
  rejection_reason: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface FiscalQueueRow {
  id: UUID;
  company_id: UUID;
  sale_id: UUID;
  status: string;
  attempts: number;
  last_error: string | null;
  processed_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface InventoryCountRow {
  id: UUID;
  company_id: UUID;
  name: string;
  status: string;
  started_at: ISODateTime;
  finished_at: ISODateTime | null;
  performed_by: UUID;
  notes: string | null;
  created_at: ISODateTime;
}

export interface InventoryCountItemRow {
  id: UUID;
  inventory_id: UUID;
  company_id: UUID;
  product_id: UUID;
  system_quantity: number;
  counted_quantity: number | null;
  difference: number;
  notes: string | null;
  counted_at: ISODateTime | null;
}

export interface LoyaltyConfigRow {
  id: UUID;
  company_id: UUID;
  points_per_real: number;
  min_redemption: number;
  reward_value: number;
  is_active: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface LoyaltyTransactionRow {
  id: UUID;
  company_id: UUID;
  client_id: UUID;
  type: string;
  points: number;
  balance_after: number;
  description: string;
  created_at: ISODateTime;
}

export interface NfeImportRow {
  id: UUID;
  company_id: UUID;
  access_key: string;
  supplier_name: string | null;
  total_value: number | null;
  items_count: number | null;
  imported_at: ISODateTime;
}

export interface NotificationReadRow {
  id: UUID;
  notification_id: UUID;
  user_id: UUID;
  read_at: ISODateTime;
}

export interface PriceHistoryRow {
  id: UUID;
  company_id: UUID;
  product_id: UUID;
  field_changed: string;
  old_value: number;
  new_value: number;
  source: string;
  changed_at: ISODateTime;
}

export interface ProductCategoryRow {
  id: UUID;
  company_id: UUID;
  name: string;
  description: string | null;
  created_at: ISODateTime;
}

export interface ProductLabelRow {
  id: UUID;
  company_id: UUID;
  product_id: UUID;
  status: string;
  created_at: ISODateTime;
}

export interface ProductLotRow {
  id: UUID;
  company_id: UUID;
  product_id: UUID;
  lot_number: string;
  manufacture_date: ISODate | null;
  expiry_date: ISODate | null;
  quantity: number;
  unit_cost: number | null;
  supplier: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ProductRow {
  id: UUID;
  company_id: UUID;
  name: string;
  sku: string;
  barcode: string | null;
  ncm: string | null;
  category: string | null;
  price: number;
  cost_price: number | null;
  stock_quantity: number;
  min_stock: number | null;
  reorder_point: number | null;
  unit: string;
  is_active: boolean;
  image_url: string | null;
  shelf_location: string | null;
  voltage: string | null;
  warranty_months: number | null;
  serial_number: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ProfileRow {
  id: UUID;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface PromotionRow {
  id: UUID;
  company_id: UUID;
  name: string;
  description: string | null;
  promo_type: string;
  discount_percent: number;
  fixed_price: number;
  buy_quantity: number;
  pay_quantity: number;
  scope: string;
  category_name: string | null;
  min_quantity: number;
  starts_at: ISODateTime;
  ends_at: ISODateTime | null;
  active_days: number[] | null;
  product_ids: string[] | null;
  is_active: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface PurchaseOrderRow {
  id: UUID;
  company_id: UUID;
  supplier_id: UUID | null;
  status: string;
  total: number;
  items: Json;
  notes: string | null;
  expected_date: ISODate | null;
  created_by: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface QuoteRow {
  id: UUID;
  company_id: UUID;
  client_id: UUID | null;
  client_name: string | null;
  items_json: Json;
  total: number;
  status: string;
  notes: string | null;
  valid_until: ISODate | null;
  created_by: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
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

export interface SaleRow {
  id: UUID;
  company_id: UUID;
  terminal_id: string;
  session_id: UUID;
  sale_number: number | null;
  subtotal: number;
  discount_percent: number;
  discount_value: number;
  total: number;
  status: string;
  payment_method: string | null;
  payments: Json | null;
  items: Json | null;
  sold_by: UUID | null;
  client_id: UUID | null;
  client_name: string | null;
  access_key: string | null;
  canceled_at: ISODateTime | null;
  canceled_by: UUID | null;
  cancel_reason: string | null;
  created_at: ISODateTime;
}

export interface StockMovementRow {
  id: UUID;
  company_id: UUID;
  product_id: UUID;
  type: string;
  quantity: number;
  reason: string | null;
  performed_by: UUID | null;
  created_by: UUID | null;
  reference_id: UUID | null;
  created_at: ISODateTime;
}

export interface StockTransferRow {
  id: UUID;
  from_company_id: UUID;
  to_company_id: UUID;
  status: TransferStatus;
  notes: string | null;
  created_by: UUID | null;
  received_by: UUID | null;
  created_at: ISODateTime;
  received_at: ISODateTime | null;
}

export interface StockTransferItemRow {
  id: UUID;
  transfer_id: UUID;
  product_id: UUID;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  unit_cost: number;
}

export interface SupplierRow {
  id: UUID;
  company_id: UUID;
  name: string;
  trade_name: string | null;
  cnpj: string | null;
  ie: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface SupportMessageRow {
  id: UUID;
  user_id: UUID;
  company_id: UUID;
  message: string;
  response: string | null;
  status: string;
  created_at: ISODateTime;
}

export interface SystemErrorRow {
  id: UUID;
  company_id: UUID;
  error_type: string;
  message: string;
  stack: string | null;
  context: Json | null;
  resolved: boolean;
  created_at: ISODateTime;
}

export interface TefConfigRow {
  id: UUID;
  company_id: UUID;
  provider: string;
  environment: string;
  merchant_id: string | null;
  api_key: string | null;
  terminal_id: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

// ── Database type ──────────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      action_logs: TableDef<ActionLogRow>;
      admin_notifications: TableDef<AdminNotificationRow>;
      admin_roles: TableDef<AdminRoleRow>;
      card_administrators: TableDef<CardAdministratorRow>;
      carriers: TableDef<CarrierRow>;
      cash_movements: TableDef<CashMovementRow>;
      cash_sessions: TableDef<CashSessionRow>;
      clients: TableDef<ClientRow>;
      companies: TableDef<CompanyRow>;
      company_plans: TableDef<CompanyPlanRow>;
      company_users: TableDef<CompanyUserRow>;
      cost_centers: TableDef<CostCenterRow>;
      discount_limits: TableDef<DiscountLimitRow>;
      employees: TableDef<EmployeeRow>;
      financial_entries: TableDef<FinancialEntryRow>;
      fiscal_audit_logs: TableDef<FiscalAuditLogRow>;
      fiscal_configs: TableDef<FiscalConfigRow>;
      fiscal_documents: TableDef<FiscalDocumentRow>;
      fiscal_queue: TableDef<FiscalQueueRow>;
      inventory_count_items: TableDef<InventoryCountItemRow>;
      inventory_counts: TableDef<InventoryCountRow>;
      loyalty_config: TableDef<LoyaltyConfigRow>;
      loyalty_transactions: TableDef<LoyaltyTransactionRow>;
      nfe_imports: TableDef<NfeImportRow>;
      notification_reads: TableDef<NotificationReadRow>;
      price_history: TableDef<PriceHistoryRow>;
      product_categories: TableDef<ProductCategoryRow>;
      product_labels: TableDef<ProductLabelRow>;
      product_lots: TableDef<ProductLotRow>;
      products: TableDef<ProductRow>;
      profiles: TableDef<ProfileRow>;
      promotions: TableDef<PromotionRow>;
      purchase_orders: TableDef<PurchaseOrderRow>;
      quotes: TableDef<QuoteRow>;
      sale_items: TableDef<SaleItemRow>;
      sales: TableDef<SaleRow>;
      stock_movements: TableDef<StockMovementRow>;
      stock_transfer_items: TableDef<StockTransferItemRow>;
      stock_transfers: TableDef<StockTransferRow>;
      suppliers: TableDef<SupplierRow>;
      support_messages: TableDef<SupportMessageRow>;
      system_errors: TableDef<SystemErrorRow>;
      tef_config: TableDef<TefConfigRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      payment_method: PaymentMethod;
      cash_movement_type: CashMovementType;
      financial_entry_type: FinancialEntryType;
      transfer_status: TransferStatus;
      company_user_role: CompanyUserRole;
      admin_role: AdminRole;
    };
    CompositeTypes: Record<string, never>;
  };
};

// ── Convenience re-exports ─────────────────────────────────────────────
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
