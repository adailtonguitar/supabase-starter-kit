/**
 * Rate limiter in-memory (janela deslizante) para proteger Edge Functions
 * do lado do cliente. NÃO é segurança — é flood prevention: evita loops
 * acidentais no frontend derrubarem o quota de Edge Functions ou DB.
 *
 * Segurança real continua sendo por RLS + super_admin guard no backend.
 *
 * Exemplo:
 *   const rl = createRateLimiter({ capacity: 60, windowMs: 60_000 });
 *   const { allowed, retryAfterMs } = rl.check("admin-query");
 *   if (!allowed) return [];
 */

export interface RateLimiterOptions {
  /** Máximo de eventos permitidos dentro da janela. */
  capacity: number;
  /** Tamanho da janela deslizante em ms. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Quantos ms até liberar 1 slot, se negado. 0 se allowed. */
  retryAfterMs: number;
  /** Eventos atualmente na janela. */
  current: number;
  /** Capacidade configurada. */
  capacity: number;
}

export interface RateLimiter {
  check(key?: string): RateLimitResult;
  /** Limpa contador de uma chave (ou todas se omitido). */
  reset(key?: string): void;
  /** Snapshot pra debug / admin UI. */
  peek(key?: string): { count: number; oldestAt: number | null };
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { capacity, windowMs } = opts;
  if (capacity <= 0 || windowMs <= 0) {
    throw new Error("rate-limiter: capacity e windowMs precisam ser > 0");
  }

  // key -> timestamps (ms) dos últimos eventos dentro da janela
  const buckets = new Map<string, number[]>();

  function prune(key: string, now: number): number[] {
    const arr = buckets.get(key) ?? [];
    const cutoff = now - windowMs;
    let i = 0;
    while (i < arr.length && arr[i] < cutoff) i++;
    const pruned = i === 0 ? arr : arr.slice(i);
    if (pruned !== arr) buckets.set(key, pruned);
    return pruned;
  }

  return {
    check(key = "default"): RateLimitResult {
      const now = Date.now();
      const arr = prune(key, now);
      if (arr.length >= capacity) {
        const oldest = arr[0];
        const retryAfterMs = Math.max(0, oldest + windowMs - now);
        return { allowed: false, retryAfterMs, current: arr.length, capacity };
      }
      arr.push(now);
      buckets.set(key, arr);
      return { allowed: true, retryAfterMs: 0, current: arr.length, capacity };
    },
    reset(key?: string) {
      if (key == null) buckets.clear();
      else buckets.delete(key);
    },
    peek(key = "default") {
      const arr = prune(key, Date.now());
      return { count: arr.length, oldestAt: arr[0] ?? null };
    },
  };
}

/**
 * Limiters compartilhados para as Edge Functions críticas do admin.
 * Escopo: por aba (in-memory). 2 abas abertas = 2 buckets independentes,
 * mas o servidor ainda tem RLS + guards. O objetivo aqui é proteger
 * contra loops acidentais no próprio código.
 */

// admin-query: leitura, mais tolerante (1 req/s sustentado, bursts de até 60)
export const adminQueryLimiter = createRateLimiter({
  capacity: 60,
  windowMs: 60_000,
});

// admin-action: mutação, mais conservador (1 ação a cada ~3s sustentado)
export const adminActionLimiter = createRateLimiter({
  capacity: 20,
  windowMs: 60_000,
});

/**
 * Helper pra formatar mensagem amigável quando rate limit é atingido.
 */
export function formatRetryAfter(ms: number): string {
  if (ms < 1000) return "menos de 1 segundo";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  return `${m}min`;
}
