import { useState, useEffect } from "react";
import { RefreshCw, X, Sparkles } from "lucide-react";

export function UpdateNoticeModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleUpdate = () => setShow(true);

    // Listen for SW controller change (new version activated)
    navigator.serviceWorker.addEventListener("controllerchange", handleUpdate);

    // Also check for waiting SW on load
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        handleUpdate();
        return;
      }
      reg.addEventListener("updatefound", () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener("statechange", () => {
          if (newSW.state === "installed" && navigator.serviceWorker.controller) {
            handleUpdate();
          }
        });
      });
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleUpdate);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="bg-card border border-primary/30 rounded-2xl shadow-2xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Nova atualização disponível!</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Melhorias e correções foram aplicadas ao sistema.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar agora
          </button>
        </div>
        <button
          onClick={() => setShow(false)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          data-no-min-size
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
