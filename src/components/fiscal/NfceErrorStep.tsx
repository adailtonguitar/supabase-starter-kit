import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { SefazRejection } from "@/lib/sefaz-rejection-parser";

interface NfceErrorStepProps {
  errorMsg: string;
  rejection: SefazRejection | null;
  onRetry: () => void;
  onClose: () => void;
}

export function NfceErrorStep({ errorMsg, rejection, onRetry, onClose }: NfceErrorStepProps) {
  return (
    <div className="p-8 flex flex-col items-center text-center max-w-md mx-auto">
      <AlertTriangle className="w-12 h-12 text-warning mb-3" />
      <h3 className="text-base font-semibold text-foreground">Não foi possível emitir</h3>
      <p className="text-sm text-muted-foreground mt-2">{errorMsg}</p>

      {rejection && (
        <div className="mt-4 w-full rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-left">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive">
                Rejeição {rejection.code}: {rejection.title}
              </p>
              <p className="text-xs text-foreground leading-relaxed">
                {rejection.guidance}
              </p>
              {rejection.field && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Campo relacionado: <span className="font-mono font-medium">{
                    rejection.field === "items" ? "Itens" :
                    rejection.field === "customer" ? "Cliente" :
                    rejection.field === "payment" ? "Pagamento" :
                    "Configuração do Emitente"
                  }</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button onClick={onRetry} className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
          Corrigir e Tentar Novamente
        </button>
        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all">
          Fechar
        </button>
      </div>
    </div>
  );
}
