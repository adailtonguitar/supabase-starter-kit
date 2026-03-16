import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/theme.css";
import { loadScaleConfigFromStorage } from "./lib/scale-barcode";
import { initErrorTracker } from "./services/ErrorTracker";

async function clearPreviewServiceWorkers() {
  const isLovablePreview =
    window.location.hostname.includes("lovable.app") &&
    window.location.hostname.includes("id-preview--");

  if (!isLovablePreview || !("serviceWorker" in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(registrations.map((registration) => registration.unregister()));

    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.allSettled(cacheKeys.map((key) => caches.delete(key)));
    }

    console.info("[PWA] Preview cache cleared to avoid stale Lovable bundle");
  } catch (error) {
    console.warn("[PWA] Failed to clear preview service workers:", error);
  }
}

// Load scale config from localStorage on boot
loadScaleConfigFromStorage();

// Initialize error tracking (global error + unhandled rejection handlers)
initErrorTracker();

clearPreviewServiceWorkers().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
