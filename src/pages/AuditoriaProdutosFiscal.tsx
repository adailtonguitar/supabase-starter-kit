/**
 * Relatório de Auditoria Fiscal de Produtos.
 * Lista produtos com problema de CFOP detectado por auditProductFiscal,
 * ordenando por severidade (errors → warns → info) e quantidade de vendas (impacto).
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, Info, ExternalLink } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { auditProductFiscal, getWorstSeverity, type ProductAuditSeverity } from "@/lib/product-fiscal-audit";
import { Skeleton } from "@/components/ui/skeleton";

const SEV_ORDER: Record<ProductAuditSeverity, number> = { error: 0, warn: 1, info: 2 };

function useSalesCountByProduct() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["sales-count-by-product", companyId],
    queryFn: async (): Promise<Record<string, number>> => {
      if (!companyId) return {};
      const { data, error } = await supabase
        .from("sale_items" as never)
        .select("product_id, quantity")
        .eq("company_id" as never, companyId)
        .limit(20000);
      if (error) {
        console.warn("[AuditoriaProdutosFiscal] Falha ao agregar vendas:", error);
        return {};
      }
      const map: Record<string, number> = {};
      for (const row of (data || []) as Array<{ product_id?: string | null; quantity?: number | null }>) {
        const id = row.product_id;
        if (!id) continue;
        map[id] = (map[id] || 0) + Number(row.quantity || 0);
      }
      return map;
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export default function AuditoriaProdutosFiscal() {
  const { data: products = [], isLoading } = useProducts();
  const { data: salesCount = {} } = useSalesCountByProduct();

  const rows = useMemo(() => {
    const out = products
      .map((p) => {
        const issues = auditProductFiscal({ id: p.id, name: p.name, cfop: p.cfop });
        const worst = getWorstSeverity(issues);
        return { product: p, issues, worst, sales: salesCount[p.id] || 0 };
      })
      .filter((r) => r.worst !== null);

    out.sort((a, b) => {
      const sv = SEV_ORDER[a.worst!] - SEV_ORDER[b.worst!];
      if (sv !== 0) return sv;
      return b.sales - a.sales;
    });
    return out;
  }, [products, salesCount]);

  const counts = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0 };
    rows.forEach((r) => { if (r.worst) c[r.worst]++; });
    return c;
  }, [rows]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Auditoria Fiscal de Produtos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Detecta CFOPs incorretos no cadastro de produtos antes da venda ou emissão. Não altera dados.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="Erros" count={counts.error} icon={<AlertCircle className="w-4 h-4" />} tone="error" />
        <SummaryCard label="Alertas" count={counts.warn} icon={<AlertTriangle className="w-4 h-4" />} tone="warn" />
        <SummaryCard label="ST detectado" count={counts.info} icon={<Info className="w-4 h-4" />} tone="info" />
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Produto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">CFOP</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Problema</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Qtd vendida</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={5} className="px-4 py-3"><Skeleton className="h-6 w-full" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhum problema de CFOP detectado nos produtos cadastrados.
                  </td>
                </tr>
              ) : (
                rows.map(({ product, issues, worst, sales }) => (
                  <tr key={product.id} className="border-b border-border last:border-0 hover:bg-primary/[0.03]">
                    <td className="px-4 py-3 font-medium text-foreground">{product.name}</td>
                    <td className="px-4 py-3 font-mono">{product.cfop || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3">
                      <ul className="space-y-0.5">
                        {issues.map((i, idx) => (
                          <li key={idx} className={`text-xs ${
                            i.severity === "error" ? "text-destructive" :
                            i.severity === "warn"  ? "text-amber-700 dark:text-amber-300" :
                                                     "text-sky-700 dark:text-sky-300"
                          }`}>• {i.message}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">{sales || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/produtos?edit=${product.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Abrir <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, count, icon, tone }: { label: string; count: number; icon: React.ReactNode; tone: ProductAuditSeverity }) {
  const styles =
    tone === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" :
    tone === "warn"  ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" :
                       "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return (
    <div className={`rounded-2xl border px-4 py-3 ${styles} flex items-center justify-between`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">{count}</div>
    </div>
  );
}
