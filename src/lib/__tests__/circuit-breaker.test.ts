import { describe, it, expect, vi } from "vitest";
import { CircuitBreaker, CircuitBreakerOpenError, TimeoutError } from "../circuit-breaker";

describe("CircuitBreaker", () => {
  it("starts in CLOSED state", () => {
    const cb = new CircuitBreaker("test");
    expect(cb.currentState).toBe("CLOSED");
    expect(cb.isOpen).toBe(false);
  });

  it("passes through successful calls", async () => {
    const cb = new CircuitBreaker("test");
    const result = await cb.call(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.currentState).toBe("CLOSED");
  });

  it("opens after reaching failure threshold", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 2, timeout: 5000 });

    for (let i = 0; i < 2; i++) {
      await cb.call(() => Promise.reject(new Error("fail"))).catch(() => {});
    }

    expect(cb.currentState).toBe("OPEN");
    expect(cb.isOpen).toBe(true);
  });

  it("rejects immediately when OPEN", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 1, timeout: 5000 });
    await cb.call(() => Promise.reject(new Error("fail"))).catch(() => {});

    await expect(cb.call(() => Promise.resolve("ok"))).rejects.toThrow(CircuitBreakerOpenError);
  });

  it("transitions to HALF_OPEN after resetTimeout", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 1, resetTimeout: 100, timeout: 5000 });
    await cb.call(() => Promise.reject(new Error("fail"))).catch(() => {});
    expect(cb.currentState).toBe("OPEN");

    await new Promise((r) => setTimeout(r, 150));
    expect(cb.currentState).toBe("HALF_OPEN");
  });

  it("closes again after successful HALF_OPEN probe", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 1, resetTimeout: 50, timeout: 5000 });
    await cb.call(() => Promise.reject(new Error("fail"))).catch(() => {});

    await new Promise((r) => setTimeout(r, 80));
    expect(cb.currentState).toBe("HALF_OPEN");

    await cb.call(() => Promise.resolve("recovered"));
    expect(cb.currentState).toBe("CLOSED");
  });

  it("re-opens if HALF_OPEN probe fails", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 1, resetTimeout: 50, timeout: 5000 });
    await cb.call(() => Promise.reject(new Error("fail"))).catch(() => {});

    await new Promise((r) => setTimeout(r, 80));
    await cb.call(() => Promise.reject(new Error("still down"))).catch(() => {});
    expect(cb.currentState).toBe("OPEN");
  });

  it("manual reset works", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 1, timeout: 5000 });
    await cb.call(() => Promise.reject(new Error("fail"))).catch(() => {});
    expect(cb.isOpen).toBe(true);

    cb.reset();
    expect(cb.currentState).toBe("CLOSED");
    expect(cb.isOpen).toBe(false);
  });

  it("times out slow calls", async () => {
    const cb = new CircuitBreaker("test", { timeout: 100 });
    await expect(
      cb.call(() => new Promise((r) => setTimeout(() => r("slow"), 500)))
    ).rejects.toThrow(TimeoutError);
  });

  it("does not time out fast calls", async () => {
    const cb = new CircuitBreaker("test", { timeout: 1000 });
    const result = await cb.call(() => new Promise((r) => setTimeout(() => r("fast"), 50)));
    expect(result).toBe("fast");
  });
});
