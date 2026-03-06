import { useState, useMemo, useCallback } from "react";
import { Search, User, DollarSign, X, Check } from "lucide-react";
import { useClients } from "@/hooks/useClients";
import { useFinancialEntries } from "@/hooks/useFinancialEntries";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CashSessionService } from "@/services/CashSessionService";
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatCurrency } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { PDVCreditReceipt, type CreditReceiptData } from "@/components/pdv/PDVCreditReceipt";

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

export function PDVReceiveCreditDialog({ open, onClose }: PDVReceiveCreditDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState("dinheiro");
  const [customAmount, setCustomAmount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState<CreditReceiptData | null>(null);

  const { data: clients = [] } = useClients();
  const { data: entries = [] } = useFinancialEntries();
  const { companyId, companyName, slogan, cnpj, phone, addressStreet, addressNumber, addressNeighborhood, addressCity, addressState } = useCompany();
  const { user } = useAuth();
  const qc = useQueryClient();

  const clientsWithDebt = useMemo(() => {
    return clients
      .filter((c: any) => Number(c.credit_balance || 0) > 0)
      .filter((c: any) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.cpf_cnpj && c.cpf_cnpj.includes(search))
      )
      .sort((a: any, b: any) => Number(b.credit_balance || 0) - Number(a.credit_balance || 0));
  }, [clients, search]);

  const selectedClient = clients.find((c: any) => c.id === selectedClientId) as any;
  const clientBalance = Number(selectedClient?.credit_balance || 0);

  const clientEntries = useMemo(() => {
    if (!selectedClient) return [];
    return entries.filter(
      (e: any) => e.type === "receber" && e.status === "pendente" && e.counterpart === selectedClient.name
    );
  }, [entries, selectedClient]);

  const executePayment = useCallback(async (payAmount: number) => {
    if (!companyId || !user || !selectedClient) return;
    const prevBalance = clientBalance;
    setIsProcessing(true);
    try {
      // Try to register in cash session if open
      try {
        const session = await CashSessionService.getCurrentSession(companyId);
        if (session) {
          await supabase.from("cash_movements").insert({
            company_id: companyId,
            session_id: session.id,
            type: "suprimento" as any,
            amount: payAmount,
            performed_by: user.id,
            payment_method: selectedMethod as any,
            description: `Recebimento fiado: ${selectedClient.name}`,
          });
        }
      } catch { /* no session */ }

      const newBalance = Math.max(0, clientBalance - payAmount);
      await supabase.from("clients").update({ credit_balance: newBalance }).eq("id", selectedClient.id);

      let remaining = payAmount;
      for (const entry of clientEntries) {
        if (remaining <= 0) break;
        const entryAmount = Number(entry.amount);
        if (remaining >= entryAmount) {
          await supabase.from("financial_entries").update({
            status: "pago" as any,
            paid_amount: entryAmount,
            paid_date: new Date().toISOString().split("T")[0],
            payment_method: selectedMethod,
          }).eq("id", entry.id);
          remaining -= entryAmount;
        } else {
          await supabase.from("financial_entries").update({
            paid_amount: remaining,
            payment_method: selectedMethod,
          }).eq("id", entry.id);
          remaining = 0;
        }
      }

      // Fetch sale items from related sales
      const saleIds = clientEntries
        .map((e: any) => e.reference)
        .filter(Boolean)
        .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);

      let receiptItems: { name: string; quantity: number; unitPrice: number }[] = [];
      if (saleIds.length > 0) {
        const { data: saleItems } = await supabase
          .from("sale_items")
          .select("product_name, quantity, unit_price")
          .in("sale_id", saleIds);
        if (saleItems) {
          receiptItems = saleItems.map((si: any) => ({
            name: si.product_name,
            quantity: Number(si.quantity),
            unitPrice: Number(si.unit_price),
          }));
        }
      }

      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
      toast.success(`Recebimento de ${formatCurrency(payAmount)} registrado!`);
      setCustomAmount(0);
      setReceiptData({
        clientName: selectedClient.name,
        clientDoc: selectedClient.cpf_cnpj || undefined,
        amount: payAmount,
        previousBalance: prevBalance,
        newBalance,
        paymentMethod: selectedMethod,
        storeName: companyName || undefined,
        storeSlogan: slogan || undefined,
        storeCnpj: cnpj || undefined,
        storePhone: phone || undefined,
        storeAddress: [addressStreet, addressNumber, addressNeighborhood, addressCity, addressState].filter(Boolean).join(", ") || undefined,
        items: receiptItems,
      });
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
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
                clientsWithDebt.map((client: any) => (
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
                  {clientEntries.map((entry: any) => (
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
