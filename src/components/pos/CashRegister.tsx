interface CashRegisterProps {
  terminalId?: string;
  onClose: () => void;
  preventClose?: boolean;
  initialSession?: any;
  skipInitialLoad?: boolean;
}

export function CashRegister({ onClose, terminalId, preventClose }: CashRegisterProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={preventClose ? undefined : onClose}>
      <div className="bg-card rounded-xl p-6 border border-border max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-foreground mb-2">Gerenciar Caixa</h2>
        <p className="text-sm text-muted-foreground">
          {terminalId ? `Terminal: T${terminalId}` : "Módulo de caixa em desenvolvimento."}
        </p>
        <button onClick={onClose} className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">
          {preventClose ? "Abrir Caixa" : "Fechar"}
        </button>
      </div>
    </div>
  );
}
