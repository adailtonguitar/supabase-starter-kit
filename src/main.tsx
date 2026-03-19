import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/theme.css";
import { loadScaleConfigFromStorage } from "./lib/scale-barcode";
import { initErrorTracker } from "./services/ErrorTracker";

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
      const outdated = cacheKeys.filter(
        (k) => k.startsWith("workbox-precache") || (isLovablePreview && true)
      );
      await Promise.allSettled(outdated.map((key) => caches.delete(key)));
    }

    if (outdated.length > 0 || isLovablePreview) {
      console.info("[PWA] Stale caches cleared");
    }
  } catch (error) {
    console.warn("[PWA] Failed to clear service workers:", error);
  }
}

// Load scale config from localStorage on boot
loadScaleConfigFromStorage();

// Initialize error tracking (global error + unhandled rejection handlers)
initErrorTracker();

clearPreviewServiceWorkers().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
