import { useState } from "react";
import { FileText, Send, Loader2, CheckCircle, AlertTriangle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/mock-data";
import { toast } from "sonner";

interface NfceEmissionDialogProps {
  sale: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function NfceEmissionDialog({ sale, open, onOpenChange, onSuccess }: NfceEmissionDialogProps) {
  const { companyId } = useCompany();
  const [emitting, setEmitting] = useState(false);
  const [step, setStep] = useState<"review" | "success" | "error">("review");
  const [errorMsg, setErrorMsg] = useState("");

  if (!open || !sale) return null;

  // Parse items
  let items: any[] = [];
  try {
    const raw = sale.items_json;
    if (Array.isArray(raw)) items = raw;
    else if (raw?.items) items = raw.items;
    else if (typeof raw === "string") {
      const parsed = JSON.parse(raw);
      items = Array.isArray(parsed) ? parsed : parsed?.items || [];
    }
  } catch { items = []; }

  const handleEmit = async () => {
    setEmitting(true);
    setErrorMsg("");

    try {
      // Check fiscal config exists
      const { data: configs } = await supabase
        .from("fiscal_configs")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true);

      const nfceConfig = configs?.find((c: any) => c.doc_type === "nfce");

      if (!nfceConfig) {
        setStep("error");
        setErrorMsg("Configuração fiscal NFC-e não encontrada. Acesse Fiscal > Configuração para configurar.");
        setEmitting(false);
        return;
      }

      if (!nfceConfig.certificate_path && !(nfceConfig as any).a3_thumbprint) {
        setStep("error");
        setErrorMsg("Certificado digital não configurado. Acesse Fiscal > Configuração e envie seu certificado A1 ou configure o A3.");
        setEmitting(false);
        return;
      }

      // Call edge function for emission
      const { data, error } = await supabase.functions.invoke("emit-nfce", {
        body: {
          sale_id: sale.id,
          company_id: companyId,
          config_id: nfceConfig.id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setStep("success");
        toast.success("NFC-e emitida com sucesso!");
        onSuccess?.();
      } else {
        setStep("error");
        setErrorMsg(data?.error || "Erro ao emitir NFC-e. Tente novamente.");
      }
    } catch (err: any) {
      setStep("error");
      setErrorMsg(err?.message || "Erro de comunicação com o servidor fiscal.");
    } finally {
      setEmitting(false);
    }
  };

  const handleClose = () => {
    setStep("review");
    setErrorMsg("");
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleClose}>
      <div
        className="bg-card rounded-xl border border-border max-w-lg w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Emitir NFC-e</h2>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {step === "review" && (
          <>
            {/* Sale summary */}
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Venda</span>
                <span className="text-sm font-mono font-medium text-foreground">
                  {sale.id?.slice(0, 8).toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Data</span>
                <span className="text-sm text-foreground">
                  {new Date(sale.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              {sale.customer_name && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Cliente</span>
                  <span className="text-sm text-foreground">{sale.customer_name}</span>
                </div>
              )}

              {/* Items */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground flex justify-between">
                  <span>Produto</span>
                  <span>Valor</span>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-border">
                  {items.map((item: any, idx: number) => (
                    <div key={idx} className="px-3 py-2 flex justify-between text-sm">
                      <span className="text-foreground truncate mr-2">
                        {item.qty || item.quantity || 1}x {item.name || item.product_name || "Item"}
                      </span>
                      <span className="text-foreground font-mono whitespace-nowrap">
                        {formatCurrency((item.price || item.unit_price || 0) * (item.qty || item.quantity || 1))}
                      </span>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                      Sem itens detalhados
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm font-medium text-foreground">Total</span>
                <span className="text-lg font-bold font-mono text-primary">
                  {formatCurrency(sale.total_value)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEmit}
                disabled={emitting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
              >
                {emitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {emitting ? "Emitindo..." : "Emitir NFC-e"}
              </button>
            </div>
          </>
        )}

        {step === "success" && (
          <div className="p-8 flex flex-col items-center text-center">
            <CheckCircle className="w-12 h-12 text-success mb-3" />
            <h3 className="text-base font-semibold text-foreground">NFC-e Emitida!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Documento fiscal emitido com sucesso.
            </p>
            <button
              onClick={handleClose}
              className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
            >
              Fechar
            </button>
          </div>
        )}

        {step === "error" && (
          <div className="p-8 flex flex-col items-center text-center">
            <AlertTriangle className="w-12 h-12 text-warning mb-3" />
            <h3 className="text-base font-semibold text-foreground">Não foi possível emitir</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">{errorMsg}</p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setStep("review")}
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
