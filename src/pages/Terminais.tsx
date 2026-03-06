import { useState, useEffect, useCallback } from "react";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Monitor, RefreshCw, Clock, DollarSign, ShoppingCart, AlertTriangle, Power, User, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TerminalSession { id: string; terminal_id: string; status: string; opened_at: string; closed_at: string | null; opened_by: string; opening_balance: number; total_vendas: number | null; total_dinheiro: number | null; total_debito: number | null; total_credito: number | null; total_pix: number | null; total_sangria: number | null; total_suprimento: number | null; sales_count: number | null; closing_balance: number | null; difference: number | null; }
interface ProfileInfo { id: string; full_name: string | null; email: string | null; }

const ALL_TERMINALS = ["01", "02", "03", "04", "05", "06", "07", "08"];

export default function Terminais() {
  const { companyId } = useCompany();
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadSessions = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase.from("cash_sessions").select("*").eq("company_id", companyId).order("opened_at", { ascending: false });
      if (error) throw error;
      const latestByTerminal = new Map<string, TerminalSession>();
      (data || []).forEach((s: any) => { if (!latestByTerminal.has(s.terminal_id)) latestByTerminal.set(s.terminal_id, s); });
      setSessions(Array.from(latestByTerminal.values()));
      const userIds = [...new Set(Array.from(latestByTerminal.values()).map((s) => s.opened_by))];
      if (userIds.length > 0) {
        const { data: profileData } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
        if (profileData) { const map: Record<string, ProfileInfo> = {}; profileData.forEach((p: any) => { map[p.id] = p; }); setProfiles(map); }
      }
    } catch { toast.error("Erro ao carregar terminais"); } finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { if (!autoRefresh) return; const interval = setInterval(loadSessions, 15000); return () => clearInterval(interval); }, [autoRefresh, loadSessions]);
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase.channel("terminal-monitor").on("postgres_changes", { event: "*", schema: "public", table: "cash_sessions", filter: `company_id=eq.${companyId}` }, () => loadSessions()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, loadSessions]);

  const getSessionForTerminal = (tid: string) => sessions.find((s) => s.terminal_id === tid);
  const getOperatorName = (userId: string) => { const p = profiles[userId]; return p?.full_name || p?.email || userId.slice(0, 8); };
  const formatCurrency = (v: number | null) => `R$ ${(v || 0).toFixed(2).replace(".", ",")}`;
  const openTerminals = sessions.filter((s) => s.status === "aberto");
  const totalSalesAll = openTerminals.reduce((a, s) => a + Number(s.total_vendas || 0), 0);
  const totalTransactions = openTerminals.reduce((a, s) => a + Number(s.sales_count || 0), 0);
  const [forceCloseTarget, setForceCloseTarget] = useState<TerminalSession | null>(null);

  const handleForceClose = async () => {
    if (!forceCloseTarget) return;
    const session = forceCloseTarget; setForceCloseTarget(null);
    try {
      const { error } = await supabase.from("cash_sessions").update({ status: "fechado" as any, closed_at: new Date().toISOString(), notes: "Fechamento forçado pelo gerente via painel de terminais" }).eq("id", session.id);
      if (error) throw error;
      toast.success(`Terminal ${session.terminal_id} fechado com sucesso`); loadSessions();
    } catch { toast.error("Erro ao fechar terminal"); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground">Painel de Terminais</h1><p className="text-sm text-muted-foreground">Monitoramento em tempo real dos terminais PDV</p></div>
        <div className="flex items-center gap-2">
          <Button variant={autoRefresh ? "default" : "outline"} size="sm" onClick={() => setAutoRefresh(!autoRefresh)}><RefreshCw className={`w-4 h-4 mr-1 ${autoRefresh ? "animate-spin" : ""}`} />{autoRefresh ? "Auto" : "Manual"}</Button>
          <Button variant="outline" size="sm" onClick={loadSessions}><RefreshCw className="w-4 h-4 mr-1" /> Atualizar</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Monitor className="w-5 h-5 text-primary" /></div><div><p className="text-sm text-muted-foreground">Terminais Abertos</p><p className="text-2xl font-bold text-foreground">{openTerminals.length}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-success" /></div><div><p className="text-sm text-muted-foreground">Total Vendas (abertos)</p><p className="text-2xl font-bold text-foreground">{formatCurrency(totalSalesAll)}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center"><ShoppingCart className="w-5 h-5 text-info" /></div><div><p className="text-sm text-muted-foreground">Transações Hoje</p><p className="text-2xl font-bold text-foreground">{totalTransactions}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-warning" /></div><div><p className="text-sm text-muted-foreground">Ticket Médio</p><p className="text-2xl font-bold text-foreground">{totalTransactions > 0 ? formatCurrency(totalSalesAll / totalTransactions) : "R$ 0,00"}</p></div></CardContent></Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {ALL_TERMINALS.map((tid) => {
          const session = getSessionForTerminal(tid);
          const isOpen = session?.status === "aberto";
          return (
            <Card key={tid} className={`transition-all ${isOpen ? "border-primary/50 shadow-md" : "opacity-60"}`}>
              <CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-lg flex items-center gap-2"><Monitor className={`w-5 h-5 ${isOpen ? "text-primary" : "text-muted-foreground"}`} />Terminal {tid}</CardTitle><Badge variant={isOpen ? "default" : "secondary"}>{isOpen ? "Aberto" : "Fechado"}</Badge></div></CardHeader>
              <CardContent className="space-y-3">
                {session ? (<>
                  <div className="flex items-center gap-2 text-sm"><User className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">Operador:</span><span className="font-medium text-foreground truncate">{getOperatorName(session.opened_by)}</span></div>
                  <div className="flex items-center gap-2 text-sm"><Clock className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">{isOpen ? `Aberto ${formatDistanceToNow(new Date(session.opened_at), { locale: ptBR, addSuffix: true })}` : `Fechado ${session.closed_at ? formatDistanceToNow(new Date(session.closed_at), { locale: ptBR, addSuffix: true }) : ""}`}</span></div>
                  {isOpen && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Vendas:</span><span className="font-medium text-foreground">{formatCurrency(session.total_vendas)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Dinheiro:</span><span className="text-foreground">{formatCurrency(session.total_dinheiro)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Débito:</span><span className="text-foreground">{formatCurrency(session.total_debito)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Crédito:</span><span className="text-foreground">{formatCurrency(session.total_credito)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">PIX:</span><span className="text-foreground">{formatCurrency(session.total_pix)}</span></div>
                      <div className="border-t border-border mt-1 pt-1 flex justify-between text-xs"><span className="text-muted-foreground">Sangrias:</span><span className="text-destructive">{formatCurrency(session.total_sangria)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Suprimentos:</span><span className="text-emerald-500">{formatCurrency(session.total_suprimento)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Qtd vendas:</span><span className="font-medium text-foreground">{session.sales_count || 0}</span></div>
                    </div>
                  )}
                  {!isOpen && session.difference !== null && session.difference !== 0 && (
                    <div className="flex items-center gap-2 text-sm"><AlertTriangle className="w-4 h-4 text-amber-500" /><span className="text-amber-500 font-medium">Diferença: {formatCurrency(session.difference)}</span></div>
                  )}
                  {isOpen && <Button variant="destructive" size="sm" className="w-full mt-2" onClick={() => setForceCloseTarget(session)}><Power className="w-4 h-4 mr-1" /> Forçar Fechamento</Button>}
                </>) : <p className="text-sm text-muted-foreground text-center py-4">Nenhuma sessão registrada</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <AlertDialog open={!!forceCloseTarget} onOpenChange={(open) => !open && setForceCloseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Forçar Fechamento</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Tem certeza que deseja forçar o fechamento do <strong className="text-foreground">Terminal {forceCloseTarget?.terminal_id}</strong>?</p>
              <p className="text-xs">Esta ação encerrará a sessão de caixa imediatamente. O operador não poderá mais registrar vendas neste terminal até abrir um novo caixa.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"><Power className="w-4 h-4 mr-1.5" />Forçar Fechamento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
