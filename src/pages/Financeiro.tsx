import { useState, type ComponentType } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Search, Filter, CheckCircle2, Clock, AlertTriangle, XCircle,
  ArrowDownCircle, ArrowUpCircle, MoreHorizontal, Trash2, Edit, CreditCard,
  TrendingUp, TrendingDown, Wallet, BarChart3, ChevronLeft, ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { useLocalFinancialEntries, useDeleteLocalFinancialEntry, useMarkAsLocalPaid, type LocalFinancialEntry } from "@/hooks/useLocalFinancial";
import { FinancialEntryFormDialog } from "@/components/financial/FinancialEntryFormDialog";
import { CashFlowChart } from "@/components/financial/CashFlowChart";
import { DailyClosingDialog } from "@/components/financial/DailyClosingDialog";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { PaymentMethod } from "@/integrations/supabase/tables";

const statusConfig: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", icon: Clock, variant: "secondary" },
  pago: { label: "Pago", icon: CheckCircle2, variant: "default" },
  vencido: { label: "Vencido", icon: AlertTriangle, variant: "destructive" },
  cancelado: { label: "Cancelado", icon: XCircle, variant: "outline" },
};

const categoryLabels: Record<string, string> = {
  fornecedor: "Fornecedor", aluguel: "Aluguel", energia: "Energia", agua: "Água",
  internet: "Internet", salario: "Salário", impostos: "Impostos", manutencao: "Manutenção",
  outros: "Outros", venda: "Venda", servico: "Serviço", comissao: "Comissão", reembolso: "Reembolso",
};

export default function Financeiro() {
  const now = new Date();
  const [month, setMonth] = useState(format(now, "yyyy-MM"));
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<LocalFinancialEntry | null>(null);
  const [defaultType, setDefaultType] = useState<"pagar" | "receber">("pagar");
  const [deleteTarget, setDeleteTarget] = useState<LocalFinancialEntry | null>(null);
  const [showClosing, setShowClosing] = useState(false);
  const [payTarget, setPayTarget] = useState<LocalFinancialEntry | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("dinheiro");

  const monthStart = `${month}-01`;
  const monthEndDate = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0);
  const monthEnd = format(monthEndDate, "yyyy-MM-dd");

  const typeFilter = tab === "pagar" ? "pagar" : tab === "receber" ? "receber" : undefined;
  const { data: allEntries = [], isLoading } = useLocalFinancialEntries({
    startDate: monthStart,
    endDate: monthEnd,
  });

  const entries = typeFilter ? allEntries.filter(e => e.type === typeFilter) : allEntries;

  const deleteEntry = useDeleteLocalFinancialEntry();
  const markAsPaid = useMarkAsLocalPaid();

  const filtered = entries.filter(
    (e) =>
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      (e.counterpart && e.counterpart.toLowerCase().includes(search.toLowerCase()))
  );

  const totalPagar = allEntries.filter(e => e.type === "pagar" && e.status !== "pago" && e.status !== "cancelado").reduce((s, e) => s + Number(e.amount), 0);
  const totalReceber = allEntries.filter(e => e.type === "receber" && e.status !== "pago" && e.status !== "cancelado").reduce((s, e) => s + Number(e.amount), 0);
  const totalPago = allEntries.filter(e => e.status === "pago" && e.type === "pagar").reduce((s, e) => s + Number(e.paid_amount || e.amount), 0);
  const totalRecebido = allEntries.filter(e => e.status === "pago" && e.type === "receber").reduce((s, e) => s + Number(e.paid_amount || e.amount), 0);
  const saldo = totalRecebido - totalPago;

  const prevMonth = () => {
    const d = parseISO(`${month}-01`);
    d.setMonth(d.getMonth() - 1);
    setMonth(format(d, "yyyy-MM"));
  };
  const nextMonth = () => {
    const d = parseISO(`${month}-01`);
    d.setMonth(d.getMonth() + 1);
    setMonth(format(d, "yyyy-MM"));
  };

  const handleNewEntry = (type: "pagar" | "receber") => {
    setDefaultType(type);
    setEditEntry(null);
    setShowForm(true);
  };

  const handleEdit = (entry: LocalFinancialEntry) => {
    setEditEntry(entry);
    setShowForm(true);
  };

  const handleCloseForm = (open: boolean) => {
    setShowForm(open);
    if (!open) setEditEntry(null);
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto min-w-0 w-full overflow-x-hidden">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Contas a pagar, receber e fluxo de caixa</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowClosing(true)}>
            <BarChart3 className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Fechamento </span>Diário
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleNewEntry("receber")}>
            <ArrowDownCircle className="w-4 h-4 mr-2" />
            A Receber
          </Button>
          <Button size="sm" onClick={() => handleNewEntry("pagar")}>
            <ArrowUpCircle className="w-4 h-4 mr-2" />
            A Pagar
          </Button>
        </div>
      </motion.div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="text-sm font-semibold text-foreground min-w-[140px] text-center">
          {format(parseISO(`${month}-01`), "MMMM yyyy", { locale: ptBR })}
        </span>
        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard icon={TrendingDown} label="Total a Pagar" value={totalPagar} paid={totalPago} color="text-destructive" />
        <SummaryCard icon={TrendingUp} label="Total a Receber" value={totalReceber} paid={totalRecebido} color="text-primary" />
        <SummaryCard icon={Wallet} label="Saldo Realizado" value={saldo} color={saldo >= 0 ? "text-primary" : "text-destructive"} />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-2xl border border-border p-3 sm:p-4 card-shadow hover:shadow-md transition-shadow">
           <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">Lançamentos no mês</p>
           <p className="text-lg sm:text-2xl font-bold text-foreground">{allEntries.length}</p>
           <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
             {allEntries.filter(e => e.status === "pendente").length} pendentes
           </p>
        </motion.div>
      </div>

      <CashFlowChart entries={allEntries} month={month} />

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <Tabs value={tab} onValueChange={setTab} className="flex-1">
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="pagar">A Pagar</TabsTrigger>
              <TabsTrigger value="receber">A Receber</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative max-w-xs w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-2">
          {isLoading ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum lançamento encontrado neste período.</div>
          ) : (
            filtered.map((entry) => {
              const st = statusConfig[entry.status] || statusConfig.pendente;
              const StIcon = st.icon;
              return (
                <div key={entry.id} className="bg-card rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {entry.type === "pagar" ? (
                          <ArrowUpCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        ) : (
                          <ArrowDownCircle className="w-3.5 h-3.5 text-primary shrink-0" />
                        )}
                        <p className="text-sm font-medium text-foreground truncate">{entry.description}</p>
                      </div>
                      {entry.counterpart && <p className="text-[10px] text-muted-foreground truncate">{entry.counterpart}</p>}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {entry.status === "pendente" && (
                          <DropdownMenuItem onClick={() => { setPayTarget(entry); setPayMethod("dinheiro"); }}>
                            <CreditCard className="w-4 h-4 mr-2" />Marcar como pago
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleEdit(entry)}>
                          <Edit className="w-4 h-4 mr-2" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(entry)}>
                          <Trash2 className="w-4 h-4 mr-2" />Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{categoryLabels[entry.category] || entry.category}</span>
                      <span>·</span>
                      <span className="font-mono">{format(parseISO(entry.due_date), "dd/MM/yy")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sm text-foreground">{formatCurrency(entry.amount)}</span>
                      <Badge variant={st.variant} className="text-[10px] gap-0.5">
                        <StIcon className="w-2.5 h-2.5" />
                        {st.label}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop table */}
         <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden sm:block bg-card rounded-2xl card-shadow border border-border overflow-hidden min-w-0">
           <div className="overflow-x-auto">
             <table className="w-full text-sm table-fixed">
               <thead>
                 <tr className="border-b border-border bg-muted/30">
                   <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[80px]">Tipo</th>
                   <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest">Descrição</th>
                   <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[100px]">Categoria</th>
                   <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[100px]">Vencimento</th>
                   <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[100px]">Valor</th>
                   <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[90px]">Status</th>
                   <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-[60px]">Ações</th>
                 </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-5 py-3" colSpan={7}><Skeleton className="h-8 w-full" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                      Nenhum lançamento encontrado neste período.
                    </td>
                  </tr>
                ) : (
                  filtered.map((entry) => {
                    const st = statusConfig[entry.status] || statusConfig.pendente;
                    const StIcon = st.icon;
                    return (
                      <tr key={entry.id} className={`border-b border-border last:border-0 hover:bg-primary/[0.03] transition-colors ${filtered.indexOf(entry) % 2 === 1 ? "bg-muted/15" : ""}`}>
                        <td className="px-3 py-3">
                          <div className={`flex items-center gap-1.5 ${entry.type === "pagar" ? "text-destructive" : "text-primary"}`}>
                            {entry.type === "pagar" ? <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" /> : <ArrowDownCircle className="w-3.5 h-3.5 shrink-0" />}
                            <span className="text-xs font-medium">{entry.type === "pagar" ? "Pagar" : "Receber"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 min-w-0">
                          <p className="font-medium text-foreground truncate">{entry.description}</p>
                          {entry.counterpart && <p className="text-xs text-muted-foreground truncate">{entry.counterpart}</p>}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground text-xs truncate">{categoryLabels[entry.category] || entry.category}</td>
                        <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                          {format(parseISO(entry.due_date), "dd/MM/yy")}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-semibold text-foreground text-xs">
                          {formatCurrency(entry.amount)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Badge variant={st.variant} className="text-[10px] gap-0.5 px-1.5">
                            <StIcon className="w-2.5 h-2.5" />
                            {st.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {entry.status === "pendente" && (
                                <DropdownMenuItem onClick={() => { setPayTarget(entry); setPayMethod("dinheiro"); }}>
                                  <CreditCard className="w-4 h-4 mr-2" />Marcar como pago
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleEdit(entry)}>
                                <Edit className="w-4 h-4 mr-2" />Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(entry)}>
                                <Trash2 className="w-4 h-4 mr-2" />Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      <FinancialEntryFormDialog
        key={editEntry?.id ?? "new"}
        open={showForm}
        onOpenChange={handleCloseForm}
        entry={editEntry}
        defaultType={defaultType}
      />

      <DailyClosingDialog open={showClosing} onOpenChange={setShowClosing} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.description}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) deleteEntry.mutate(deleteTarget.id); setDeleteTarget(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!payTarget} onOpenChange={(v) => !v && setPayTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar recebimento</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Confirmar pagamento de <strong>{formatCurrency(payTarget?.amount || 0)}</strong> referente a <strong>{payTarget?.description}</strong>?
                </p>
                {payTarget?.type === "receber" && (
                  <p className="text-xs text-muted-foreground">
                    O valor será registrado automaticamente no caixa aberto.
                  </p>
                )}
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">Forma de pagamento</label>
                  <Select value={payMethod} onValueChange={(v) => setPayMethod(v as any)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="debito">Débito</SelectItem>
                      <SelectItem value="credito">Crédito</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (payTarget) {
                  markAsPaid.mutate({
                    id: payTarget.id,
                    paid_amount: payTarget.amount,
                    payment_method: payMethod,
                  });
                }
                setPayTarget(null);
              }}
            >
              Confirmar Pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, paid, color }: { icon: ComponentType<{ className?: string }>; label: string; value: number; paid?: number; color: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3 sm:p-4 card-shadow min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color} shrink-0`} />
        <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</p>
      </div>
      <p className={`text-lg sm:text-xl font-bold font-mono ${color} truncate`}>{formatCurrency(value)}</p>
      {paid !== undefined && (
        <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Realizado: {formatCurrency(paid)}</p>
      )}
    </div>
  );
}
