import { useState, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useFinancialEntries } from "@/hooks/useFinancialEntries";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";
import { Upload, CheckCircle2, XCircle, Link2, Unlink, Search, FileUp, ArrowRightLeft, DollarSign, AlertCircle } from "lucide-react";

export default function ConciliacaoBancaria() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["bank_transactions", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("bank_transactions").select("*").eq("company_id", companyId).order("transaction_date", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const threeMonthsAgo = format(subMonths(new Date(), 3), "yyyy-MM-dd");
  const { data: entries = [] } = useFinancialEntries({ startDate: threeMonthsAgo });

  const filtered = useMemo(() => {
    let list = transactions;
    if (filterStatus === "reconciled") list = list.filter((t: any) => t.reconciled);
    if (filterStatus === "pending") list = list.filter((t: any) => !t.reconciled);
    if (search) { const q = search.toLowerCase(); list = list.filter((t: any) => t.description.toLowerCase().includes(q) || String(t.amount).includes(q)); }
    return list;
  }, [transactions, filterStatus, search]);

  const stats = useMemo(() => {
    const total = transactions.length;
    const reconciled = transactions.filter((t: any) => t.reconciled).length;
    const pending = total - reconciled;
    const totalCredit = transactions.filter((t: any) => t.type === "credit").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalDebit = transactions.filter((t: any) => t.type === "debit").reduce((s: number, t: any) => s + Number(t.amount), 0);
    return { total, reconciled, pending, totalCredit, totalDebit };
  }, [transactions]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId || !user) return;
    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) { toast.error("Arquivo vazio ou formato inválido"); return; }
      const sep = lines[0].includes(";") ? ";" : ",";
      const header = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      const dateIdx = header.findIndex((h) => h.includes("data") || h.includes("date"));
      const descIdx = header.findIndex((h) => h.includes("descri") || h.includes("hist") || h.includes("description"));
      const amountIdx = header.findIndex((h) => h.includes("valor") || h.includes("amount") || h.includes("value"));
      if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) { toast.error("Colunas obrigatórias não encontradas. Use: Data, Descrição, Valor"); return; }
      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map((c) => c.trim().replace(/"/g, ""));
        if (cols.length <= Math.max(dateIdx, descIdx, amountIdx)) continue;
        const rawDate = cols[dateIdx]; const description = cols[descIdx];
        let amount = parseFloat(cols[amountIdx].replace(/\./g, "").replace(",", "."));
        if (isNaN(amount)) continue;
        let txDate: string;
        if (rawDate.includes("/")) { const parts = rawDate.split("/"); txDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`; } else txDate = rawDate;
        rows.push({ company_id: companyId, transaction_date: txDate, description, amount: Math.abs(amount), type: amount >= 0 ? "credit" : "debit", imported_by: user.id });
      }
      if (rows.length === 0) { toast.error("Nenhuma transação válida encontrada"); return; }
      const { error } = await supabase.from("bank_transactions").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} transações importadas!`);
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
      setImportOpen(false);
    } catch (err: any) { toast.error("Erro na importação: " + err.message); }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const matchMutation = useMutation({
    mutationFn: async ({ txId, entryId }: { txId: string; entryId: string }) => {
      const { error } = await supabase.from("bank_transactions").update({ reconciled: true, financial_entry_id: entryId }).eq("id", txId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank_transactions"] }); toast.success("Transação conciliada!"); setMatchOpen(false); setSelectedTx(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const unmatchMutation = useMutation({
    mutationFn: async (txId: string) => {
      const { error } = await supabase.from("bank_transactions").update({ reconciled: false, financial_entry_id: null }).eq("id", txId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank_transactions"] }); toast.success("Conciliação desfeita"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoMatch = async () => {
    const pending = transactions.filter((t: any) => !t.reconciled);
    let matched = 0;
    for (const tx of pending) {
      const candidates = entries.filter((e: any) => Math.abs(Number(e.amount) - Number(tx.amount)) < 0.01 && ((tx.type === "credit" && e.type === "receber") || (tx.type === "debit" && e.type === "pagar")));
      if (candidates.length === 1) {
        const { error } = await supabase.from("bank_transactions").update({ reconciled: true, financial_entry_id: candidates[0].id }).eq("id", tx.id);
        if (!error) matched++;
      }
    }
    qc.invalidateQueries({ queryKey: ["bank_transactions"] });
    toast.success(`${matched} transações conciliadas automaticamente`);
  };

  const suggestions = useMemo(() => {
    if (!selectedTx) return [];
    return entries.filter((e: any) => (selectedTx.type === "credit" && e.type === "receber") || (selectedTx.type === "debit" && e.type === "pagar"))
      .sort((a: any, b: any) => Math.abs(Number(a.amount) - Number(selectedTx.amount)) - Math.abs(Number(b.amount) - Number(selectedTx.amount))).slice(0, 10);
  }, [selectedTx, entries]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div><h1 className="text-2xl font-bold text-foreground">Conciliação Bancária</h1><p className="text-muted-foreground text-sm">Importe extratos e concilie com lançamentos financeiros</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={autoMatch}><ArrowRightLeft className="w-4 h-4 mr-1" /> Auto-Conciliar</Button>
          <Button size="sm" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4 mr-1" /> Importar CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-primary/10"><FileUp className="w-5 h-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">Total Importado</p><p className="text-lg font-bold">{stats.total}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-green-500/10"><CheckCircle2 className="w-5 h-5 text-green-500" /></div><div><p className="text-xs text-muted-foreground">Conciliadas</p><p className="text-lg font-bold">{stats.reconciled}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-orange-500/10"><AlertCircle className="w-5 h-5 text-orange-500" /></div><div><p className="text-xs text-muted-foreground">Pendentes</p><p className="text-lg font-bold">{stats.pending}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-chart-2/20"><DollarSign className="w-5 h-5 text-chart-2" /></div><div><p className="text-xs text-muted-foreground">Saldo Extrato</p><p className="text-lg font-bold">{fmt(stats.totalCredit - stats.totalDebit)}</p></div></CardContent></Card>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar transação..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="pending">Pendentes</SelectItem><SelectItem value="reconciled">Conciliadas</SelectItem></SelectContent></Select>
      </div>

      <Card><CardContent className="p-0">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-12">{transactions.length === 0 ? "Nenhuma transação importada. Use o botão 'Importar CSV' para começar." : "Nenhuma transação encontrada com os filtros aplicados."}</p>
        ) : (
          <div className="overflow-x-auto"><Table><TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
          </TableRow></TableHeader><TableBody>
            {filtered.map((tx: any) => (
              <TableRow key={tx.id}>
                <TableCell className="whitespace-nowrap">{format(new Date(tx.transaction_date + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                <TableCell className="max-w-[300px] truncate">{tx.description}</TableCell>
                <TableCell className={`text-right font-medium ${tx.type === "credit" ? "text-green-600" : "text-red-500"}`}>{tx.type === "debit" ? "- " : ""}{fmt(Number(tx.amount))}</TableCell>
                <TableCell><Badge variant={tx.type === "credit" ? "default" : "destructive"}>{tx.type === "credit" ? "Crédito" : "Débito"}</Badge></TableCell>
                <TableCell>{tx.reconciled ? <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50"><CheckCircle2 className="w-3 h-3 mr-1" /> Conciliada</Badge> : <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50"><XCircle className="w-3 h-3 mr-1" /> Pendente</Badge>}</TableCell>
                <TableCell className="text-right">{tx.reconciled ? <Button variant="ghost" size="sm" onClick={() => unmatchMutation.mutate(tx.id)}><Unlink className="w-4 h-4 mr-1" /> Desfazer</Button> : <Button variant="ghost" size="sm" onClick={() => { setSelectedTx(tx); setMatchOpen(true); }}><Link2 className="w-4 h-4 mr-1" /> Conciliar</Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table></div>
        )}
      </CardContent></Card>

      <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent><DialogHeader><DialogTitle>Importar Extrato Bancário (CSV)</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">O arquivo CSV deve conter as colunas: <strong>Data</strong>, <strong>Descrição</strong> e <strong>Valor</strong>. Valores negativos serão tratados como débito.</p><Input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} /></div></DialogContent></Dialog>

      <Dialog open={matchOpen} onOpenChange={(o) => { setMatchOpen(o); if (!o) setSelectedTx(null); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Conciliar Transação</DialogTitle></DialogHeader>
        {selectedTx && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/50 text-sm"><p><strong>Data:</strong> {format(new Date(selectedTx.transaction_date + "T12:00:00"), "dd/MM/yyyy")}</p><p><strong>Descrição:</strong> {selectedTx.description}</p><p><strong>Valor:</strong> {fmt(Number(selectedTx.amount))} ({selectedTx.type === "credit" ? "Crédito" : "Débito"})</p></div>
            <p className="text-sm font-medium">Lançamentos sugeridos (ordenados por proximidade de valor):</p>
            {suggestions.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum lançamento compatível encontrado.</p> : (
              <div className="max-h-[300px] overflow-y-auto"><Table><TableHeader><TableRow><TableHead>Descrição</TableHead><TableHead>Vencimento</TableHead><TableHead className="text-right">Valor</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
                {suggestions.map((entry: any) => {
                  const diff = Math.abs(Number(entry.amount) - Number(selectedTx.amount));
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="max-w-[200px] truncate">{entry.description}</TableCell>
                      <TableCell>{format(new Date(entry.due_date + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-right">{fmt(Number(entry.amount))}{diff < 0.01 && <Badge variant="secondary" className="ml-2 text-xs">Exato</Badge>}</TableCell>
                      <TableCell><Button size="sm" onClick={() => matchMutation.mutate({ txId: selectedTx.id, entryId: entry.id })}><Link2 className="w-3 h-3 mr-1" /> Vincular</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody></Table></div>
            )}
          </div>
        )}
      </DialogContent></Dialog>
    </div>
  );
}