/**
 * ActionLogger — Centralized audit trail for all critical operations.
 * Writes to the `action_logs` table (fire-and-forget).
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

interface LogActionParams {
  companyId: string;
  userId?: string | null;
  action: string;
  module: ActionModule;
  details?: string | null;
}

/**
 * Fire-and-forget action log. Never throws.
 */
export function logAction(params: LogActionParams) {
  if (!params.companyId) return;

  supabase
    .from("action_logs")
    .insert({
      company_id: params.companyId,
      user_id: params.userId || null,
      action: params.action,
      module: params.module,
      details: params.details || null,
    })
    .then(({ error }) => {
      if (error) console.warn("[ActionLogger]", error.message);
    });
}
