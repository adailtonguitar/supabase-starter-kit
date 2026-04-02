/**
 * Status de venda que entram no agregado do dashboard (faturamento, últimos 7 dias, etc.).
 * Antes só `completed` e `finalizada` entravam — vendas com NFC-e (`emitida`, `autorizada`, …)
 * ou fiado sumiam do painel mesmo com dados no banco.
 */
export const DASHBOARD_COUNTED_SALE_STATUSES = [
  "completed",
  "finalizada",
  "emitida",
  "autorizada",
  "autorizado",
  "pendente_fiscal",
  "fiado",
  "sinal",
  "simulado",
] as const;

/** Filtro PostgREST: status na lista OU legado NULL. */
export function dashboardSalesOrFilter(): string {
  const listed = DASHBOARD_COUNTED_SALE_STATUSES.join(",");
  return `status.in.(${listed}),status.is.null`;
}
