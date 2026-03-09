import { useMemo } from "react";
import { format, parseISO, getDaysInMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface Entry {
  due_date: string;
  amount: number;
  paid_amount?: number;
  type: "pagar" | "receber";
  status: string;
}

interface CashFlowChartProps {
  entries: Entry[];
  month: string;
}

export function CashFlowChart({ entries, month }: CashFlowChartProps) {
  const data = useMemo(() => {
    const year = parseInt(month.split("-")[0]);
    const mon = parseInt(month.split("-")[1]);
    const totalDays = getDaysInMonth(new Date(year, mon - 1));

    const dayMap: Record<number, { receitas: number; despesas: number }> = {};
    for (let d = 1; d <= totalDays; d++) {
      dayMap[d] = { receitas: 0, despesas: 0 };
    }

    for (const e of entries) {
      if (e.status === "cancelado") continue;
      const day = parseInt(e.due_date.split("-")[2]);
      if (!dayMap[day]) continue;
      const val = Number(e.paid_amount || e.amount);
      if (e.type === "receber") {
        dayMap[day].receitas += val;
      } else {
        dayMap[day].despesas += val;
      }
    }

    return Array.from({ length: totalDays }, (_, i) => {
      const d = i + 1;
      return {
        day: String(d).padStart(2, "0"),
        receitas: Math.round(dayMap[d].receitas * 100) / 100,
        despesas: Math.round(dayMap[d].despesas * 100) / 100,
        saldo: Math.round((dayMap[d].receitas - dayMap[d].despesas) * 100) / 100,
      };
    });
  }, [entries, month]);

  if (entries.length === 0) return null;

  const monthLabel = format(parseISO(`${month}-01`), "MMMM yyyy", { locale: ptBR });

  return (
    <div className="bg-card rounded-xl card-shadow border border-border p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Fluxo de Caixa</h3>
        <span className="text-[10px] sm:text-xs text-muted-foreground">{entries.length} lançamentos em {monthLabel}</span>
      </div>
      <div className="h-[220px] sm:h-[280px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={0} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              width={40}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-popover border border-border rounded-lg p-2.5 shadow-lg text-xs">
                    <p className="font-semibold text-foreground mb-1.5">Dia {label}</p>
                    {payload.map((p: any) => (
                      <p key={p.dataKey} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="text-muted-foreground">{p.name}:</span>
                        <span className="font-mono font-medium text-foreground">{formatCurrency(p.value)}</span>
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value) => <span className="text-muted-foreground">{value}</span>}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
