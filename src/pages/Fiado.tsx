import { useState, useMemo, useRef, useCallback } from "react";
import { Search, User, DollarSign, CreditCard, AlertTriangle, FileText } from "lucide-react";
import { useClients } from "@/hooks/useClients";
import { useFinancialEntries } from "@/hooks/useFinancialEntries";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CashSessionService } from "@/services/CashSessionService";
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatCurrency } from "@/lib/utils";
import { format, parseISO, addMonths } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PDVCreditReceipt, type CreditReceiptData } from "@/components/pdv/PDVCreditReceipt";
import { CarnePrint, type CarneData } from "@/components/pos/CarnePrint";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const paymentMethods = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
];

export default function Fiado() {
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState("dinheiro");
  const [customAmount, setCustomAmount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState<CreditReceiptData | null>(null);
  const [carneData, setCarneData] = useState<CarneData | null>(null);
  const carneEnabled = localStorage.getItem("carne_enabled") === "true";
  const carneFormat = (localStorage.getItem("carne_format") as "a4" | "matricial") || "a4";

  const { data: clients = [] } = useClients();
  const { data: entries = [] } = useFinancialEntries();
  const { companyId, companyName, slogan } = useCompany();
  const { user } = useAuth();
  const qc = useQueryClient();

  const clientsWithDebt = useMemo(() => {
    return clients.filter((c: any) => Number(c.credit_balance || 0) > 0).filter((c: any) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.cpf_cnpj && c.cpf_cnpj.includes(search))).sort((a: any, b: any) => Number(b.credit_balance || 0) - Number(a.credit_balance || 0));
  }, [clients, search]);

  const totalDebt = useMemo(() => clients.reduce((sum: number, c: any) => sum + Number(c.credit_balance || 0), 0), [clients]);
  const debtorCount = useMemo(() => clients.filter((c: any) => Number(c.credit_balance || 0) > 0).length, [clients]);
  const selectedClient = clients.find((c: any) => c.id === selectedClientId) as any;
  const clientBalance = Number(selectedClient?.credit_balance || 0);

  const clientEntries = useMemo(() => {
    if (!selectedClient) return [];
    return entries.filter((e: any) => e.type === "receber" && e.status === "pendente" && e.counterpart === selectedClient.name);
  }, [entries, selectedClient]);

  const [cashPromptOpen, setCashPromptOpen] = useState(false);
  const [pendingSession, setPendingSession] = useState<any>(null);
  const pendingPayRef = useRef<{ amount: number } | null>(null);

  const executePayment = useCallback(async (payAmount: number, registerInCash: boolean, session: any) => {
    if (!companyId || !user || !selectedClient) return;
    const prevBalance = clientBalance;
    setIsProcessing(true);
    try {
      if (registerInCash && session) {
        await supabase.from("cash_movements").insert({ company_id: companyId, session_id: session.id, type: "suprimento" as any, amount: payAmount, performed_by: user.id, payment_method: selectedMethod as any, description: `Recebimento fiado: ${selectedClient.name}` });
      }
      const newBalance = Math.max(0, clientBalance - payAmount);
      await supabase.from("clients").update({ credit_balance: newBalance }).eq("id", selectedClient.id);
      let remaining = payAmount;
      for (const entry of clientEntries) {
        if (remaining <= 0) break;
        const entryAmount = Number(entry.amount);
        if (remaining >= entryAmount) {
          await supabase.from("financial_entries").update({ status: "pago" as any, paid_amount: entryAmount, paid_date: new Date().toISOString().split("T")[0], payment_method: selectedMethod }).eq("id", entry.id);
          remaining -= entryAmount;
        } else {
          await supabase.from("financial_entries").update({ paid_amount: remaining, payment_method: selectedMethod }).eq("id", entry.id);
          remaining = 0;
        }
      }
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
      toast.success(`Recebimento de ${formatCurrency(payAmount)} registrado!`);
      setCustomAmount(0);
      setReceiptData({ clientName: selectedClient.name, clientDoc: selectedClient.cpf_cnpj || undefined, amount: payAmount, previousBalance: prevBalance, newBalance, paymentMethod: selectedMethod, storeName: companyName || undefined, storeSlogan: slogan || undefined });
    } catch (err: any) { toast.error(`Erro: ${err.message}`); } finally { setIsProcessing(false); }
  }, [companyId, user, selectedClient, clientBalance, selectedMethod, clientEntries, qc, companyName, slogan]);

  const handleReceivePayment = async (amount?: number) => {
    const payAmount = amount || customAmount;
    if (!payAmount || payAmount <= 0) { toast.error("Informe um valor válido"); return; }
    if (payAmount > clientBalance) { toast.error("Valor maior que o saldo devedor"); return; }
    if (!companyId || !user || !selectedClient) return;
    try {
      const session = await CashSessionService.getCurrentSession(companyId);
      if (session) { pendingPayRef.current = { amount: payAmount }; setPendingSession(session); setCashPromptOpen(true); return; }
    } catch { /* No session */ }
    await executePayment(payAmount, false, null);
  };

  const handleGenerateCarne = () => {
    if (!selectedClient || clientEntries.length === 0) {
      toast.error("Selecione um cliente com parcelas pendentes");
      return;
    }
    const installments = clientEntries.map((e: any, i: number) => ({
      number: i + 1,
      dueDate: e.due_date,
      amount: Number(e.amount),
    }));
    setCarneData({
      storeName: companyName || "Loja",
      clientName: selectedClient.name,
      clientDoc: selectedClient.cpf_cnpj || undefined,
      clientPhone: selectedClient.phone || undefined,
      totalAmount: clientBalance,
      installments,
      saleDate: new Date().toISOString(),
      description: clientEntries[0]?.description || undefined,
    });
  };

  if (carneData) return <CarnePrint data={carneData} onClose={() => setCarneData(null)} format={carneFormat} />;
  if (receiptData) return <PDVCreditReceipt data={receiptData} onClose={() => setReceiptData(null)} />;

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-6 py-5 border-b border-border"><h1 className="text-2xl font-bold text-foreground">Contas a Receber (Fiado)</h1><p className="text-sm text-muted-foreground mt-1">Gerencie vendas a prazo e receba pagamentos dos clientes</p></div>
      <div className="px-6 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="flex items-center gap-4 p-4"><div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-destructive" /></div><div><p className="text-xs text-muted-foreground">Total em Aberto</p><p className="text-lg font-bold font-mono text-destructive">{formatCurrency(totalDebt)}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-4"><div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center"><User className="w-5 h-5 text-warning" /></div><div><p className="text-xs text-muted-foreground">Clientes Devedores</p><p className="text-lg font-bold text-foreground">{debtorCount}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-4"><div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><CreditCard className="w-5 h-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">Parcelas Pendentes</p><p className="text-lg font-bold text-foreground">{entries.filter((e: any) => e.type === "receber" && e.status === "pendente").length}</p></div></CardContent></Card>
      </div>
      <div className="min-h-0 flex flex-col lg:flex-row gap-4 p-6 flex-1">
        <div className="lg:w-1/3 flex flex-col border border-border rounded-xl bg-card overflow-hidden min-h-[300px] max-h-[60vh]">
          <div className="p-3 border-b border-border"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div></div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {clientsWithDebt.length === 0 ? (<div className="flex flex-col items-center justify-center py-12 text-muted-foreground"><User className="w-8 h-8 mb-2 opacity-40" /><p className="text-sm">Nenhum cliente com débito</p></div>) : (
              clientsWithDebt.map((client: any) => {
                const isSelected = client.id === selectedClientId;
                const balance = Number(client.credit_balance || 0);
                const limit = Number(client.credit_limit || 0);
                const overLimit = limit > 0 && balance >= limit;
                return (
                  <button key={client.id} onClick={() => { setSelectedClientId(client.id); setCustomAmount(0); }} className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-all ${isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted border border-transparent"}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0"><User className="w-4 h-4 text-muted-foreground" /></div>
                      <div className="min-w-0"><p className="text-sm font-medium text-foreground truncate">{client.name}</p><p className="text-xs text-muted-foreground">{client.cpf_cnpj || "Sem doc"}</p></div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-sm font-bold font-mono text-destructive">{formatCurrency(balance)}</p>
                      {overLimit && <Badge variant="destructive" className="text-[9px] px-1 py-0"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Limite</Badge>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div className="flex-1 flex flex-col border border-border rounded-xl bg-card overflow-hidden min-h-[300px]">
          {!selectedClient ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground"><CreditCard className="w-12 h-12 mb-3 opacity-30" /><p className="text-sm font-medium">Selecione um cliente para ver detalhes</p></div>
          ) : (
            <>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div><h2 className="text-lg font-bold text-foreground">{selectedClient.name}</h2><div className="flex gap-3 mt-1 text-xs text-muted-foreground"><span>{selectedClient.cpf_cnpj || "Sem documento"}</span>{selectedClient.phone && <span>• {selectedClient.phone}</span>}</div></div>
                <div className="text-right"><p className="text-xs text-muted-foreground">Saldo devedor</p><p className="text-xl font-bold font-mono text-destructive">{formatCurrency(clientBalance)}</p>{Number(selectedClient.credit_limit || 0) > 0 && <p className="text-xs text-muted-foreground">Limite: {formatCurrency(Number(selectedClient.credit_limit))}</p>}</div>
              </div>
              <div className="p-4 border-b border-border space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Registrar Recebimento</h3>
                <div className="flex gap-2">{paymentMethods.map((m) => (<button key={m.value} onClick={() => setSelectedMethod(m.value)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all border ${selectedMethod === m.value ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:bg-accent"}`}>{m.label}</button>))}</div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1"><CurrencyInput value={customAmount} onChange={setCustomAmount} placeholder="Valor a receber" className="text-foreground h-12 text-lg" /></div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleReceivePayment()} disabled={isProcessing || customAmount <= 0} className="flex-1 sm:flex-none px-6 h-12">{isProcessing ? "..." : "Receber"}</Button>
                    <Button variant="outline" onClick={() => handleReceivePayment(clientBalance)} disabled={isProcessing || clientBalance <= 0} className="flex-1 sm:flex-none h-12">Receber Tudo</Button>
                  </div>
                </div>
              </div>
              {carneEnabled && clientEntries.length > 0 && (
                <div className="px-4 pb-3">
                  <Button variant="secondary" size="sm" onClick={handleGenerateCarne} className="w-full sm:w-auto">
                    <FileText className="w-4 h-4 mr-2" /> Gerar Carnê ({clientEntries.length} parcelas)
                  </Button>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Parcelas Pendentes ({clientEntries.length})</h3>
                {clientEntries.length === 0 ? (<p className="text-sm text-muted-foreground text-center py-6">Nenhuma parcela pendente registrada</p>) : (
                  <div className="space-y-2">{clientEntries.map((entry: any) => (
                    <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                      <div><p className="text-sm font-medium text-foreground">{entry.description}</p><p className="text-xs text-muted-foreground">Vencimento: {format(parseISO(entry.due_date), "dd/MM/yyyy")}</p></div>
                      <div className="flex items-center gap-3"><p className="text-sm font-bold font-mono text-foreground">{formatCurrency(Number(entry.amount))}</p><Button size="sm" onClick={() => handleReceivePayment(Number(entry.amount))} disabled={isProcessing}>Receber</Button></div>
                    </div>
                  ))}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <AlertDialog open={cashPromptOpen} onOpenChange={setCashPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Registrar no caixa?</AlertDialogTitle><AlertDialogDescription>Há um caixa aberto. Deseja registrar este recebimento de <span className="font-semibold text-foreground">{formatCurrency(pendingPayRef.current?.amount || 0)}</span> como movimento no caixa atual?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={async () => { setCashPromptOpen(false); const pay = pendingPayRef.current; if (pay) { pendingPayRef.current = null; await executePayment(pay.amount, false, null); } }}>Não, apenas baixar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { setCashPromptOpen(false); const pay = pendingPayRef.current; const session = pendingSession; if (pay && session) { pendingPayRef.current = null; setPendingSession(null); await executePayment(pay.amount, true, session); } }}>Sim, registrar no caixa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
