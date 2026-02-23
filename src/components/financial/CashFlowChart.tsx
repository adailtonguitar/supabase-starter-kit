interface CashFlowChartProps {
  entries: any[];
  month: string;
}

export function CashFlowChart({ entries, month }: CashFlowChartProps) {
  if (entries.length === 0) return null;
  return (
    <div className="bg-card rounded-xl card-shadow border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">Fluxo de Caixa</h3>
      <p className="text-xs text-muted-foreground">Gráfico em desenvolvimento — {entries.length} lançamentos em {month}</p>
    </div>
  );
}
