/**
 * Circuit Breaker + Timeout utility for external API calls.
 *
 * States:
 *  - CLOSED: requests flow normally
 *  - OPEN: requests are rejected immediately (fail-fast)
 *  - HALF_OPEN: one probe request is allowed to test recovery
 *
 * Usage:
 *   const fiscalBreaker = new CircuitBreaker("fiscal", { timeout: 10000 });
 *   const result = await fiscalBreaker.call(() => supabase.functions.invoke("emit-nfce", { body }));
 */

export interface CircuitBreakerOptions {
  /** Max consecutive failures before opening the circuit (default: 3) */
  failureThreshold?: number;
  /** Time in ms before moving from OPEN → HALF_OPEN (default: 60000 = 1 min) */
  resetTimeout?: number;
  /** Request timeout in ms — rejects if call takes longer (default: 15000 = 15s) */
  timeout?: number;
}

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private lastFailureTime = 0;
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly timeout: number;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetTimeout = options.resetTimeout ?? 60_000;
    this.timeout = options.timeout ?? 15_000;
  }

  get currentState(): CircuitState {
    if (this.state === "OPEN") {
      // Check if reset timeout has elapsed → move to HALF_OPEN
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = "HALF_OPEN";
      }
    }
    return this.state;
  }

  get isOpen(): boolean {
    return this.currentState === "OPEN";
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.currentState;

    if (state === "OPEN") {
      throw new CircuitBreakerOpenError(
        `[CircuitBreaker:${this.name}] Circuit OPEN — ${Math.ceil((this.resetTimeout - (Date.now() - this.lastFailureTime)) / 1000)}s until retry`,
        this.name
      );
    }

    try {
      const result = await withTimeout(fn(), this.timeout, this.name);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = "CLOSED";
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      console.warn(`[CircuitBreaker:${this.name}] Circuit OPENED after ${this.failures} failures. Will retry in ${this.resetTimeout / 1000}s`);
    }
  }

  /** Manually reset the circuit (e.g., when user clicks "retry") */
  reset() {
    this.state = "CLOSED";
    this.failures = 0;
    // console.log(`[CircuitBreaker:${this.name}] Manually reset to CLOSED`);
  }
}

export class CircuitBreakerOpenError extends Error {
  readonly circuitName: string;
  constructor(message: string, circuitName: string) {
    super(message);
    this.name = "CircuitBreakerOpenError";
    this.circuitName = circuitName;
  }
}

export class TimeoutError extends Error {
  constructor(name: string, timeoutMs: number) {
    super(`[Timeout:${name}] Request timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/** Race a promise against a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(name, ms)), ms);
    promise
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

// ── Singleton instances for key external services ──

/** Circuit breaker for Nuvem Fiscal / SEFAZ emission */
export const fiscalCircuitBreaker = new CircuitBreaker("fiscal", {
  failureThreshold: 3,
  resetTimeout: 60_000,   // 1 min cooldown
  timeout: 45_000,        // 45s per request (Sandbox + auto-register can be slow)
});

/** Circuit breaker for TEF / payment gateway */
export const tefCircuitBreaker = new CircuitBreaker("tef", {
  failureThreshold: 2,
  resetTimeout: 30_000,   // 30s cooldown
  timeout: 30_000,        // 30s (payments can be slow)
});

/** Circuit breaker for AI / OpenAI calls */
export const aiCircuitBreaker = new CircuitBreaker("ai", {
  failureThreshold: 3,
  resetTimeout: 120_000,  // 2 min cooldown
  timeout: 30_000,        // 30s
});
