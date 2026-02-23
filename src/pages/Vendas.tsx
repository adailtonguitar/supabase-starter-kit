import { useState } from "react";
import { FileText, RefreshCw, RotateCcw, Loader2, Send } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { motion } from "framer-motion";
import { useSales, type Sale } from "@/hooks/useSales";
import { Skeleton } from "@/components/ui/skeleton";
import { useTEFConfig } from "@/hooks/useTEFConfig";
import { MercadoPagoTEFService } from "@/services/MercadoPagoTEFService";
import { NfceEmissionDialog } from "@/components/fiscal/NfceEmissionDialog";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const paymentLabels: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Débito",
  credito: "Crédito",
  voucher: "Voucher",
  prazo: "A Prazo",
  outros: "Outros",
};

export default function Vendas() {
  const { data: sales = [], isLoading, refetch } = useSales(100);
  const { config } = useTEFConfig();
  const [refundingSaleId, setRefundingSaleId] = useState<string | null>(null);
  const [emissionSale, setEmissionSale] = useState<Sale | null>(null);
  const [confirmRefund, setConfirmRefund] = useState<{ saleId: string; paymentId: string; amount: number } | null>(null);

  const getTefPayments = (sale: Sale) => {
    try {
      const items = sale.items_json as any;
      if (!items?.payments) return [];
      return (items.payments as any[]).filter((p: any) => p.nsu && (p.method === "debito" || p.method === "credito"));
    } catch {
      return [];
    }
  };

  const handleRefund = async () => {
    if (!confirmRefund || !config?.api_key) return;
    setRefundingSaleId(confirmRefund.saleId);
    setConfirmRefund(null);

    const result = await MercadoPagoTEFService.refundPayment({
      accessToken: config.api_key,
      paymentId: confirmRefund.paymentId,
    });

    if (result.success) {
      toast.success("Estorno realizado com sucesso!");
    } else {
      toast.error(result.errorMessage || "Erro ao estornar");
    }
    setRefundingSaleId(null);
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Histórico de Vendas</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {sales.length} vendas registradas
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : sales.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhuma venda encontrada</p>
          <p className="text-xs text-muted-foreground mt-1">As vendas realizadas no PDV aparecerão aqui</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sales.map((sale, i) => {
            let items: any[] = [];
            try {
              const raw = sale.items_json;
              if (Array.isArray(raw)) {
                items = raw;
              } else if (raw && typeof raw === "object" && !Array.isArray(raw) && (raw as any).items) {
                items = (raw as any).items;
              } else if (typeof raw === "string") {
                const parsed = JSON.parse(raw);
                items = Array.isArray(parsed) ? parsed : parsed?.items || [];
              }
            } catch {
              items = [];
            }
            const isNfceEmitida = sale.status === "autorizada" && !!sale.access_key;
            const tefPayments = getTefPayments(sale);
            const isMPProvider = config?.provider === "mercadopago" && !!config?.api_key;
            const isRefunding = refundingSaleId === sale.id;

            return (
              <motion.div
                key={sale.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="bg-card rounded-xl card-shadow border border-border p-3 sm:p-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-accent-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground text-sm font-mono">
                          {sale.id.slice(0, 8).toUpperCase()}
                        </span>
                        {sale.number && (
                          <span className="text-xs font-mono text-muted-foreground">
                            NFC-e #{sale.number}
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                        {new Date(sale.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {isMPProvider && tefPayments.length > 0 && (
                      <button
                        disabled={isRefunding}
                        onClick={() => {
                          const p = tefPayments[0];
                          setConfirmRefund({
                            saleId: sale.id,
                            paymentId: p.nsu,
                            amount: sale.total_value,
                          });
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive/5 transition-colors disabled:opacity-50"
                      >
                        {isRefunding ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        Estornar
                      </button>
                    )}
                    <div className="flex items-center gap-1 flex-wrap">
                      {sale.status === "cancelada" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                          Cancelada
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                          Concluída
                        </span>
                      )}
                      {sale.status !== "cancelada" && (
                        isNfceEmitida ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                            NFC-e Emitida
                          </span>
                        ) : (
                          <>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/10 text-warning">
                              Pendente NFC-e
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEmissionSale(sale); }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-medium hover:opacity-90 transition-all"
                            >
                              <Send className="w-3 h-3" />
                              Emitir
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-border gap-1">
                  <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                    <span>
                      {(Array.isArray(items) ? items : []).length} {(Array.isArray(items) ? items : []).length === 1 ? "item" : "itens"}
                    </span>
                    <span>
                      {paymentLabels[sale.payment_method || ""] || sale.payment_method || "—"}
                    </span>
                    {sale.customer_name && (
                      <span className="truncate max-w-[120px] sm:max-w-none">
                        {sale.customer_name}
                      </span>
                    )}
                  </div>
                  <span className="text-base sm:text-lg font-bold font-mono text-primary">
                    {formatCurrency(sale.total_value)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Confirm refund dialog */}
      <AlertDialog open={!!confirmRefund} onOpenChange={(open) => !open && setConfirmRefund(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Estorno</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja estornar o pagamento de{" "}
              <strong>{confirmRefund ? formatCurrency(confirmRefund.amount) : ""}</strong>?
              O valor será devolvido ao cartão do cliente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRefund}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar Estorno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* NFC-e emission review dialog */}
      <NfceEmissionDialog
        sale={emissionSale}
        open={!!emissionSale}
        onOpenChange={(open) => !open && setEmissionSale(null)}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
