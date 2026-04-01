import { useState, useEffect } from "react";
import { Wifi, WifiOff, User, Wallet, Maximize, Minimize, AlertTriangle, FileBadge2 } from "lucide-react";

interface PDVTopBarProps {
  companyName: string | null;
  terminalId: string;
  saleNumber: number;
  isOnline: boolean;
  isFullscreen: boolean;
  trainingMode: boolean;
  contingencyMode: boolean;
  syncStats: { pending: number; syncing: number };
  currentSession: { opened_at: string } | null;
  selectedClientName?: string;
  selectedClientDoc?: string;
  fiscalCustomerReady?: boolean;
  onExit: () => void;
  onTerminalClick: () => void;
  onCashRegisterClick: () => void;
  onToggleFullscreen: () => void;
  onClearClient: () => void;
}

export function PDVTopBar({
  companyName, terminalId, saleNumber, isOnline, isFullscreen,
  trainingMode, contingencyMode, syncStats, currentSession,
  selectedClientName, selectedClientDoc, fiscalCustomerReady, onExit, onTerminalClick, onCashRegisterClick,
  onToggleFullscreen, onClearClient,
}: PDVTopBarProps) {
  return (
    <div className="flex items-center justify-between px-2 lg:px-3 h-9 bg-primary text-primary-foreground flex-shrink-0 text-xs gap-1 lg:gap-2 overflow-hidden">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <button onClick={onExit} className="font-bold opacity-80 hover:opacity-100 transition-opacity">
          ← Sair
        </button>
        <span className="opacity-60">|</span>
        <span className="font-bold hidden sm:inline">{companyName || "PDV"}</span>
        <span className="opacity-60 hidden sm:inline">|</span>
        <button onClick={onTerminalClick} className="font-mono font-bold hover:underline">
          Caixa: T{terminalId}
        </button>
        <span className="opacity-60">|</span>
        <span className="font-mono">Venda #{String(saleNumber).padStart(6, "0")}</span>
        <span className="opacity-60">|</span>
        <span className="font-mono">{new Date().toLocaleDateString("pt-BR")}</span>
        {currentSession && (
          <>
            <span className="opacity-60">|</span>
            <SessionTimer openedAt={currentSession.opened_at} />
          </>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        {trainingMode && (
          <span className="font-bold text-warning animate-pulse">🎓 TREINAMENTO</span>
        )}
        {selectedClientName && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span className="font-bold truncate max-w-[120px]">{selectedClientName}</span>
            {fiscalCustomerReady ? (
              <span
                className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-300/30"
                title={`NFC-e identificada com ${selectedClientDoc || "documento valido"}`}
              >
                <FileBadge2 className="w-3 h-3" />
                NFC-e identificada
              </span>
            ) : selectedClientDoc ? (
              <span
                className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-100 border border-amber-300/30"
                title="Documento do cliente invalido para NFC-e"
              >
                Doc invalido
              </span>
            ) : (
              <span
                className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-white/10 text-primary-foreground/85 border border-white/15"
                title="Selecione um CPF ou CNPJ para identificar a NFC-e"
              >
                Sem documento fiscal
              </span>
            )}
            <button onClick={onClearClient} className="ml-0.5 hover:text-destructive">✕</button>
          </span>
        )}
        <button
          onClick={onCashRegisterClick}
          className="opacity-80 hover:opacity-100 transition-opacity flex items-center gap-1"
          title="Controle de Caixa"
        >
          <Wallet className="w-3.5 h-3.5" />
          <span className="hidden sm:inline font-bold">Caixa</span>
        </button>
        <button
          onClick={onToggleFullscreen}
          className="opacity-80 hover:opacity-100 transition-opacity hidden sm:block"
          title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
        >
          {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
        </button>
        {contingencyMode && (
          <span className="flex items-center gap-1 font-bold text-warning animate-pulse">
            <AlertTriangle className="w-3 h-3" /> CONTINGÊNCIA
          </span>
        )}
        {syncStats.pending > 0 && (
          <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${isOnline ? "bg-primary/20" : "bg-warning/20 text-warning"}`}>
            📤 {syncStats.pending} pendente{syncStats.pending > 1 ? "s" : ""}
            {syncStats.syncing > 0 && " ⟳"}
          </span>
        )}
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
          isOnline 
            ? "bg-success/20 text-success" 
            : "bg-destructive/20 text-destructive animate-pulse"
        }`}>
          {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
        </span>
        <LiveClock />
      </div>
    </div>
  );
}

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <span className="font-mono font-bold tracking-wider">
      {time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

function SessionTimer({ openedAt }: { openedAt: string }) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = Date.now() - new Date(openedAt).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setElapsed(`${h}h${String(m).padStart(2, "0")}m`);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [openedAt]);
  return (
    <span className="font-mono text-[10px] opacity-80" title="Tempo de caixa aberto">
      🕐 {elapsed}
    </span>
  );
}
