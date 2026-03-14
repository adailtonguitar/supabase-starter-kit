/**
 * ActionLogger — Centralized audit trail for all critical operations.
 * Writes to the `action_logs` table with structured diff, retry, and session metadata.
 */
import { supabase } from "@/integrations/supabase/client";

export type ActionModule =
  | "vendas"
  | "estoque"
  | "financeiro"
  | "clientes"
  | "fornecedores"
  | "funcionarios"
  | "produtos"
  | "fiscal"
  | "caixa"
  | "auth"
  | "configuracoes"
  | "usuarios"
  | "filiais"
  | "promocoes"
  | "orcamentos"
  | "admin";

export interface DiffEntry {
  field: string;
  from: any;
  to: any;
}

interface LogActionParams {
  companyId: string;
  userId?: string | null;
  action: string;
  module: ActionModule;
  details?: string | null;
  /** Structured diff: what changed (field, old value, new value) */
  diff?: DiffEntry[] | null;
}

/**
 * Build a diff array by comparing two objects.
 * Only includes fields that actually changed.
 */
export function buildDiff(before: Record<string, any>, after: Record<string, any>, fields?: string[]): DiffEntry[] {
  const keys = fields || [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changes: DiffEntry[] = [];
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push({ field: key, from: a ?? null, to: b ?? null });
    }
  }
  return changes;
}

/** Collect browser/session metadata */
function getSessionMeta(): Record<string, string> {
  try {
    return {
      user_agent: navigator.userAgent || "",
      language: navigator.language || "",
      platform: (navigator as any).userAgentData?.platform || navigator.platform || "",
      screen: `${screen.width}x${screen.height}`,
    };
  } catch {
    return {};
  }
}

const MAX_RETRIES = 2;
const RETRY_DELAY = 1500;

/**
 * Fire-and-forget action log with retry and session metadata. Never throws.
 */
export function logAction(params: LogActionParams) {
  if (!params.companyId) return;

  const meta = getSessionMeta();
  const payload: Record<string, any> = {};
  if (params.details) payload.text = params.details;
  if (params.diff && params.diff.length > 0) payload.diff = params.diff;
  if (Object.keys(meta).length > 0) payload.meta = meta;

  const detailsStr = Object.keys(payload).length > 0 ? JSON.stringify(payload) : params.details || null;

  const doInsert = (attempt: number) => {
    supabase
      .from("action_logs")
      .insert({
        company_id: params.companyId,
        user_id: params.userId || null,
        action: params.action,
        module: params.module,
        details: detailsStr,
      })
      .then(({ error }) => {
        if (error) {
          console.warn(`[ActionLogger] attempt ${attempt + 1} failed:`, error.message);
          if (attempt < MAX_RETRIES) {
            setTimeout(() => doInsert(attempt + 1), RETRY_DELAY * (attempt + 1));
          }
        }
      });
  };

  doInsert(0);
}
