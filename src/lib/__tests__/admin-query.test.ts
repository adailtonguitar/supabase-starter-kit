import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock do supabase-client: controlamos invoke por teste
const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

// Mock do toast pra interceptar chamadas
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}));

// Reset dos limiters entre testes (módulo usa singleton adminActionLimiter)
import { adminActionLimiter, adminQueryLimiter } from "@/lib/rate-limiter";
import { adminAction, adminQuery, adminCount } from "@/lib/admin-query";

beforeEach(() => {
  invoke.mockReset();
  toastError.mockReset();
  adminActionLimiter.reset();
  adminQueryLimiter.reset();
});

describe("adminAction", () => {
  it("retorna ok: true com data do edge em caso de sucesso", async () => {
    invoke.mockResolvedValueOnce({
      data: { some: "value", nested: 1 },
      error: null,
    });

    const result = await adminAction<{ some: string }>({
      action: "noop",
      foo: "bar",
    });

    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(invoke).toHaveBeenCalledWith("admin-action", {
      body: { action: "noop", foo: "bar" },
    });
  });

  it("propaga payload.error do edge como ok: false", async () => {
    invoke.mockResolvedValueOnce({
      data: { error: "usuário não encontrado" },
      error: null,
    });

    const result = await adminAction({ action: "x" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("usuário não encontrado");
  });

  it("retorna rate_limited quando o limiter local bloqueia", async () => {
    // Satura o limiter (20/60s) antes de chamar
    for (let i = 0; i < 20; i++) {
      adminActionLimiter.check("action:flood");
    }

    const result = await adminAction({ action: "flood" });
    expect(result.ok).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(result.error).toBe("rate_limited");
    expect(invoke).not.toHaveBeenCalled(); // nem tocou no backend
    expect(toastError).toHaveBeenCalled(); // mostrou toast
  });

  it("detecta 429 do servidor e marca rateLimited", async () => {
    // Erro do invoke com status 429 vindo do edge
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge Function returned non-2xx",
        context: { response: { status: 429 } },
      },
    });

    const result = await adminAction({ action: "any" });
    expect(result.ok).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(toastError).toHaveBeenCalled();
  });

  it("trata erro genérico do edge sem marcar rateLimited", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "boom",
        context: { response: { status: 500 } },
      },
    });

    const result = await adminAction({ action: "any" });
    expect(result.ok).toBe(false);
    expect(result.rateLimited).toBeUndefined();
    expect(result.error).toBe("boom");
  });

  it("captura exceptions do invoke sem quebrar", async () => {
    invoke.mockRejectedValueOnce(new Error("network down"));
    const result = await adminAction({ action: "any" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network down");
  });
});

describe("adminQuery", () => {
  it("retorna array vazio se limiter bloquear", async () => {
    for (let i = 0; i < 60; i++) adminQueryLimiter.check("admin-query");
    const rows = await adminQuery({ table: "companies" });
    expect(rows).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("retorna data.data do edge em caso de sucesso", async () => {
    invoke.mockResolvedValueOnce({
      data: { data: [{ id: "1" }, { id: "2" }] },
      error: null,
    });
    const rows = await adminQuery<{ id: string }>({ table: "companies" });
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("1");
  });

  it("retorna [] se edge retornar erro", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    const rows = await adminQuery({ table: "companies" });
    expect(rows).toEqual([]);
  });

  it("retorna [] e avisa quando é 429 server-side", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "rl",
        context: { response: { status: 429 } },
      },
    });
    const rows = await adminQuery({ table: "companies" });
    expect(rows).toEqual([]);
    expect(toastError).toHaveBeenCalled();
  });
});

describe("adminCount", () => {
  it("retorna 0 quando limiter bloqueia", async () => {
    for (let i = 0; i < 60; i++) adminQueryLimiter.check("admin-query");
    const c = await adminCount("companies");
    expect(c).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("retorna data.count do edge", async () => {
    invoke.mockResolvedValueOnce({ data: { count: 42 }, error: null });
    const c = await adminCount("companies");
    expect(c).toBe(42);
  });

  it("retorna 0 em erro do edge", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: { message: "fail" },
    });
    const c = await adminCount("companies");
    expect(c).toBe(0);
  });
});
