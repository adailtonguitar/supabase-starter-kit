/**
 * Wrapper enxuto de analytics sobre o gtag.js injetado em index.html.
 *
 * Objetivos:
 * - Nunca lançar se o gtag não carregou (bloqueador de anúncios, rede ruim).
 * - Centralizar nomes de eventos para manter consistência no GA4.
 * - Permitir disparar page_view manual em SPAs (send_page_view está off).
 *
 * Uso:
 *   trackEvent("cta_click", { location: "hero", cta: "start_trial" });
 *   trackPageView("/planos");
 */

const MEASUREMENT_ID = "G-YQCQ2JSS8C";

type GtagFn = (
  command: "event" | "config" | "set" | "consent" | "js",
  // biome-ignore lint/suspicious/noExplicitAny: gtag tipa assim mesmo
  action: string | Date | Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: idem
  params?: Record<string, any>,
) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    // biome-ignore lint/suspicious/noExplicitAny: dataLayer é any-typed pelo gtag
    dataLayer?: any[];
  }
}

function hasGtag(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

/**
 * Dispara um evento custom pro GA4. Se o gtag não tiver carregado
 * (adblock, offline) falha silenciosamente — nunca quebra a UX.
 */
export function trackEvent(
  eventName: string,
  params: Record<string, unknown> = {},
): void {
  if (!hasGtag()) return;
  try {
    window.gtag!("event", eventName, params);
  } catch {
    // noop
  }
}

/**
 * Dispara page_view manual. Usado pelo hook de rota (App.tsx)
 * porque habilitamos `send_page_view: false` no gtag config.
 */
export function trackPageView(pathname: string, title?: string): void {
  if (!hasGtag()) return;
  try {
    window.gtag!("event", "page_view", {
      page_path: pathname,
      page_title: title ?? document.title,
      page_location: window.location.href,
    });
  } catch {
    // noop
  }
}

/**
 * Atualiza consentimento em runtime. Quando o banner de cookies
 * LGPD for implementado, chamar com `{ analytics: true|false }`.
 */
export function updateConsent(granted: boolean): void {
  if (!hasGtag()) return;
  try {
    window.gtag!("consent", "update", {
      analytics_storage: granted ? "granted" : "denied",
    });
  } catch {
    // noop
  }
}

/**
 * Associa um user_id ao GA4. Chamar após login.
 * Não envia PII — apenas o ID opaco do Supabase.
 */
export function identifyUser(userId: string | null): void {
  if (!hasGtag()) return;
  try {
    window.gtag!("config", MEASUREMENT_ID, {
      user_id: userId ?? undefined,
    });
  } catch {
    // noop
  }
}
