import { useState, useMemo } from "react";
import { format, addDays, startOfDay, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, Download, AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import { useFinancialEntries } from "@/hooks/useFinancialEntries";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

type ViewRange = "30" | "60" | "90";

export default function FluxoCaixaProjetado() {
  const now = new Date();
  const { companyId } = useCompany();
  const [range, setRange] = useState<ViewRange>("30");
  const [showPaid, setShowPaid] = useState(false);

  const rangeEnd = addDays(now, Number(range));
  const startDate = format(now, "yyyy-MM-dd");
  const endDate = format(rangeEnd, "yyyy-MM-dd");

  const { data: entries = [], isLoading } = useFinancialEntries({ startDate, endDate });

  const { data: currentBalance = 0 } = useQuery({
    queryKey: ["cash_balance_projected", companyId],
    queryFn: async () => {
      if (!companyId) return 0;
      const { data: session } = await supabase
        .from("cash_sessions")
        .select("opening_balance, total_dinheiro, total_debito, total_credito, total_pix, total_suprimento, total_sangria, status, closing_balance")
        .eq("company_id", companyId)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!session) return 0;
      if (session.status === "fechado") return Number(session.closing_balance || 0);
      return Number(session.opening_balance || 0) + Number(session.total_dinheiro || 0) + Number(session.total_debito || 0) + Number(session.total_credito || 0) + Number(session.total_pix || 0) + Number(session.total_suprimento || 0) - Number(session.total_sangria || 0);
    },
    enabled: !!companyId,
  });

  const { chartData, dailyDetails, totals, alerts } = useMemo(() => {
    const pendingEntries = showPaid ? entries : entries.filter((e: any) => e.status === "pendente" || e.status === "vencido");
    const days = eachDayOfInterval({ start: startOfDay(now), end: startOfDay(rangeEnd) });
    let runningBalance = currentBalance;

    const dailyMap: Record<string, { entradas: number; saidas: number; items: any[] }> = {};
    days.forEach(d => { dailyMap[format(d, "yyyy-MM-dd")] = { entradas: 0, saidas: 0, items: [] }; });

    pendingEntries.forEach((entry: any) => {
      const key = entry.due_date;
      if (dailyMap[key]) {
        const amount = Number(entry.amount);
        if (entry.type === "receber") dailyMap[key].entradas += amount;
        else dailyMap[key].saidas += amount;
        dailyMap[key].items.push(entry);
      }
    });

    const chartPoints: any[] = [];
    const details: any[] = [];
    const negativeAlerts: string[] = [];
    let totalEntradas = 0, totalSaidas = 0;

    days.forEach(d => {
      const key = format(d, "yyyy-MM-dd");
      const day = dailyMap[key];
      runningBalance += day.entradas - day.saidas;
      totalEntradas += day.entradas;
      totalSaidas += day.saidas;
      const label = format(d, "dd/MM", { locale: ptBR });
      chartPoints.push({ date: key, label, saldo: Math.round(runningBalance * 100) / 100, entradas: day.entradas, saidas: day.saidas });
      if (day.entradas > 0 || day.saidas > 0) {
        details.push({ date: key, label: format(d, "dd/MM/yyyy (EEEE)", { locale: ptBR }), entradas: day.entradas, saidas: day.saidas, saldo: runningBalance, items: day.items });
      }
      if (runningBalance < 0) negativeAlerts.push(format(d, "dd/MM/yyyy"));
    });

    return { chartData: chartPoints, dailyDetails: details, totals: { entradas: totalEntradas, saidas: totalSaidas, saldoFinal: runningBalance }, alerts: negativeAlerts };
  }, [entries, currentBalance, now, rangeEnd, showPaid]);

  const handleExportCSV = () => {
    const csv = ["Data;Entradas;Saídas;Saldo Projetado", ...chartData.filter((d: any) => d.entradas > 0 || d.saidas > 0).map((d: any) => `${d.date};${d.entradas.toFixed(2)};${d.saidas.toFixed(2)};${d.saldo.toFixed(2)}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `fluxo-caixa-projetado-${range}d.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm">
        <p className="font-semibold text-foreground mb-1">{data.label}</p>
        {data.entradas > 0 && <p className="text-primary">+ {formatCurrency(data.entradas)}</p>}
        {data.saidas > 0 && <p className="text-destructive">- {formatCurrency(data.saidas)}</p>}
        <p className={cn("font-bold mt-1", data.saldo >= 0 ? "text-primary" : "text-destructive")}>Saldo: {formatCurrency(data.saldo)}</p>
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Fluxo de Caixa Projetado</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Previsão de entradas e saídas para os próximos {range} dias</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPaid(!showPaid)}>
            {showPaid ? <EyeOff className="w-4 h-4 mr-1 sm:mr-2" /> : <Eye className="w-4 h-4 mr-1 sm:mr-2" />}
            <span className="hidden sm:inline">{showPaid ? "Ocultar pagos" : "Mostrar pagos"}</span>
            <span className="sm:hidden">Pagos</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="w-4 h-4 mr-1 sm:mr-2" />CSV</Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(["30", "60", "90"] as ViewRange[]).map(r => (
          <Button key={r} variant={range === r ? "default" : "outline"} size="sm" onClick={() => setRange(r)}>{r} dias</Button>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 sm:p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">Saldo negativo projetado</p>
            <p className="text-xs text-muted-foreground mt-1">O saldo ficará negativo em {alerts.length} dia(s). Primeiro dia: {alerts[0]}.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-card rounded-xl border border-border p-3 sm:p-4 card-shadow">
          <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">Saldo Atual</p>
          <p className="text-base sm:text-xl font-bold font-mono text-foreground">{isLoading ? <Skeleton className="h-6 w-20" /> : formatCurrency(currentBalance)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3 sm:p-4 card-shadow">
          <div className="flex items-center gap-1.5 mb-1"><TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" /><p className="text-[10px] sm:text-xs text-muted-foreground">Entradas</p></div>
          <p className="text-base sm:text-xl font-bold font-mono text-primary">{isLoading ? <Skeleton className="h-6 w-20" /> : formatCurrency(totals.entradas)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3 sm:p-4 card-shadow">
          <div className="flex items-center gap-1.5 mb-1"><TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-destructive" /><p className="text-[10px] sm:text-xs text-muted-foreground">Saídas</p></div>
          <p className="text-base sm:text-xl font-bold font-mono text-destructive">{isLoading ? <Skeleton className="h-6 w-20" /> : formatCurrency(totals.saidas)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3 sm:p-4 card-shadow">
          <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">Saldo Final</p>
          <p className={cn("text-base sm:text-xl font-bold font-mono", totals.saldoFinal >= 0 ? "text-primary" : "text-destructive")}>{isLoading ? <Skeleton className="h-6 w-20" /> : formatCurrency(totals.saldoFinal)}</p>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl card-shadow border border-border p-3 sm:p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Projeção de Saldo</h3>
        {isLoading ? <Skeleton className="h-[250px] sm:h-[300px] w-full" /> : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="saldoGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="saldo" stroke="hsl(var(--primary))" fill="url(#saldoGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        <div className="px-1 py-2"><h3 className="text-sm font-semibold text-foreground">Detalhamento por Dia</h3></div>
        {isLoading ? [...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />) : dailyDetails.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum lançamento pendente nos próximos {range} dias.</div>
        ) : dailyDetails.map((day: any) => (
          <div key={day.date} className={cn("bg-card rounded-xl border border-border p-3 space-y-2", day.saldo < 0 && "border-destructive/30 bg-destructive/5")}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-medium text-foreground">{day.label}</span>
              <span className={cn("text-sm font-mono font-bold", day.saldo >= 0 ? "text-primary" : "text-destructive")}>{formatCurrency(day.saldo)}</span>
            </div>
            <div className="space-y-1">
              {day.items.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Badge variant={item.type === "receber" ? "default" : "destructive"} className="text-[10px] px-1 py-0 shrink-0">{item.type === "receber" ? "E" : "S"}</Badge>
                    <span className="text-muted-foreground truncate">{item.description}</span>
                  </div>
                  <span className="font-mono text-foreground shrink-0">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-[10px] text-muted-foreground pt-1 border-t border-border">
              {day.entradas > 0 && <span className="text-primary">+{formatCurrency(day.entradas)}</span>}
              {day.saidas > 0 && <span className="text-destructive">-{formatCurrency(day.saidas)}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="hidden sm:block bg-card rounded-xl card-shadow border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30"><h3 className="text-sm font-semibold text-foreground">Detalhamento por Dia</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Data</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Entradas</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Saídas</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-border"><td className="px-5 py-2.5" colSpan={5}><Skeleton className="h-5 w-full" /></td></tr>
              )) : dailyDetails.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Nenhum lançamento pendente nos próximos {range} dias.</td></tr>
              ) : dailyDetails.map((day: any) => (
                <tr key={day.date} className={cn("border-b border-border last:border-0 hover:bg-muted/50", day.saldo < 0 && "bg-destructive/5")}>
                  <td className="px-5 py-2.5 font-mono text-xs text-foreground whitespace-nowrap">{day.label}</td>
                  <td className="px-5 py-2.5">
                    <div className="space-y-0.5">
                      {day.items.map((item: any) => (
                        <div key={item.id} className="flex items-center gap-2 text-xs">
                          <Badge variant={item.type === "receber" ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">{item.type === "receber" ? "E" : "S"}</Badge>
                          <span className="text-muted-foreground truncate max-w-[200px]">{item.description}</span>
                          <span className="font-mono text-foreground">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono text-primary">{day.entradas > 0 ? formatCurrency(day.entradas) : "—"}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-destructive">{day.saidas > 0 ? formatCurrency(day.saidas) : "—"}</td>
                  <td className={cn("px-5 py-2.5 text-right font-mono font-semibold", day.saldo >= 0 ? "text-primary" : "text-destructive")}>{formatCurrency(day.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}