/**
 * FiscalAuditLogger — Logs fiscal operations for audit trail.
 * Now uses the unified action_logs table.
 */
import { logAction } from "@/services/ActionLogger";

interface FiscalAuditParams {
  companyId: string;
  action: string;
  details: Record<string, any>;
}

export function logFiscalAudit(params: FiscalAuditParams) {
  logAction({
    companyId: params.companyId,
    action: params.action,
    module: "fiscal",
    details: JSON.stringify(params.details),
  });
}
