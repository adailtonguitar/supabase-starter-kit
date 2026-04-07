import { useState, useEffect, useRef } from "react";
import { RefreshCw, X, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function UpdateNoticeModal() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const waitingSWRef = useRef<ServiceWorker | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const forceReloadTimeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const forceReload = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    // Register SW manually (injectRegister: false)
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registrationRef.current = reg;

        // Check if there's already a waiting SW
        if (reg.waiting) {
          waitingSWRef.current = reg.waiting;
          setShow(true);
          return;
        }

        // Listen for new SW installing
        reg.addEventListener("updatefound", () => {
          try {
            const newSW = reg.installing;
            if (!newSW) return;
            newSW.addEventListener("statechange", () => {
              if (newSW.state === "installed" && navigator.serviceWorker.controller) {
                waitingSWRef.current = reg.waiting ?? newSW;
                setShow(true);
              }
            });
          } catch {
            // Safari may throw when accessing installing worker
          }
        });

        // Periodically check for updates (every 60s)
        intervalRef.current = window.setInterval(() => {
          try { reg.update().catch(() => {}); } catch { /* Safari quirk */ }
        }, 60 * 1000);
      })
      .catch(() => {});

    const onControllerChange = () => {
      forceReload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (forceReloadTimeoutRef.current) window.clearTimeout(forceReloadTimeoutRef.current);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const handleUpdate = async () => {
    if (isUpdating) return;

    setIsUpdating(true);
    setShow(false);

    const registration = registrationRef.current ?? await navigator.serviceWorker.getRegistration().catch(() => null);
    const sw = registration?.waiting ?? waitingSWRef.current;

    if (sw) {
      waitingSWRef.current = sw;
      sw.postMessage({ type: "SKIP_WAITING" });
    }

    try {
      await registration?.update();
    } catch {
      // fallback below
    }

    forceReloadTimeoutRef.current = window.setTimeout(() => {
      if (!reloadingRef.current) {
        window.location.reload();
      }
    }, 1500);
  };

  if (!show || !user) return null;

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
            onClick={handleUpdate}
            disabled={isUpdating}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? "animate-spin" : ""}`} />
            {isUpdating ? "Atualizando..." : "Atualizar agora"}
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
