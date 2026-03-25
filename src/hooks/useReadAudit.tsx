/**
 * useReadAudit — Logs page-level read access to sensitive data for LGPD compliance.
 * Fire-and-forget: never blocks rendering or throws.
 */
import { useEffect, useRef } from "react";
import { logAction, type ActionModule } from "@/services/ActionLogger";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";

interface ReadAuditOptions {
  module: ActionModule;
  /** Human-readable label for the data accessed, e.g. "Relatório Financeiro" */
  resource: string;
  /** Extra context (e.g. date filters, export type) */
  context?: Record<string, unknown>;
  /** If true, skip audit (e.g. data not yet loaded) */
  skip?: boolean;
}

/**
 * Logs a single "read_access" event when the component mounts (or when
 * `resource`/`context` changes meaningfully). Debounced to avoid duplicate
 * logs on fast re-renders.
 */
export function useReadAudit({ module, resource, context, skip }: ReadAuditOptions) {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const loggedRef = useRef<string | null>(null);

  useEffect(() => {
    if (skip || !companyId || !user?.id) return;

    // Deduplicate: same resource + context = same log
    const key = `${module}:${resource}:${JSON.stringify(context ?? {})}`;
    if (loggedRef.current === key) return;
    loggedRef.current = key;

    logAction({
      companyId,
      userId: user.id,
      action: `read_access:${resource}`,
      module,
      details: JSON.stringify({
        type: "read_audit",
        resource,
        ...(context ?? {}),
        timestamp: new Date().toISOString(),
      }),
    });
  }, [companyId, user?.id, module, resource, skip, context]);
}

/**
 * Imperative version for one-off actions (e.g. export button click).
 */
export function logReadAccess(params: {
  companyId: string;
  userId: string;
  module: ActionModule;
  resource: string;
  context?: Record<string, unknown>;
}) {
  logAction({
    companyId: params.companyId,
    userId: params.userId,
    action: `read_access:${params.resource}`,
    module: params.module,
    details: JSON.stringify({
      type: "read_audit",
      resource: params.resource,
      ...(params.context ?? {}),
      timestamp: new Date().toISOString(),
    }),
  });
}
