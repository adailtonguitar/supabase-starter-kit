import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// PWA auto-update is handled by vite-plugin-pwa (registerType: "autoUpdate")

// Global safety net: prevent unhandled promise rejections from crashing the app (white screen)
window.addEventListener("unhandledrejection", (event) => {
  console.warn("[Global] Unhandled promise rejection caught:", event.reason);
  event.preventDefault();
});

createRoot(document.getElementById("root")!).render(<App />);
