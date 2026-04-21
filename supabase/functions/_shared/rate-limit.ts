/**
 * Server-side rate limiter. Última defesa contra abuso de Edge Functions.
 *
 * Uso típico em uma Edge Function:
 *   const limit = await checkRateLimit(admin, `user:${userId}:admin-action`, 30, 60);
 *   if (!limit.allowed) return rateLimitResponse(limit, corsHeaders);
 *
 * Falhas na RPC (timeout, conexão) são tratadas como fail-open: preferimos
 * degradar o limiter a derrubar o produto. O abuso real persistente ainda
 * cai na próxima invocação (quando a RPC voltar) ou no rate limit da plataforma.
 */

// deno-lint-ignore-file no-explicit-any
type AdminClient = any;

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  capacity: number;
  retry_after_seconds: number;
}

/**
 * Verifica e consome 1 hit na janela deslizante. A função RPC é atômica:
 * contagem + insert no mesmo statement.
 */
export async function checkRateLimit(
  admin: AdminClient,
  key: string,
  capacity: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key,
      p_capacity: capacity,
      p_window_seconds: windowSeconds,
    });

    if (error || !data) {
      console.warn("[rate-limit] RPC failed, failing open:", error?.message);
      return { allowed: true, current: 0, capacity, retry_after_seconds: 0 };
    }

    return data as RateLimitResult;
  } catch (err) {
    console.warn("[rate-limit] threw, failing open:", err);
    return { allowed: true, current: 0, capacity, retry_after_seconds: 0 };
  }
}

/**
 * Response padronizada 429 com header Retry-After.
 * Passe o mesmo corsHeaders que a função usa no resto das responses.
 */
export function rateLimitResponse(
  result: RateLimitResult,
  corsHeaders: Record<string, string>,
): Response {
  const retry = Math.max(1, result.retry_after_seconds || 1);
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      message: `Muitas requisições. Tente novamente em ${retry}s.`,
      current: result.current,
      capacity: result.capacity,
      retry_after_seconds: retry,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retry),
      },
    },
  );
}
