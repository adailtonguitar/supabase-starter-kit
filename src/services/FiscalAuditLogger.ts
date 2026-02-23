/**
 * FiscalAuditLogger — Logs fiscal operations for audit trail.
 */
import { supabase } from "@/integrations/supabase/client";

interface FiscalAuditParams {
  companyId: string;
  action: string;
  details: Record<string, any>;
}

export function logFiscalAudit(params: FiscalAuditParams) {
  // Fire-and-forget audit log
  supabase
    .from("audit_logs" as any)
    .insert({
      company_id: params.companyId,
      action: params.action,
      details: params.details,
      created_at: new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) console.warn("Audit log failed:", error.message);
    });
}
