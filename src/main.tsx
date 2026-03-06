import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/theme.css";
import { loadScaleConfigFromStorage } from "./lib/scale-barcode";
import { initErrorTracker } from "./services/ErrorTracker";

// Load scale config from localStorage on boot
loadScaleConfigFromStorage();

// Initialize error tracking (global error + unhandled rejection handlers)
initErrorTracker();

// PWA service worker is auto-registered by vite-plugin-pwa (v2)

createRoot(document.getElementById("root")!).render(<App />);
