import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createRateLimiter,
  formatRetryAfter,
} from "@/lib/rate-limiter";

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejeita capacity ou windowMs inválidos", () => {
    expect(() => createRateLimiter({ capacity: 0, windowMs: 1000 })).toThrow();
    expect(() => createRateLimiter({ capacity: 10, windowMs: 0 })).toThrow();
    expect(() => createRateLimiter({ capacity: -1, windowMs: 1000 })).toThrow();
  });

  it("permite até a capacity e então bloqueia", () => {
    const rl = createRateLimiter({ capacity: 3, windowMs: 10_000 });
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(true);
    const blocked = rl.check("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.current).toBe(3);
    expect(blocked.capacity).toBe(3);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("retryAfterMs decresce conforme o tempo passa", () => {
    const rl = createRateLimiter({ capacity: 2, windowMs: 10_000 });
    rl.check("x");
    rl.check("x");

    const at0 = rl.check("x");
    expect(at0.allowed).toBe(false);
    expect(at0.retryAfterMs).toBe(10_000);

    vi.advanceTimersByTime(4_000);
    const at4 = rl.check("x");
    expect(at4.retryAfterMs).toBe(6_000);

    vi.advanceTimersByTime(6_500);
    const at10 = rl.check("x");
    expect(at10.allowed).toBe(true); // janela deslizou
  });

  it("chaves diferentes têm contadores independentes", () => {
    const rl = createRateLimiter({ capacity: 1, windowMs: 10_000 });
    expect(rl.check("user-a").allowed).toBe(true);
    expect(rl.check("user-a").allowed).toBe(false);
    expect(rl.check("user-b").allowed).toBe(true);
  });

  it("reset(key) limpa só a chave; reset() limpa tudo", () => {
    const rl = createRateLimiter({ capacity: 1, windowMs: 10_000 });
    rl.check("a");
    rl.check("b");
    expect(rl.check("a").allowed).toBe(false);
    rl.reset("a");
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("b").allowed).toBe(false); // b ainda bloqueado

    rl.reset();
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("b").allowed).toBe(true);
  });

  it("peek retorna snapshot sem consumir slot", () => {
    const rl = createRateLimiter({ capacity: 5, windowMs: 10_000 });
    rl.check("z");
    rl.check("z");
    const snap = rl.peek("z");
    expect(snap.count).toBe(2);
    expect(snap.oldestAt).toBeGreaterThan(0);

    // peek não consumiu
    expect(rl.peek("z").count).toBe(2);
  });

  it("sliding window libera conforme eventos saem", () => {
    const rl = createRateLimiter({ capacity: 3, windowMs: 5_000 });

    rl.check("k");            // t=0
    vi.advanceTimersByTime(2_000);
    rl.check("k");            // t=2s
    vi.advanceTimersByTime(2_000);
    rl.check("k");            // t=4s — cheio
    expect(rl.check("k").allowed).toBe(false);

    // t=5.1s: o de t=0 saiu. tem 2 na janela.
    vi.advanceTimersByTime(1_100);
    expect(rl.check("k").allowed).toBe(true);
  });
});

describe("formatRetryAfter", () => {
  it("formata < 1s como 'menos de 1 segundo'", () => {
    expect(formatRetryAfter(0)).toBe("menos de 1 segundo");
    expect(formatRetryAfter(500)).toBe("menos de 1 segundo");
  });
  it("formata segundos < 60", () => {
    expect(formatRetryAfter(1_000)).toBe("1s");
    expect(formatRetryAfter(3_400)).toBe("4s");
    expect(formatRetryAfter(59_000)).toBe("59s");
  });
  it("formata minutos >= 60s", () => {
    expect(formatRetryAfter(60_000)).toBe("1min");
    expect(formatRetryAfter(180_000)).toBe("3min");
    expect(formatRetryAfter(65_000)).toBe("2min");
  });
});
