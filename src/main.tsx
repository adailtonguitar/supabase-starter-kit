import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/theme.css";
import { loadScaleConfigFromStorage } from "./lib/scale-barcode";
import { initErrorTracker } from "./services/ErrorTracker";
import { assertProductionEnvironment } from "./lib/production-guard";
import { SUPABASE_URL, supabase } from "./integrations/supabase/client";

// Bloqueia execução em publish do Lovable e/ou Supabase incorreto em produção
assertProductionEnvironment(SUPABASE_URL);
console.log("SUPABASE CLIENT OK", supabase);

async function clearStaleServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;

  const isLovablePreview =
    window.location.hostname.includes("lovable.app") &&
    window.location.hostname.includes("id-preview--");

  try {
    // In preview, always unregister everything
    if (isLovablePreview) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(registrations.map((r) => r.unregister()));
    }

    // Always clean up outdated caches (fixes "version (1) < version (2)" errors)
    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      const stale = cacheKeys.filter(
        (k) => k.startsWith("workbox-precache") || isLovablePreview
      );
      if (stale.length > 0) {
        await Promise.allSettled(stale.map((key) => caches.delete(key)));
        console.info("[PWA] Stale caches cleared:", stale.length);
      }
    }
  } catch (error) {
    console.warn("[PWA] Failed to clear service workers:", error);
  }
}

// Load scale config from localStorage on boot
loadScaleConfigFromStorage();

// Initialize error tracking (global error + unhandled rejection handlers)
initErrorTracker();

clearStaleServiceWorkers().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
