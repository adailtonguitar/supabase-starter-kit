import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { loadScaleConfigFromStorage } from "./lib/scale-barcode";

// Load scale config from localStorage on boot
loadScaleConfigFromStorage();

// PWA service worker is auto-registered by vite-plugin-pwa (v2)

// Global safety net: prevent unhandled promise rejections from crashing the app (white screen)
window.addEventListener("unhandledrejection", (event) => {
  console.warn("[Global] Unhandled promise rejection caught:", event.reason);
  event.preventDefault();
});

createRoot(document.getElementById("root")!).render(<App />);
