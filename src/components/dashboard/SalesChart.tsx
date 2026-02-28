import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/mock-data";
import { BarChart3 } from "lucide-react";

interface Props {
  data: { date: string; total: number; count: number }[];
}

const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatDay(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return dayNames[d.getDay()];
}

export function SalesChart({ data }: Props) {
  const chartData = data.map((d) => ({
    name: formatDay(d.date),
    vendas: d.total,
    qtd: d.count,
  }));

  const hasData = data.some((d) => d.total > 0);

  return (
    <div className="bg-card rounded-2xl border border-border p-5 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Vendas — Últimos 7 dias</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Total: {formatCurrency(data.reduce((s, d) => s + d.total, 0))}
            </p>
          </div>
        </div>
        <div className="text-xs font-mono font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
          {data.reduce((s, d) => s + d.count, 0)} vendas
        </div>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-primary, hsl(var(--primary)))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--chart-primary, hsl(var(--primary)))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" strokeOpacity={0.4} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 500 }} className="stroke-muted-foreground" tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} className="stroke-muted-foreground" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} width={50} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(value: number) => [formatCurrency(value), "Vendas"]}
              contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }}
            />
            <Area type="monotone" dataKey="vendas" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#salesGrad)" dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "hsl(var(--card))" }} activeDot={{ r: 5, strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
          Nenhuma venda nos últimos 7 dias
        </div>
      )}
    </div>
  );
}
