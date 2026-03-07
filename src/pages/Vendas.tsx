import { useState, useMemo } from "react";
import { FileText, RefreshCw, RotateCcw, Loader2, Send, BarChart3, DollarSign, TrendingDown, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { useSales, type Sale } from "@/hooks/useSales";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useTEFConfig } from "@/hooks/useTEFConfig";
import { MercadoPagoTEFService } from "@/services/MercadoPagoTEFService";
import { NfceEmissionDialog } from "@/components/fiscal/NfceEmissionDialog";
import { toast } from "sonner";
import { FiscalDashboard } from "@/components/FiscalDashboard";
import { useFiscalDashboard } from "@/hooks/useFiscalDashboard";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  dinheiro: "💵 Dinheiro",
  pix: "⚡ PIX",
  debito: "💳 Débito",
  credito: "💳 Crédito",
  voucher: "🎟️ Voucher",
  prazo: "📅 A Prazo",
  outros: "📦 Outros",
};

export default function Vendas() {
  const { data: sales = [], isLoading, refetch } = useSales(100);
  const { config } = useTEFConfig();
  
  const [refundingSaleId, setRefundingSaleId] = useState<string | null>(null);
  const [emissionSale, setEmissionSale] = useState<Sale | null>(null);
  const [confirmRefund, setConfirmRefund] = useState<{ saleId: string; paymentId: string; amount: number } | null>(null);
  const { metrics, isLoadingMetrics, queueMap, processQueue, isProcessing } = useFiscalDashboard();

  const summaryStats = useMemo(() => {
    const activeSales = sales.filter(s => s.status !== "cancelada");
    const totalSales = activeSales.length;
    const totalRevenue = activeSales.reduce((sum, s) => sum + (s.total_value || 0), 0);
    let totalCost = 0;
    activeSales.forEach(sale => {
      try {
        const raw = sale.items_json;
        let items: any[] = [];
        if (Array.isArray(raw)) items = raw;
        else if (raw && typeof raw === "object" && (raw as any).items) items = (raw as any).items;
        else if (typeof raw === "string") { const p = JSON.parse(raw); items = Array.isArray(p) ? p : p?.items || []; }
        items.forEach(item => {
          const cost = item.cost_price || item.costPrice || 0;
          const qty = item.quantity || 1;
          totalCost += cost * qty;
        });
      } catch { /* skip */ }
    });
    const totalProfit = totalRevenue - totalCost;
    return { totalSales, totalRevenue, totalCost, totalProfit };
  }, [sales]);

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
      // Audit log: TEF refund
      supabase.from("action_logs" as any).insert({
        company_id: sales.find(s => s.id === confirmRefund.saleId)?.company_id,
        action: "sale_tef_refund",
        module: "vendas",
        details: {
          sale_id: confirmRefund.saleId,
          payment_id: confirmRefund.paymentId,
          amount: confirmRefund.amount,
        },
      }).then(() => {});
    } else {
      toast.error(result.errorMessage || "Erro ao estornar");
    }
    setRefundingSaleId(null);
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Histórico de Vendas</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {sales.length} vendas registradas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </motion.div>
      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Vendas", value: String(summaryStats.totalSales), icon: BarChart3, color: "text-primary" },
          { label: "Receita Total", value: formatCurrency(summaryStats.totalRevenue), icon: DollarSign, color: "text-success" },
          { label: "Custo Total", value: formatCurrency(summaryStats.totalCost), icon: TrendingDown, color: "text-destructive" },
          { label: "Lucro Total", value: formatCurrency(summaryStats.totalProfit), icon: TrendingUp, color: summaryStats.totalProfit >= 0 ? "text-success" : "text-destructive" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card rounded-2xl border border-border p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
            </div>
            <p className={`text-lg font-bold font-mono ${stat.color}`}>{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <FiscalDashboard
        metrics={metrics}
        isLoading={isLoadingMetrics}
        isProcessing={isProcessing}
        onProcessQueue={processQueue}
      />

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
            const queueEntry = queueMap.get(sale.id);

            return (
              <motion.div
                key={sale.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="bg-card rounded-2xl card-shadow border border-border p-3 sm:p-5 hover:shadow-lg transition-shadow"
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
                      ) : sale.status === "autorizada" || isNfceEmitida ? (
                        <>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                            Concluída
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                            NFC-e Emitida
                          </span>
                        </>
                      ) : sale.status === "emitida" ? (
                        <>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                            Concluída
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                            NFC-e Emitida
                          </span>
                        </>
                      ) : sale.status === "pendente_fiscal" ? (
                        <>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                            Concluída
                          </span>
                          {queueEntry?.status === "processing" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Processando
                            </span>
                          ) : queueEntry?.status === "error" ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive cursor-help">
                                    Erro Fiscal
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">{queueEntry.last_error || "Erro desconhecido"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/10 text-warning">
                              Pendente NFC-e
                            </span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setEmissionSale(sale); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-medium hover:opacity-90 transition-all"
                          >
                            <Send className="w-3 h-3" />
                            {queueEntry?.status === "error" ? "Reemitir" : "Emitir"}
                          </button>
                        </>
                      ) : sale.status === "erro_fiscal" ? (
                        <>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                            Concluída
                          </span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive cursor-help">
                                  Erro NFC-e
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">{queueEntry?.last_error || "Erro na emissão"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEmissionSale(sale); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-medium hover:opacity-90 transition-all"
                          >
                            <Send className="w-3 h-3" />
                            Reemitir
                          </button>
                        </>
                      ) : sale.status === "contingencia" ? (
                        <>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                            Concluída
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/10 text-warning">
                            Contingência
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                            Concluída
                          </span>
                          {!isNfceEmitida && (
                            <>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                                Sem NFC-e
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEmissionSale(sale); }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-medium hover:opacity-90 transition-all"
                              >
                                <Send className="w-3 h-3" />
                                Emitir
                              </button>
                            </>
                          )}
                        </>
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
