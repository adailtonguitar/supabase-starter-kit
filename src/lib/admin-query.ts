import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  adminActionLimiter,
  adminQueryLimiter,
  formatRetryAfter,
} from "@/lib/rate-limiter";

interface AdminQueryParams {
  table: string;
  select?: string;
  filters?: { op: string; column: string; value: any }[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  count_only?: boolean;
}

function notifyRateLimited(fn: string, retryAfterMs: number) {
  toast.error(
    `Muitas requisições para ${fn}. Tente novamente em ${formatRetryAfter(retryAfterMs)}.`,
    { id: `rl-${fn}`, duration: 4000 },
  );
  console.warn(`[rate-limit] ${fn} bloqueado por ${retryAfterMs}ms`);
}

function notifyServerRateLimited(fn: string) {
  toast.error(
    `Limite do servidor atingido para ${fn}. Aguarde um pouco antes de tentar de novo.`,
    { id: `rl-server-${fn}`, duration: 5000 },
  );
  console.warn(`[rate-limit:server] 429 em ${fn}`);
}

function isServer429(err: unknown): boolean {
  const e = err as { context?: { response?: { status?: number } }; status?: number };
  return e?.context?.response?.status === 429 || e?.status === 429;
}

export async function adminQuery<T = any>(params: AdminQueryParams): Promise<T[]> {
  const { allowed, retryAfterMs } = adminQueryLimiter.check("admin-query");
  if (!allowed) {
    notifyRateLimited("admin-query", retryAfterMs);
    return [];
  }

  try {
    const { data, error } = await supabase.functions.invoke("admin-query", {
      body: params,
    });
    if (error) {
      if (isServer429(error)) notifyServerRateLimited("admin-query");
      console.warn("[adminQuery] edge error:", error.message || error);
      return [];
    }
    if (data?.error) {
      console.warn("[adminQuery] data error:", data.error);
      return [];
    }
    return data?.data ?? [];
  } catch (e) {
    console.warn("[adminQuery] caught:", e);
    return [];
  }
}

export async function adminCount(
  table: string,
  filters?: AdminQueryParams["filters"],
): Promise<number> {
  const { allowed, retryAfterMs } = adminQueryLimiter.check("admin-query");
  if (!allowed) {
    notifyRateLimited("admin-query", retryAfterMs);
    return 0;
  }

  try {
    const { data, error } = await supabase.functions.invoke("admin-query", {
      body: { table, count_only: true, filters },
    });
    if (error) return 0;
    return data?.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Invoca a Edge Function `admin-action` com rate limit e tratamento de erro
 * padronizado. Use sempre este helper em vez de `supabase.functions.invoke("admin-action", ...)`
 * direto — garante proteção contra flood e UX consistente.
 *
 * Exemplo:
 *   const { ok, data, error } = await adminAction({
 *     action: "toggle_block_company",
 *     company_id,
 *     is_blocked: true,
 *   });
 */
export interface AdminActionResult<T = unknown> {
  ok: boolean;
  data: T | null;
  error: string | null;
  rateLimited?: boolean;
}

export async function adminAction<T = unknown>(
  body: Record<string, unknown>,
): Promise<AdminActionResult<T>> {
  const actionKey = typeof body.action === "string" ? body.action : "unknown";
  const { allowed, retryAfterMs } = adminActionLimiter.check(`action:${actionKey}`);
  if (!allowed) {
    notifyRateLimited(`admin-action:${actionKey}`, retryAfterMs);
    return { ok: false, data: null, error: "rate_limited", rateLimited: true };
  }

  try {
    const { data, error } = await supabase.functions.invoke("admin-action", { body });
    if (error) {
      if (isServer429(error)) {
        notifyServerRateLimited(`admin-action:${actionKey}`);
        return { ok: false, data: null, error: "rate_limited", rateLimited: true };
      }
      return { ok: false, data: null, error: error.message || "edge_error" };
    }
    const payload = (data ?? {}) as Record<string, unknown>;
    if (typeof payload.error === "string" && payload.error.length > 0) {
      return { ok: false, data: null, error: payload.error };
    }
    return { ok: true, data: (payload as unknown) as T, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "caught_error";
    return { ok: false, data: null, error: msg };
  }
}
