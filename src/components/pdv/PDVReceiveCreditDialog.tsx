import { useState, useMemo, useCallback } from "react";
import { Search, User, DollarSign, X, Check } from "lucide-react";
import { useClients } from "@/hooks/useClients";
import { useFinancialEntries } from "@/hooks/useFinancialEntries";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { supabase, safeRpc } from "@/integrations/supabase/client";
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatCurrency } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { PDVCreditReceipt, type CreditReceiptData } from "@/components/pdv/PDVCreditReceipt";
import type { PaymentMethod } from "@/integrations/supabase/tables";

const paymentMethods = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
];

interface PDVReceiveCreditDialogProps {
  open: boolean;
  onClose: () => void;
}

type ClientWithDebt = {
  id: string;
  name: string;
  cpf_cnpj?: string | null;
  credit_balance?: number | null;
};

type PendingEntry = {
  id: string;
  type: "pagar" | "receber";
  status: string;
  counterpart?: string | null;
  amount: number;
  reference?: string | null;
  description: string;
  due_date: string;
};

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function PDVReceiveCreditDialog({ open, onClose }: PDVReceiveCreditDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("dinheiro");
  const [customAmount, setCustomAmount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState<CreditReceiptData | null>(null);

  const { data: clients = [] } = useClients();
  const { data: entries = [] } = useFinancialEntries();
  const { companyId, companyName, slogan, cnpj, phone, addressStreet, addressNumber, addressNeighborhood, addressCity, addressState } = useCompany();
  const { user } = useAuth();
  const qc = useQueryClient();

  const clientsWithDebt = useMemo(() => {
    const typedClients = clients as ClientWithDebt[];
    return typedClients
      .filter((c) => Number(c.credit_balance || 0) > 0)
      .filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.cpf_cnpj && c.cpf_cnpj.includes(search))
      )
      .sort((a, b) => Number(b.credit_balance || 0) - Number(a.credit_balance || 0));
  }, [clients, search]);

  const selectedClient = (clients as ClientWithDebt[]).find((c) => c.id === selectedClientId) ?? null;
  const clientBalance = Number(selectedClient?.credit_balance || 0);

  const clientEntries = useMemo(() => {
    if (!selectedClient) return [];
    return (entries as PendingEntry[]).filter(
      (e) => e.type === "receber" && e.status === "pendente" && e.counterpart === selectedClient.name
    );
  }, [entries, selectedClient]);

  const executePayment = useCallback(async (payAmount: number) => {
    if (!companyId || !user || !selectedClient) return;
    const prevBalance = clientBalance;
    setIsProcessing(true);
    try {
      const rpc = await safeRpc<{
        success?: boolean;
        error?: string;
        new_balance?: number;
        applied_amount?: number;
        references?: unknown;
      }>("receive_credit_payment_atomic", {
        p_company_id: companyId,
        p_client_id: selectedClient.id,
        p_paid_amount: payAmount,
        p_payment_method: selectedMethod,
        p_performed_by: user.id,
      });
      if (!rpc.success) throw new Error(rpc.error);
      const rpcResult = rpc.data || {};
      if (!rpcResult.success) {
        throw new Error(rpcResult.error || "Falha ao registrar recebimento");
      }

      const newBalance = Number(rpcResult.new_balance ?? Math.max(0, clientBalance - payAmount));
      const appliedAmount = Number(rpcResult.applied_amount ?? payAmount);

      // Fetch sale items from related sales
      const saleIds = (Array.isArray(rpcResult.references) ? rpcResult.references : [])
        .map((v) => (typeof v === "string" ? v : ""))
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);

      let receiptItems: { name: string; quantity: number; unitPrice: number }[] = [];
      if (saleIds.length > 0) {
        // Try sale_items table first
        const { data: saleItems } = await supabase
          .from("sale_items")
          .select("product_name, quantity, unit_price")
          .in("sale_id", saleIds);
        if (saleItems && saleItems.length > 0) {
          receiptItems = saleItems.map((si) => ({
            name: si.product_name,
            quantity: Number(si.quantity),
            unitPrice: Number(si.unit_price),
          }));
        } else {
          // Fallback: read items JSONB from sales table
          const { data: salesData } = await supabase
            .from("sales")
            .select("items")
            .in("id", saleIds);
          if (salesData) {
            for (const sale of salesData) {
              const items = Array.isArray(sale.items) ? sale.items : [];
              for (const item of items as Record<string, unknown>[]) {
                receiptItems.push({
                  name: String(item.product_name ?? item.name ?? "Produto"),
                  quantity: Number(item.quantity ?? item.qty ?? 1),
                  unitPrice: Number(item.unit_price ?? item.price ?? 0),
                });
              }
            }
          }
        }
      }

      // Get next sequential receipt number
      let receiptNumber = 1;
      try {
        const { data: rpcData } = await supabase.rpc("next_receipt_number", {
          p_company_id: companyId,
          p_type: "credit_receipt",
        });
        if (rpcData) receiptNumber = rpcData;
      } catch { /* fallback to 1 */ }

      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
      qc.invalidateQueries({ queryKey: ["cash_sessions"] });
      qc.invalidateQueries({ queryKey: ["cash_movements"] });
      logAction({ companyId: companyId!, userId: user?.id, action: "Recebimento de crédito fiado", module: "financeiro", details: `Cliente: ${selectedClient?.name} - ${formatCurrency(appliedAmount)}` });
      toast.success(`Recebimento de ${formatCurrency(appliedAmount)} registrado!`);
      setCustomAmount(0);
      setReceiptData({
        clientName: selectedClient.name,
        clientDoc: selectedClient.cpf_cnpj || undefined,
        amount: appliedAmount,
        previousBalance: prevBalance,
        newBalance,
        paymentMethod: selectedMethod,
        storeName: companyName || undefined,
        storeSlogan: slogan || undefined,
        storeCnpj: cnpj || undefined,
        storePhone: phone || undefined,
        storeAddress: [addressStreet, addressNumber, addressNeighborhood, addressCity, addressState].filter(Boolean).join(", ") || undefined,
        storeCity: addressCity || undefined,
        storeState: addressState || undefined,
        saleItems: receiptItems.map(i => ({ name: i.name, qty: i.quantity, price: i.unitPrice })),
        receiptNumber,
      });
    } catch (err: unknown) {
      toast.error(`Erro: ${getErrorMessage(err)}`);
    } finally {
      setIsProcessing(false);
    }
  }, [companyId, user, selectedClient, clientBalance, selectedMethod, clientEntries, qc, companyName, slogan]);

  const handleReceive = (amount?: number) => {
    const payAmount = amount || customAmount;
    if (!payAmount || payAmount <= 0) { toast.error("Informe um valor válido"); return; }
    if (payAmount > clientBalance) { toast.error("Valor maior que o saldo devedor"); return; }
    executePayment(payAmount);
  };

  if (!open) return null;

  if (receiptData) {
    return <PDVCreditReceipt data={receiptData} onClose={() => { setReceiptData(null); onClose(); }} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Receber Fiado</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!selectedClient ? (
          /* Client list */
          <div className="flex flex-col flex-1 min-h-0">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  data-no-barcode-capture="true"
                  autoFocus
                  placeholder="Buscar cliente..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {clientsWithDebt.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <User className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">Nenhum cliente com débito</p>
                </div>
              ) : (
                clientsWithDebt.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => { setSelectedClientId(client.id); setCustomAmount(0); }}
                    className="w-full flex items-center justify-between p-3 rounded-lg text-left transition-all hover:bg-muted border border-transparent"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.cpf_cnpj || "Sem doc"}</p>
                      </div>
                    </div>
                    <p className="text-sm font-bold font-mono text-destructive flex-shrink-0 ml-2">
                      {formatCurrency(Number(client.credit_balance || 0))}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Payment panel */
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            {/* Client info */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={() => setSelectedClientId(null)} className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{selectedClient.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedClient.cpf_cnpj || ""}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-muted-foreground">Devendo</p>
                <p className="text-lg font-bold font-mono text-destructive">{formatCurrency(clientBalance)}</p>
              </div>
            </div>

            {/* Payment method */}
            <div className="p-4 space-y-3">
              <div className="flex gap-1.5">
                {paymentMethods.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setSelectedMethod(m.value)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all border ${
                      selectedMethod === m.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border hover:bg-accent"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Amount input */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <CurrencyInput
                    value={customAmount}
                    onChange={setCustomAmount}
                    placeholder="Valor a receber"
                    className="text-foreground h-12 text-lg"
                  />
                </div>
                <button
                  onClick={() => handleReceive()}
                  disabled={isProcessing || customAmount <= 0}
                  className="px-5 h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50 transition-all hover:bg-primary/90 active:scale-95"
                >
                  {isProcessing ? "..." : "Receber"}
                </button>
              </div>

              <button
                onClick={() => handleReceive(clientBalance)}
                disabled={isProcessing || clientBalance <= 0}
                className="w-full py-2.5 rounded-xl bg-accent text-accent-foreground font-semibold text-sm border border-border hover:bg-accent/80 transition-all disabled:opacity-50"
              >
                Receber Tudo ({formatCurrency(clientBalance)})
              </button>
            </div>

            {/* Pending installments */}
            {clientEntries.length > 0 && (
              <div className="px-4 pb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Parcelas Pendentes ({clientEntries.length})
                </p>
                <div className="space-y-1.5">
                  {clientEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border border-border">
                      <div>
                        <p className="text-xs font-medium text-foreground">{entry.description}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Venc: {format(parseISO(entry.due_date), "dd/MM/yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold font-mono text-foreground">{formatCurrency(Number(entry.amount))}</p>
                        <button
                          onClick={() => handleReceive(Number(entry.amount))}
                          disabled={isProcessing}
                          className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
