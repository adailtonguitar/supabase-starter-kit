import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTS_ACTIVE_OR_LEGACY_NULL } from "@/lib/product-active-filter";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Square, CheckCircle, AlertTriangle, XCircle, ShoppingCart, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";

interface SimResult {
  saleIndex: number;
  success: boolean;
  saleId?: string;
  total: number;
  itemCount: number;
  duration: number;
  error?: string;
  warning?: string;
}

interface SimReport {
  totalSales: number;
  successful: number;
  warnings: number;
  errors: number;
  totalRevenue: number;
  avgDuration: number;
  results: SimResult[];
  startedAt: string;
  finishedAt: string;
}

interface SimulationProduct {
  id: string;
  name: string;
  price: number | string | null;
  stock_quantity: number | string | null;
  unit?: string | null;
}

export function AdminStoreSimulation() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSale, setCurrentSale] = useState(0);
  const [report, setReport] = useState<SimReport | null>(null);
  const [salesCount, setSalesCount] = useState(100);
  const [maxItems, setMaxItems] = useState(10);
  const cancelRef = useRef(false);

  const runSimulation = useCallback(async () => {
    if (!companyId || !user) {
      toast.error("Empresa ou usuário não encontrado");
      return;
    }

    cancelRef.current = false;
    setRunning(true);
    setProgress(0);
    setCurrentSale(0);
    setReport(null);

    const startedAt = new Date().toISOString();
    const results: SimResult[] = [];

    const { data: rawProducts, error: pErr } = await supabase
      .from("products")
      .select("id, name, price, stock_quantity, unit")
      .eq("company_id", companyId)
      .or(PRODUCTS_ACTIVE_OR_LEGACY_NULL);

    const products = (rawProducts ?? []) as SimulationProduct[];

    if (pErr || products.length === 0) {
      toast.error("Nenhum produto ativo encontrado para simulação");
      setRunning(false);
      return;
    }

    const availableStock = new Map<string, number>(
      products.map((product) => [product.id, Math.max(0, Number(product.stock_quantity ?? 0))])
    );

    let sessionId: string | null = null;
    const terminalId = "SIM-TEST";

    const { data: existingSession } = await supabase
      .from("cash_sessions")
      .select("id")
      .eq("company_id", companyId)
      .eq("terminal_id", terminalId)
      .eq("status", "aberto")
      .maybeSingle();

    if (existingSession) {
      sessionId = existingSession.id;
    } else {
      const { data: newSession, error: sErr } = await supabase
        .from("cash_sessions")
        .insert({
          company_id: companyId,
          terminal_id: terminalId,
          opened_by: user.id,
          opening_balance: 0,
          status: "aberto",
        })
        .select("id")
        .single();

      if (sErr || !newSession) {
        toast.error("Erro ao criar sessão de caixa para simulação");
        setRunning(false);
        return;
      }
      sessionId = newSession.id;
    }

    toast.info(`🚀 Simulação iniciada — ${salesCount} vendas com ${products.length} produtos disponíveis`);

    for (let i = 0; i < salesCount; i++) {
      if (cancelRef.current) break;

      setCurrentSale(i + 1);
      setProgress(((i + 1) / salesCount) * 100);

      const start = performance.now();
      const itemCount = Math.floor(Math.random() * maxItems) + 1;

      const eligibleProducts = products.filter((product) => {
        const stock = availableStock.get(product.id) ?? 0;
        return stock >= 1 && Number(product.price ?? 0) > 0;
      });

      if (eligibleProducts.length === 0) {
        results.push({
          saleIndex: i + 1,
          success: false,
          total: 0,
          itemCount: 0,
          duration: performance.now() - start,
          warning: "Estoque disponível esgotado para continuar a simulação.",
        });
        break;
      }

      const shuffled = [...eligibleProducts].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(itemCount, eligibleProducts.length));

      const saleItems = selected.flatMap((product) => {
        const stock = Math.floor(availableStock.get(product.id) ?? 0);
        if (stock < 1) return [];

        const quantity = Math.min(stock, Math.floor(Math.random() * 3) + 1);
        const unitPrice = Number(product.price ?? 0);

        if (quantity <= 0 || unitPrice <= 0) return [];

        return [{
          product_id: product.id,
          product_name: product.name,
          quantity,
          unit_price: unitPrice,
          discount_percent: 0,
          subtotal: unitPrice * quantity,
        }];
      });

      if (saleItems.length === 0) {
        results.push({
          saleIndex: i + 1,
          success: false,
          total: 0,
          itemCount: 0,
          duration: performance.now() - start,
          warning: "Nenhum item com estoque suficiente foi encontrado para esta venda.",
        });
        continue;
      }

      const subtotal = saleItems.reduce((sum, item) => sum + item.subtotal, 0);
      const total = subtotal;

      if (total <= 0) {
        results.push({
          saleIndex: i + 1,
          success: false,
          total: 0,
          itemCount: saleItems.length,
          duration: performance.now() - start,
          error: "Total calculado <= 0 — ignorada",
        });
        continue;
      }

      const payments = [{ method: "dinheiro", amount: total, approved: true }];

      try {
        const { data: rpcResult, error: rpcError } = await supabase.rpc("finalize_sale_atomic", {
          p_company_id: companyId,
          p_terminal_id: terminalId,
          p_session_id: sessionId,
          p_items: saleItems,
          p_subtotal: subtotal,
          p_discount_pct: 0,
          p_discount_val: 0,
          p_total: total,
          p_payments: payments,
          p_sold_by: user.id,
        });

        const duration = performance.now() - start;

        if (rpcError) {
          results.push({
            saleIndex: i + 1,
            success: false,
            total,
            itemCount: saleItems.length,
            duration,
            error: rpcError.message,
          });
          continue;
        }

        const result = rpcResult as { success?: boolean; sale_id?: string; error?: string } | null;
        if (!result?.success) {
          results.push({
            saleIndex: i + 1,
            success: false,
            total,
            itemCount: saleItems.length,
            duration,
            error: result?.error || "Erro desconhecido",
          });
          continue;
        }

        for (const item of saleItems) {
          const currentStock = availableStock.get(item.product_id) ?? 0;
          availableStock.set(item.product_id, Math.max(0, currentStock - Number(item.quantity)));
        }

        if (result.sale_id) {
          await supabase.from("sales").update({ status: "teste" } as Record<string, unknown>).eq("id", result.sale_id);
        }

        let warning: string | undefined;
        const expectedTotal = saleItems.reduce((sum, item) => sum + item.subtotal, 0);
        if (Math.abs(expectedTotal - total) > 0.01) {
          warning = `Divergência de cálculo: esperado ${expectedTotal.toFixed(2)}, obtido ${total.toFixed(2)}`;
        }

        if (duration > 5000) {
          warning = (warning ? `${warning} | ` : "") + `Lentidão detectada: ${(duration / 1000).toFixed(1)}s`;
        }

        results.push({
          saleIndex: i + 1,
          success: true,
          saleId: result.sale_id,
          total,
          itemCount: saleItems.length,
          duration,
          warning,
        });
      } catch (err: unknown) {
        results.push({
          saleIndex: i + 1,
          success: false,
          total,
          itemCount: saleItems.length,
          duration: performance.now() - start,
          error: err instanceof Error ? err.message : "Erro inesperado",
        });
      }

      if (i % 10 === 9) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // 4) Revert test sales — delete and restore stock (sem N+1)
    const testSaleIds = results.filter((r) => r.success && r.saleId).map((r) => r.saleId!);

    if (testSaleIds.length > 0) {
      // Chunk helper para evitar IN(...) gigantes (Postgres/Supabase costumam aceitar ~1000)
      const chunk = <V,>(arr: V[], size: number): V[][] => {
        const out: V[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      // 4.1) Buscar TODOS os sale_items de uma só vez (em chunks se necessário)
      const allItems: { product_id: string; quantity: number | string }[] = [];
      for (const ids of chunk(testSaleIds, 500)) {
        const { data } = await supabase
          .from("sale_items")
          .select("product_id, quantity")
          .in("sale_id", ids);
        if (data) allItems.push(...(data as typeof allItems));
      }

      // 4.2) Agregar quantidade a restaurar por produto (1 update por produto, não 1 por item)
      const restoreByProduct = new Map<string, number>();
      for (const item of allItems) {
        const prev = restoreByProduct.get(item.product_id) ?? 0;
        restoreByProduct.set(item.product_id, prev + Number(item.quantity || 0));
      }

      // 4.3) Buscar estoque atual dos produtos afetados em 1 select
      const productIds = Array.from(restoreByProduct.keys());
      const productStock = new Map<string, number>();
      for (const ids of chunk(productIds, 500)) {
        const { data } = await supabase
          .from("products")
          .select("id, stock_quantity")
          .in("id", ids);
        if (data) {
          for (const p of data as { id: string; stock_quantity: number | string | null }[]) {
            productStock.set(p.id, Number(p.stock_quantity ?? 0));
          }
        }
      }

      // 4.4) UPDATEs paralelos (um por produto, limitados a 10 em paralelo)
      const updates = productIds.map((pid) => ({
        id: pid,
        newStock: (productStock.get(pid) ?? 0) + (restoreByProduct.get(pid) ?? 0),
      }));
      const CONCURRENCY = 10;
      for (let i = 0; i < updates.length; i += CONCURRENCY) {
        await Promise.all(
          updates.slice(i, i + CONCURRENCY).map((u) =>
            supabase.from("products").update({ stock_quantity: u.newStock }).eq("id", u.id),
          ),
        );
      }

      // 4.5) Deletar em batch (1 query por tabela por chunk de ids)
      for (const ids of chunk(testSaleIds, 500)) {
        await Promise.all([
          supabase.from("sale_items").delete().in("sale_id", ids),
          supabase.from("financial_entries").delete().in("reference", ids),
        ]);
        await supabase.from("sales").delete().in("id", ids);
      }

      // 4.6) Fechar sessão de teste
      await supabase
        .from("cash_sessions")
        .update({ status: "fechado", closed_at: new Date().toISOString() } as any)
        .eq("id", sessionId);
    }

    const finishedAt = new Date().toISOString();
    const successful = results.filter((r) => r.success).length;
    const warnings = results.filter((r) => r.warning).length;
    const errors = results.filter((r) => !r.success && r.error).length;

    const finalReport: SimReport = {
      totalSales: results.length,
      successful,
      warnings,
      errors,
      totalRevenue: results.filter((r) => r.success).reduce((s, r) => s + r.total, 0),
      avgDuration: results.length > 0 ? results.reduce((s, r) => s + r.duration, 0) / results.length : 0,
      results,
      startedAt,
      finishedAt,
    };

    setReport(finalReport);
    setRunning(false);
    setProgress(100);

    if (errors === 0 && warnings === 0) {
      toast.success(`✅ Simulação concluída! ${successful}/${salesCount} vendas sem nenhum erro.`);
    } else if (errors > 0) {
      toast.error(`Simulação concluída com ${errors} erros e ${warnings} avisos.`);
    } else {
      toast.warning(`Simulação concluída com ${warnings} avisos.`);
    }
  }, [companyId, user, salesCount, maxItems]);

  const handleCancel = () => {
    cancelRef.current = true;
    toast.info("Cancelando simulação...");
  };

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <ShoppingCart className="h-4 w-4 text-primary" />
          Simulação de Loja
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-4">
        <p className="text-sm text-muted-foreground">
          Executa vendas automatizadas no PDV para testar a integridade do sistema. 
          Vendas são revertidas ao final — <strong>sem afetar dados reais</strong>.
        </p>

        {/* Config */}
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Qtd. de vendas</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={salesCount}
              onChange={(e) => setSalesCount(Math.min(500, Math.max(1, Number(e.target.value))))}
              className="w-28"
              disabled={running}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Máx. itens/venda</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={maxItems}
              onChange={(e) => setMaxItems(Math.min(20, Math.max(1, Number(e.target.value))))}
              className="w-28"
              disabled={running}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            onClick={runSimulation}
            disabled={running}
            className="gap-2"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {running ? "Simulando..." : "Executar Simulação de Loja"}
          </Button>
          {running && (
            <Button variant="destructive" onClick={handleCancel} className="gap-2">
              <Square className="h-4 w-4" /> Cancelar
            </Button>
          )}
        </div>

        {/* Progress */}
        {running && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Venda {currentSale} de {salesCount}</span>
              <span>{progress.toFixed(0)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Report */}
        {report && (
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Relatório da Simulação</h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono text-foreground">{report.totalSales}</p>
                <p className="text-xs text-muted-foreground">Total executadas</p>
              </div>
              <div className="bg-success/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono text-success">{report.successful}</p>
                <p className="text-xs text-muted-foreground">✔ Sucesso</p>
              </div>
              <div className="bg-warning/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono text-warning">{report.warnings}</p>
                <p className="text-xs text-muted-foreground">⚠ Avisos</p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono text-destructive">{report.errors}</p>
                <p className="text-xs text-muted-foreground">❌ Erros</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant="outline" className="font-mono">
                Receita simulada: R$ {report.totalRevenue.toFixed(2)}
              </Badge>
              <Badge variant="outline" className="font-mono">
                Tempo médio: {report.avgDuration.toFixed(0)}ms
              </Badge>
              <Badge variant="outline" className="font-mono text-xs">
                {new Date(report.startedAt).toLocaleTimeString("pt-BR")} → {new Date(report.finishedAt).toLocaleTimeString("pt-BR")}
              </Badge>
            </div>

            {/* Detailed log */}
            {(report.errors > 0 || report.warnings > 0) && (
              <ScrollArea className="h-64 border rounded-lg p-3">
                <div className="space-y-1.5">
                  {report.results
                    .filter((r) => r.error || r.warning)
                    .map((r) => (
                      <div
                        key={r.saleIndex}
                        className={`flex items-start gap-2 text-xs p-2 rounded ${
                          r.error ? "bg-destructive/5" : "bg-warning/5"
                        }`}
                      >
                        {r.error ? (
                          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                        )}
                        <div>
                          <span className="font-mono font-bold">Venda #{r.saleIndex}</span>
                          <span className="text-muted-foreground ml-1">
                            ({r.itemCount} itens, R$ {r.total.toFixed(2)}, {r.duration.toFixed(0)}ms)
                          </span>
                          <p className="text-foreground mt-0.5">
                            {r.error || r.warning}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            )}

            {report.errors === 0 && report.warnings === 0 && (
              <div className="flex items-center gap-3 p-4 bg-success/10 rounded-xl border border-success/20">
                <CheckCircle className="h-6 w-6 text-success shrink-0" />
                <div>
                  <p className="font-semibold text-success">Sistema aprovado!</p>
                  <p className="text-sm text-muted-foreground">
                    Todas as {report.successful} vendas foram processadas sem erros ou inconsistências.
                    Cálculos, estoque e gravação no banco estão funcionando corretamente.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}