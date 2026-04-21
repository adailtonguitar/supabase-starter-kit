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

import { supabase } from "@/integrations/supabase/client";

export interface VitalsSnapshot {
  LCP?: number;  // Largest Contentful Paint (ms)
  FCP?: number;  // First Contentful Paint (ms)
  CLS?: number;  // Cumulative Layout Shift (unitless)
  INP?: number;  // Interaction to Next Paint (ms)
  TTFB?: number; // Time to First Byte (ms)
}

const vitals: VitalsSnapshot = {};

// id efêmero da sessão (não persiste): dedup e contagem de sessões únicas
const SESSION_ID = Math.random().toString(36).slice(2, 10);

let flushed = false;

export function getVitalsSnapshot(): VitalsSnapshot {
  return { ...vitals };
}

/**
 * Envia os vitals atuais pra tabela web_vitals_samples. Sem amostragem porque:
 *   - chamamos 1x por sessão (no visibilitychange=hidden)
 *   - retenção é 30d via purge_old_logs
 *   - volume esperado: 1 linha por sessão
 */
async function flushVitals(): Promise<void> {
  if (flushed) return;
  if (typeof window === "undefined") return;
  flushed = true;

  const snap = getVitalsSnapshot();
  // Se não coletamos nenhum vital ainda, não vale mandar
  if (
    snap.LCP == null &&
    snap.FCP == null &&
    snap.CLS == null &&
    snap.INP == null &&
    snap.TTFB == null
  ) return;

  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;

    const nav = navigator as Navigator & {
      connection?: { effectiveType?: string };
    };

    const row = {
      user_id: userId,
      session_id: SESSION_ID,
      page: window.location.pathname || "/",
      lcp: snap.LCP ?? null,
      fcp: snap.FCP ?? null,
      cls: snap.CLS ?? null,
      inp: snap.INP ?? null,
      ttfb: snap.TTFB ?? null,
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      connection: nav.connection?.effectiveType ?? null,
      url: window.location.href.slice(0, 500),
      user_agent: navigator.userAgent?.slice(0, 300) ?? null,
    };

    // fire-and-forget — não bloqueia unload
    await supabase.from("web_vitals_samples").insert(row);
  } catch (err) {
    console.warn("[WebVitals] flush failed:", err);
  }
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

  // Flush na saída da página (ou quando a aba some). É o momento mais "final"
  // que dá pra confiar para LCP/CLS/INP já estarem estáveis.
  const maybeFlush = () => {
    if (document.visibilityState === "hidden") {
      void flushVitals();
    }
  };
  document.addEventListener("visibilitychange", maybeFlush, { once: false });
  window.addEventListener("pagehide", () => void flushVitals(), { once: true });
}
