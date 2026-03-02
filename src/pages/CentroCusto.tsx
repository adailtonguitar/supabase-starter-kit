import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Download, TrendingUp, TrendingDown, Building2,
} from "lucide-react";
import { useFinancialEntries } from "@/hooks/useFinancialEntries";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PieChart as RechartsPie, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const COLORS = [
  "hsl(var(--primary))", "hsl(var(--destructive))", "hsl(160, 60%, 45%)",
  "hsl(45, 90%, 50%)", "hsl(280, 60%, 55%)", "hsl(200, 70%, 50%)",
  "hsl(15, 80%, 55%)", "hsl(330, 60%, 50%)",
];

export default function CentroCusto() {
  const now = new Date();
  const [month, setMonth] = useState(format(now, "yyyy-MM"));
  const startDate = `${month}-01`;
  const endDate = `${month}-31`;
  const { data: entries = [], isLoading } = useFinancialEntries({ startDate, endDate });

  const prevMonth = () => { const d = parseISO(`${month}-01`); d.setMonth(d.getMonth() - 1); setMonth(format(d, "yyyy-MM")); };
  const nextMonth = () => { const d = parseISO(`${month}-01`); d.setMonth(d.getMonth() + 1); setMonth(format(d, "yyyy-MM")); };

  const { costCenterData, pieData, barData, totals } = useMemo(() => {
    const grouped: Record<string, { receitas: number; despesas: number; count: number }> = {};
    entries.forEach((entry: any) => {
      const cc = entry.cost_center || "Sem centro de custo";
      if (!grouped[cc]) grouped[cc] = { receitas: 0, despesas: 0, count: 0 };
      grouped[cc].count++;
      const amount = Number(entry.paid_amount || entry.amount);
      if (entry.type === "receber") grouped[cc].receitas += amount;
      else grouped[cc].despesas += amount;
    });
    const sortedKeys = Object.keys(grouped).sort((a, b) => (grouped[b].receitas + grouped[b].despesas) - (grouped[a].receitas + grouped[a].despesas));
    const tableData = sortedKeys.map(cc => ({ name: cc, ...grouped[cc], resultado: grouped[cc].receitas - grouped[cc].despesas }));
    const pie = sortedKeys.filter(cc => grouped[cc].despesas > 0).map((cc, i) => ({ name: cc, value: grouped[cc].despesas, color: COLORS[i % COLORS.length] }));
    const bar = sortedKeys.map(cc => ({ name: cc.length > 15 ? cc.substring(0, 15) + "…" : cc, fullName: cc, receitas: grouped[cc].receitas, despesas: grouped[cc].despesas }));
    const totalReceitas = Object.values(grouped).reduce((s, g) => s + g.receitas, 0);
    const totalDespesas = Object.values(grouped).reduce((s, g) => s + g.despesas, 0);
    return { costCenterData: tableData, pieData: pie, barData: bar, totals: { receitas: totalReceitas, despesas: totalDespesas, resultado: totalReceitas - totalDespesas } };
  }, [entries]);

  const handleExportCSV = () => {
    const csv = ["Centro de Custo;Receitas;Despesas;Resultado;Lançamentos", ...costCenterData.map(cc => `${cc.name};${cc.receitas.toFixed(2)};${cc.despesas.toFixed(2)};${cc.resultado.toFixed(2)};${cc.count}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `centro-custo-${month}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (<div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm"><p className="font-semibold text-foreground">{payload[0].name}</p><p className="text-destructive">{formatCurrency(payload[0].value)}</p></div>);
  };
  const CustomBarTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    return (<div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm"><p className="font-semibold text-foreground mb-1">{data.fullName}</p><p className="text-primary">Receitas: {formatCurrency(data.receitas)}</p><p className="text-destructive">Despesas: {formatCurrency(data.despesas)}</p></div>);
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Centro de Custo</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Análise de receitas e despesas por departamento</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} className="self-start sm:self-auto"><Download className="w-4 h-4 mr-2" />CSV</Button>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="text-sm font-semibold text-foreground min-w-[130px] text-center capitalize">{format(parseISO(`${month}-01`), "MMMM yyyy", { locale: ptBR })}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
      </div>

      <div className="bg-muted/50 border border-border rounded-xl p-3 sm:p-4 flex items-start gap-2 sm:gap-3">
        <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs sm:text-sm font-medium text-foreground">Como usar</p>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">Ao criar ou editar um lançamento financeiro, selecione o "Centro de Custo" para classificar a despesa/receita.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-card rounded-xl border border-border p-3 sm:p-4 card-shadow"><div className="flex items-center gap-1.5 mb-0.5"><TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" /><p className="text-[10px] sm:text-xs text-muted-foreground">Receitas</p></div><p className="text-base sm:text-xl font-bold font-mono text-primary">{isLoading ? <Skeleton className="h-6 w-20" /> : formatCurrency(totals.receitas)}</p></div>
        <div className="bg-card rounded-xl border border-border p-3 sm:p-4 card-shadow"><div className="flex items-center gap-1.5 mb-0.5"><TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-destructive" /><p className="text-[10px] sm:text-xs text-muted-foreground">Despesas</p></div><p className="text-base sm:text-xl font-bold font-mono text-destructive">{isLoading ? <Skeleton className="h-6 w-20" /> : formatCurrency(totals.despesas)}</p></div>
        <div className="bg-card rounded-xl border border-border p-3 sm:p-4 card-shadow col-span-2 sm:col-span-1"><p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Centros Ativos</p><p className="text-base sm:text-xl font-bold font-mono text-foreground">{isLoading ? <Skeleton className="h-6 w-12" /> : costCenterData.length}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl card-shadow border border-border p-3 sm:p-5">
          <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-3">Despesas por Centro</h3>
          {isLoading ? <Skeleton className="h-[200px] sm:h-[250px] w-full" /> : pieData.length === 0 ? (
            <div className="h-[200px] sm:h-[250px] flex items-center justify-center text-muted-foreground text-xs sm:text-sm">Nenhuma despesa com centro de custo</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <RechartsPie><Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name.length > 10 ? name.substring(0, 10) + '…' : name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>{pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}</Pie><Tooltip content={<CustomPieTooltip />} /></RechartsPie>
            </ResponsiveContainer>
          )}
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl card-shadow border border-border p-3 sm:p-5">
          <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-3">Receitas × Despesas</h3>
          {isLoading ? <Skeleton className="h-[200px] sm:h-[250px] w-full" /> : barData.length === 0 ? (
            <div className="h-[200px] sm:h-[250px] flex items-center justify-center text-muted-foreground text-xs sm:text-sm">Nenhum dado disponível</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={35} />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey="receitas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        <h3 className="text-xs font-semibold text-foreground">Detalhamento</h3>
        {isLoading ? [...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />) : costCenterData.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Nenhum lançamento com centro de custo neste período.</p>
        ) : (
          <>
            {costCenterData.map(cc => (
              <div key={cc.name} className="bg-card rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between"><span className="text-sm font-medium text-foreground truncate mr-2">{cc.name}</span><Badge variant="secondary" className="text-[10px]">{cc.count} lanç.</Badge></div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-[10px] text-muted-foreground">Receitas</p><p className="text-xs font-mono font-semibold text-primary">{cc.receitas > 0 ? formatCurrency(cc.receitas) : "—"}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Despesas</p><p className="text-xs font-mono font-semibold text-destructive">{cc.despesas > 0 ? formatCurrency(cc.despesas) : "—"}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Resultado</p><p className={cn("text-xs font-mono font-bold", cc.resultado >= 0 ? "text-primary" : "text-destructive")}>{formatCurrency(cc.resultado)}</p></div>
                </div>
              </div>
            ))}
            <div className="bg-muted/50 rounded-xl border-2 border-border p-3">
              <div className="flex items-center justify-between mb-2"><span className="text-sm font-bold text-foreground">TOTAL</span><Badge variant="secondary" className="text-[10px]">{costCenterData.reduce((s, c) => s + c.count, 0)} lanç.</Badge></div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-xs font-mono font-bold text-primary">{formatCurrency(totals.receitas)}</p></div>
                <div><p className="text-xs font-mono font-bold text-destructive">{formatCurrency(totals.despesas)}</p></div>
                <div><p className={cn("text-xs font-mono font-bold", totals.resultado >= 0 ? "text-primary" : "text-destructive")}>{formatCurrency(totals.resultado)}</p></div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Desktop Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl card-shadow border border-border overflow-hidden hidden sm:block">
        <div className="px-5 py-3 border-b border-border bg-muted/30"><h3 className="text-sm font-semibold text-foreground">Detalhamento por Centro de Custo</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Centro de Custo</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Receitas</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Despesas</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Resultado</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Lançamentos</th>
            </tr></thead>
            <tbody>
              {isLoading ? [...Array(4)].map((_, i) => (<tr key={i} className="border-b border-border"><td className="px-5 py-2.5" colSpan={5}><Skeleton className="h-5 w-full" /></td></tr>)) : costCenterData.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Nenhum lançamento com centro de custo neste período.</td></tr>
              ) : (<>
                {costCenterData.map(cc => (
                  <tr key={cc.name} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-5 py-2.5 font-medium text-foreground">{cc.name}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-primary">{cc.receitas > 0 ? formatCurrency(cc.receitas) : "—"}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-destructive">{cc.despesas > 0 ? formatCurrency(cc.despesas) : "—"}</td>
                    <td className={cn("px-5 py-2.5 text-right font-mono font-semibold", cc.resultado >= 0 ? "text-primary" : "text-destructive")}>{formatCurrency(cc.resultado)}</td>
                    <td className="px-5 py-2.5 text-center"><Badge variant="secondary">{cc.count}</Badge></td>
                  </tr>
                ))}
                <tr className="bg-muted/40 border-t-2 border-border">
                  <td className="px-5 py-2.5 font-bold text-foreground">TOTAL</td>
                  <td className="px-5 py-2.5 text-right font-mono font-bold text-primary">{formatCurrency(totals.receitas)}</td>
                  <td className="px-5 py-2.5 text-right font-mono font-bold text-destructive">{formatCurrency(totals.despesas)}</td>
                  <td className={cn("px-5 py-2.5 text-right font-mono font-bold", totals.resultado >= 0 ? "text-primary" : "text-destructive")}>{formatCurrency(totals.resultado)}</td>
                  <td className="px-5 py-2.5 text-center"><Badge variant="secondary">{costCenterData.reduce((s, c) => s + c.count, 0)}</Badge></td>
                </tr>
              </>)}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}