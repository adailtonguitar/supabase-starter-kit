/**
 * Coleta simples de Web Vitals (LCP, CLS, INP, FCP, TTFB) via PerformanceObserver.
 *
 * Zero dependência externa — evita bundle extra e custo por evento.
 * Objetivo: anexar um snapshot desses números ao `metadata` de cada erro
 * enviado pelo ErrorTracker, pra correlacionar "erro X acontece quando LCP
 * está acima de 4s" ou "CLS crítico na rota /pdv".
 *
 * Nota: não tenta ser tão preciso quanto o pacote `web-vitals` oficial.
 * Se no futuro precisarmos de métricas certificadas pelo CrUX, trocamos.
 */

export interface VitalsSnapshot {
  LCP?: number;  // Largest Contentful Paint (ms)
  FCP?: number;  // First Contentful Paint (ms)
  CLS?: number;  // Cumulative Layout Shift (unitless)
  INP?: number;  // Interaction to Next Paint (ms)
  TTFB?: number; // Time to First Byte (ms)
}

const vitals: VitalsSnapshot = {};

export function getVitalsSnapshot(): VitalsSnapshot {
  return { ...vitals };
}

function safeObserve(
  types: string[],
  handler: (entry: PerformanceEntry) => void,
  opts: PerformanceObserverInit = {},
): void {
  try {
    const supported = typeof PerformanceObserver !== "undefined";
    if (!supported) return;
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) handler(entry);
    });
    for (const type of types) {
      try {
        po.observe({ type, buffered: true, ...opts });
      } catch {
        // tipo não suportado neste browser — ignora silenciosamente
      }
    }
  } catch (e) {
    console.warn("[WebVitals] observer failed:", e);
  }
}

export function initWebVitals(): void {
  if (typeof window === "undefined") return;

  // TTFB via Navigation Timing
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav) vitals.TTFB = Math.max(0, nav.responseStart - nav.requestStart);
  } catch {
    // ignore
  }

  // LCP — pega o último (o maior nas páginas normais)
  safeObserve(["largest-contentful-paint"], (entry) => {
    vitals.LCP = Math.round((entry as any).renderTime || entry.startTime);
  });

  // FCP
  safeObserve(["paint"], (entry) => {
    if (entry.name === "first-contentful-paint") {
      vitals.FCP = Math.round(entry.startTime);
    }
  });

  // CLS — soma dos layout shifts sem user input
  safeObserve(["layout-shift"], (entry) => {
    const e = entry as any;
    if (!e.hadRecentInput) {
      vitals.CLS = (vitals.CLS ?? 0) + e.value;
    }
  });

  // INP — aproximação: pega o maior duration de event entries com interactionId
  safeObserve(["event"], (entry) => {
    const e = entry as any;
    if (!e.interactionId) return;
    const dur = Math.round(e.duration);
    if (vitals.INP == null || dur > vitals.INP) {
      vitals.INP = dur;
    }
  });
}
