/**
 * fiscal-audit-store — Persistência local dos eventos.
 * DEPRECATED: Local audit store disabled.
 */

export interface FiscalAuditEvent {
  produto_id: string | null;
  cfop_atual: string | null;
  cfop_sugerido: string | null;
  applied: boolean;
  applied_fields: string[];
  skipped_fields: string[];
  divergences: Array<{ field: string; current: any; suggested: any }>;
  reason: string;
  timestamp: string;
}

export interface FiscalAuditStats {
  total: number;
  auto_apply_rate: number;
  divergence_rate: number;
  fallback_rate: number;
  top_skipped_fields: Array<{ field: string; count: number }>;
  top_cfop_errors: Array<{ key: string; current: string; suggested: string; count: number }>;
  status: "READY" | "STABLE" | "RISK" | "NO_DATA";
  status_label: string;
}

export function recordFiscalAuditEvent(ev: any): void {
  // No-op
}

export function readFiscalAuditEvents(): FiscalAuditEvent[] {
  return [];
}

export function clearFiscalAuditEvents(): void {
  // No-op
}

export function getFiscalAuditStats(): FiscalAuditStats {
  return {
    total: 0,
    auto_apply_rate: 0,
    divergence_rate: 0,
    fallback_rate: 0,
    top_skipped_fields: [],
    top_cfop_errors: [],
    status: "NO_DATA",
    status_label: "SEM DADOS",
  };
}
