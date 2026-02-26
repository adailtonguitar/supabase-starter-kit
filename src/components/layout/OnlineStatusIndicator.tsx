import { useState, useEffect } from "react";
import { Wifi, WifiOff } from "lucide-react";

export function OnlineStatusIndicator() {
  const [online, setOnline] = useState(navigator.onLine);
  const [showBanner, setShowBanner] = useState(!navigator.onLine);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      // Show "back online" briefly then hide
      setShowBanner(true);
      setTimeout(() => setShowBanner(false), 3000);
    };
    const goOffline = () => {
      setOnline(false);
      setShowBanner(true);
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!showBanner) return null;

  return (
    <div
      className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium transition-colors ${
        online
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-destructive/15 text-destructive"
      }`}
    >
      {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
      {online ? "Conexão restabelecida" : "Sem conexão — modo offline ativo"}
    </div>
  );
}
