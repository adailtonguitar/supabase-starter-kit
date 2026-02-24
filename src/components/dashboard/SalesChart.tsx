import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/mock-data";

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
    <div className="bg-card rounded-xl border border-border card-shadow p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Vendas — Últimos 7 dias</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Total: {formatCurrency(data.reduce((s, d) => s + d.total, 0))}
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {data.reduce((s, d) => s + d.count, 0)} vendas
        </div>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(168, 72%, 36%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(168, 72%, 36%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 16%, 90%)" strokeOpacity={0.5} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} width={50} />
            <Tooltip
              formatter={(value: number) => [formatCurrency(value), "Vendas"]}
              contentStyle={{ borderRadius: 8, border: "1px solid hsl(220, 16%, 90%)", fontSize: 12 }}
            />
            <Area type="monotone" dataKey="vendas" stroke="hsl(168, 72%, 36%)" strokeWidth={2.5} fill="url(#salesGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
          Nenhuma venda nos últimos 7 dias
        </div>
      )}
    </div>
  );
}
