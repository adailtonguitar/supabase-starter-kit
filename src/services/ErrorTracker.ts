import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/database.types";
import { addBreadcrumb, getBreadcrumbs } from "@/services/Breadcrumbs";
import { getVitalsSnapshot } from "@/services/WebVitals";

type SystemErrorInsert = Database["public"]["Tables"]["system_errors"]["Insert"];

function getConnectionInfo(): Record<string, unknown> | null {
  try {
    const nav = navigator as unknown as {
      connection?: {
        effectiveType?: string;
        downlink?: number;
        rtt?: number;
        saveData?: boolean;
      };
    };
    const c = nav.connection;
    if (!c) return null;
    return {
      effectiveType: c.effectiveType,
      downlink: c.downlink,
      rtt: c.rtt,
      saveData: c.saveData,
    };
  } catch {
    return null;
  }
}

function getDeviceInfo(): { browser: string; device: string } {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android/i.test(ua);
  const browser = /Edg/.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Other";
  const os = /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : "Unknown";
  return {
    browser: `${browser}`,
    device: `${isMobile ? "Mobile" : "Desktop"} - ${os}`,
  };
}

let _userId: string | null = null;
let _userEmail: string | null = null;

// Cache user info to avoid async calls during error handling
export function setErrorTrackerUser(userId: string | null, email: string | null) {
  _userId = userId;
  _userEmail = email;
}

// Debounce to avoid flooding
let lastError = "";
let lastErrorTime = 0;

export async function trackError(opts: {
  page?: string;
  action?: string;
  error: unknown;
}): Promise<{ supportCode: string | null }> {
  try {
    const message = opts.error instanceof Error ? opts.error.message : String(opts.error);
    const stack = opts.error instanceof Error ? opts.error.stack?.slice(0, 2000) || "" : "";

    const now = Date.now();
    if (message === lastError && now - lastErrorTime < 5000) {
      return { supportCode: null };
    }
    lastError = message;
    lastErrorTime = now;

    if (
      message.includes("ResizeObserver") ||
      message.includes("Loading chunk") ||
      (message.includes("requested version") && message.includes("existing version")) ||
      (message.includes("memberProbe") && message.includes("not defined"))
    ) {
      return { supportCode: null };
    }

    const { browser, device } = getDeviceInfo();
    const page = opts.page || window.location.pathname;

    // Contexto estruturado para triagem: breadcrumbs (até 25 passos) +
    // web vitals no momento da captura + viewport + conexão.
    const metadata: Record<string, unknown> = {
      breadcrumbs: getBreadcrumbs(),
      web_vitals: getVitalsSnapshot(),
      viewport: {
        w: window.innerWidth,
        h: window.innerHeight,
        dpr: window.devicePixelRatio ?? 1,
      },
      connection: getConnectionInfo(),
      url: window.location.href,
      captured_at: new Date().toISOString(),
    };

    const row: SystemErrorInsert = {
      user_id: _userId,
      user_email: _userEmail,
      page,
      action: opts.action || "",
      error_message: message,
      error_stack: stack,
      browser,
      device,
      metadata,
    };

    const { data, error: insertError } = await supabase
      .from("system_errors")
      .insert(row)
      .select("*")
      .single();

    if (insertError) {
      console.warn("[ErrorTracker] Failed to log error:", insertError.message);
      return { supportCode: null };
    }
    const record = data as unknown as Record<string, unknown> | null;
    const supportCode = record && typeof record["support_code"] === "string"
      ? (record["support_code"] as string)
      : null;
    return { supportCode };
  } catch (e) {
    console.warn("[ErrorTracker] Exception:", e);
    return { supportCode: null };
  }
}

declare global {
  interface Window {
    /** Debug: dispara um erro de teste para validar `system_errors` (somente dev). */
    __testError?: () => void;
  }
}

// Global handlers
export function initErrorTracker() {
  window.addEventListener("error", (event) => {
    addBreadcrumb({
      category: "custom",
      level: "error",
      message: `window.onerror: ${event.message?.slice(0, 80) ?? "?"}`,
    });
    trackError({
      action: "window.onerror",
      error: event.error || event.message,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    addBreadcrumb({
      category: "custom",
      level: "error",
      message: "unhandledrejection",
    });
    trackError({
      action: "unhandledrejection",
      error: event.reason,
    });
  });

  // Expose test function for debugging
  window.__testError = () => {
    void trackError({
      action: "manual_test",
      error: new Error("Teste manual de erro do sistema"),
    }).then(() => { /* test error sent */ });
  };
}
