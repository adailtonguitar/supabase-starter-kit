import { useState, useMemo } from "react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus,
  Download, Printer,
} from "lucide-react";
import { useFinancialEntries, type FinancialEntry } from "@/hooks/useFinancialEntries";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DRELine {
  label: string;
  value: number;
  bold?: boolean;
  indent?: number;
  highlight?: boolean;
  separator?: boolean;
}

export default function DRE() {
  const now = new Date();
  const [month, setMonth] = useState(format(now, "yyyy-MM"));
  const { companyId } = useCompany();

  const startDate = `${month}-01`;
  const endDate = `${month}-31`;

  const { data: entries = [], isLoading: loadingEntries } = useFinancialEntries({
    startDate,
    endDate,
  });

  const { data: salesDocs = [], isLoading: loadingSales } = useQuery({
    queryKey: ["sales_dre", companyId, month],
    queryFn: async () => {
      if (!companyId) {
        console.warn("[DRE] No companyId");
        return [];
      }
      // console.log("[DRE] Fetching sales for month:", month, "companyId:", companyId);
      const monthDate = parseISO(`${month}-01`);
      const from = startOfMonth(monthDate);
      const to = endOfMonth(monthDate);
      // console.log("[DRE] Date range:", from.toISOString(), "to", to.toISOString());
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, created_at")
        .eq("company_id", companyId)
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .or("status.is.null,status.neq.cancelled");
      if (error) {
        console.error("[DRE] sales error:", error);
        throw error;
      }
      // console.log("[DRE] Sales found:", data?.length, data);
      type SaleRow = { total: number | null };
      return ((data || []) as SaleRow[]).map((s) => ({ total_value: s.total }));
    },
    enabled: !!companyId,
  });

  const isLoading = loadingEntries || loadingSales;

  const dreLines = useMemo((): DRELine[] => {
    const paidEntries = entries.filter((e) => e.status === "pago");
    
    const sumByCategories = (type: "receber" | "pagar", categories: string[]) =>
      paidEntries
        .filter((e) => e.type === type && e.category && categories.includes(e.category))
        .reduce((s: number, e) => s + Number(e.paid_amount ?? e.amount), 0);

    type SaleDocRow = { total_value: number | null };
    const receitaVendas = (salesDocs as SaleDocRow[]).reduce(
      (s: number, d) => s + Number(d.total_value ?? 0),
      0,
    );
    const receitaServicos = sumByCategories("receber", ["servico"]);
    const outrasReceitas = sumByCategories("receber", ["comissao", "reembolso"]);
    const receitaBruta = receitaVendas + receitaServicos + outrasReceitas;

    const impostosSobreVendas = sumByCategories("pagar", ["impostos"]);
    const receitaLiquida = receitaBruta - impostosSobreVendas;

    const custoFornecedores = sumByCategories("pagar", ["fornecedor"]);
    const lucroBruto = receitaLiquida - custoFornecedores;

    const despAluguel = sumByCategories("pagar", ["aluguel"]);
    const despEnergia = sumByCategories("pagar", ["energia"]);
    const despAgua = sumByCategories("pagar", ["agua"]);
    const despInternet = sumByCategories("pagar", ["internet"]);
    const despSalarios = sumByCategories("pagar", ["salario"]);
    const despManutencao = sumByCategories("pagar", ["manutencao"]);
    const despOutros = sumByCategories("pagar", ["outros"]);
    const totalDespOperacionais = despAluguel + despEnergia + despAgua + despInternet + despSalarios + despManutencao + despOutros;

    const resultadoOperacional = lucroBruto - totalDespOperacionais;
    const resultadoLiquido = resultadoOperacional;

    return [
      { label: "RECEITA BRUTA", value: receitaBruta, bold: true, highlight: true },
      { label: "Vendas de Mercadorias", value: receitaVendas, indent: 1 },
      { label: "Prestação de Serviços", value: receitaServicos, indent: 1 },
      { label: "Outras Receitas", value: outrasReceitas, indent: 1 },
      { label: "", value: 0, separator: true },
      { label: "(-) DEDUÇÕES SOBRE RECEITA", value: -impostosSobreVendas, bold: true },
      { label: "Impostos sobre vendas", value: -impostosSobreVendas, indent: 1 },
      { label: "", value: 0, separator: true },
      { label: "(=) RECEITA LÍQUIDA", value: receitaLiquida, bold: true, highlight: true },
      { label: "", value: 0, separator: true },
      { label: "(-) CUSTO DAS MERCADORIAS VENDIDAS", value: -custoFornecedores, bold: true },
      { label: "Compras / Fornecedores", value: -custoFornecedores, indent: 1 },
      { label: "", value: 0, separator: true },
      { label: "(=) LUCRO BRUTO", value: lucroBruto, bold: true, highlight: true },
      { label: "", value: 0, separator: true },
      { label: "(-) DESPESAS OPERACIONAIS", value: -totalDespOperacionais, bold: true },
      { label: "Aluguel", value: -despAluguel, indent: 1 },
      { label: "Energia", value: -despEnergia, indent: 1 },
      { label: "Água", value: -despAgua, indent: 1 },
      { label: "Internet", value: -despInternet, indent: 1 },
      { label: "Salários", value: -despSalarios, indent: 1 },
      { label: "Manutenção", value: -despManutencao, indent: 1 },
      { label: "Outras despesas", value: -despOutros, indent: 1 },
      { label: "", value: 0, separator: true },
      { label: "(=) RESULTADO OPERACIONAL", value: resultadoOperacional, bold: true, highlight: true },
      { label: "", value: 0, separator: true },
      { label: "(=) RESULTADO LÍQUIDO DO PERÍODO", value: resultadoLiquido, bold: true, highlight: true },
    ];
  }, [entries, salesDocs]);

  const resultadoLiquido = dreLines[dreLines.length - 1]?.value || 0;
  const receitaBruta = dreLines[0]?.value || 0;
  const margemLiquida = receitaBruta > 0 ? (resultadoLiquido / receitaBruta) * 100 : 0;

  const prevMonth = () => {
    const d = parseISO(`${month}-01`);
    d.setMonth(d.getMonth() - 1);
    setMonth(format(d, "yyyy-MM"));
  };
  const nextMonth = () => {
    const d = parseISO(`${month}-01`);
    d.setMonth(d.getMonth() + 1);
    setMonth(format(d, "yyyy-MM"));
  };

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
    const csv = [
      "Conta;Valor",
      ...dreLines.filter(l => !l.separator).map(l => `${l.indent ? "  " : ""}${l.label};${l.value.toFixed(2)}`),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DRE-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">DRE</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Demonstrativo de Resultado do Exercício</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Imprimir</span>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="text-sm font-semibold text-foreground min-w-[140px] text-center">
          {format(parseISO(`${month}-01`), "MMMM yyyy", { locale: ptBR })}
        </span>
        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4 card-shadow">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <p className="text-xs text-muted-foreground">Receita Bruta</p>
          </div>
          <p className="text-xl font-bold font-mono text-primary">
            {isLoading ? <Skeleton className="h-7 w-32" /> : formatCurrency(receitaBruta)}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 card-shadow">
          <div className="flex items-center gap-2 mb-1">
            {resultadoLiquido >= 0 ? <TrendingUp className="w-4 h-4 text-primary" /> : <TrendingDown className="w-4 h-4 text-destructive" />}
            <p className="text-xs text-muted-foreground">Resultado Líquido</p>
          </div>
          <p className={cn("text-xl font-bold font-mono", resultadoLiquido >= 0 ? "text-primary" : "text-destructive")}>
            {isLoading ? <Skeleton className="h-7 w-32" /> : formatCurrency(resultadoLiquido)}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 card-shadow">
          <div className="flex items-center gap-2 mb-1">
            <Minus className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Margem Líquida</p>
          </div>
          <p className={cn("text-xl font-bold font-mono", margemLiquida >= 0 ? "text-primary" : "text-destructive")}>
            {isLoading ? <Skeleton className="h-7 w-24" /> : `${margemLiquida.toFixed(1)}%`}
          </p>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl card-shadow border border-border overflow-hidden print:shadow-none">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold text-foreground">
            Demonstrativo de Resultado — {format(parseISO(`${month}-01`), "MMMM yyyy", { locale: ptBR })}
          </h2>
          <p className="text-xs text-muted-foreground">Valores realizados (pagos/recebidos)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Conta</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Valor (R$)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-5 py-2.5" colSpan={2}><Skeleton className="h-5 w-full" /></td>
                  </tr>
                ))
              ) : (
                dreLines.map((line, i) => {
                  if (line.separator) return <tr key={i}><td colSpan={2} className="h-1 bg-border/50" /></tr>;
                  return (
                    <tr key={i} className={cn("border-b border-border last:border-0 transition-colors", line.highlight && "bg-muted/40")}>
                      <td className={cn("px-5 py-2.5 text-foreground", line.bold && "font-semibold", !line.bold && "text-muted-foreground")}
                        style={{ paddingLeft: line.indent ? `${20 + (line.indent * 20)}px` : undefined }}>
                        {line.label}
                      </td>
                      <td className={cn("px-5 py-2.5 text-right font-mono", line.bold && "font-semibold", line.value > 0 && "text-primary", line.value < 0 && "text-destructive", line.value === 0 && "text-muted-foreground")}>
                        {line.value === 0 && !line.bold ? "—" : formatCurrency(Math.abs(line.value))}
                        {line.value < 0 && line.bold && <span className="text-xs ml-1 text-destructive">▼</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
          <p>* DRE baseado nos lançamentos financeiros realizados (status "pago") e vendas autorizadas no período.</p>
        </div>
      </motion.div>
    </div>
  );
}