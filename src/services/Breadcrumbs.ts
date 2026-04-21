/**
 * Ring buffer de breadcrumbs (trilha de ações do usuário) mantido em memória.
 *
 * Objetivo: quando `trackError` captura um erro, anexa os últimos N passos
 * que o usuário fez — navegações, cliques importantes, chamadas de rede,
 * toasts — pra você saber o contexto sem precisar de session replay externo.
 *
 * In-memory apenas (limpa em refresh de página). Não substitui Sentry
 * session replay, mas cobre 80% dos casos de triagem por 0 de custo.
 */

export type BreadcrumbLevel = "info" | "warn" | "error";
export type BreadcrumbCategory =
  | "navigation"
  | "click"
  | "network"
  | "toast"
  | "auth"
  | "custom";

export interface Breadcrumb {
  ts: number;
  category: BreadcrumbCategory;
  level: BreadcrumbLevel;
  message: string;
  data?: Record<string, unknown>;
}

const MAX_BREADCRUMBS = 25;
const buffer: Breadcrumb[] = [];

export function addBreadcrumb(input: {
  category: BreadcrumbCategory;
  message: string;
  level?: BreadcrumbLevel;
  data?: Record<string, unknown>;
}): void {
  const b: Breadcrumb = {
    ts: Date.now(),
    category: input.category,
    level: input.level ?? "info",
    message: input.message.slice(0, 200),
    data: input.data,
  };
  buffer.push(b);
  if (buffer.length > MAX_BREADCRUMBS) buffer.shift();
}

export function getBreadcrumbs(): Breadcrumb[] {
  return buffer.slice();
}

export function clearBreadcrumbs(): void {
  buffer.length = 0;
}

/**
 * Instala listeners globais que populam breadcrumbs automaticamente:
 *   - navegação (popstate + pushState override)
 *   - cliques em botões com texto
 *   - mudanças de visibilidade
 *
 * Chamado 1x em main.tsx.
 */
export function initBreadcrumbAutoCapture(): void {
  if (typeof window === "undefined") return;

  try {
    // 1) Navegação: intercepta pushState/replaceState + popstate
    const origPush = history.pushState;
    history.pushState = function (...args: Parameters<typeof origPush>) {
      const url = typeof args[2] === "string" ? args[2] : window.location.pathname;
      addBreadcrumb({ category: "navigation", message: `→ ${url}` });
      return origPush.apply(this, args);
    };
    window.addEventListener("popstate", () => {
      addBreadcrumb({
        category: "navigation",
        message: `← ${window.location.pathname}`,
      });
    });

    // 2) Clicks em botões/links com texto curto
    document.addEventListener(
      "click",
      (e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const btn = target.closest("button, a, [role=button]") as HTMLElement | null;
        if (!btn) return;
        const label =
          (btn.getAttribute("aria-label") ||
            btn.textContent ||
            btn.getAttribute("title") ||
            "") // only first line
            .trim()
            .split("\n")[0]
            .slice(0, 60);
        if (!label) return;
        addBreadcrumb({
          category: "click",
          message: `click: ${label}`,
          data: { tag: btn.tagName.toLowerCase() },
        });
      },
      { capture: true, passive: true },
    );

    // 3) Visibilidade (detectar tab em background antes de erro)
    document.addEventListener("visibilitychange", () => {
      addBreadcrumb({
        category: "custom",
        message: `visibility: ${document.visibilityState}`,
      });
    });

    addBreadcrumb({ category: "custom", message: "breadcrumbs init ok" });
  } catch (e) {
    console.warn("[Breadcrumbs] init failed:", e);
  }
}
