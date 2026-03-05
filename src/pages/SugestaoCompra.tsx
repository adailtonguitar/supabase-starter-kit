import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Sparkles, Loader2, RefreshCw, AlertCircle, Package } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

const COOLDOWN_MS = 60_000;

export default function SugestaoCompra() {
  const { companyId } = useCompany();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const lastCallRef = useRef(0);

  const fetchSuggestion = useCallback(async () => {
    if (!companyId) return;

    const now = Date.now();
    if (now - lastCallRef.current < COOLDOWN_MS) {
      setCooldown(true);
      setTimeout(() => setCooldown(false), COOLDOWN_MS - (now - lastCallRef.current));
      toast.info("Aguarde 1 minuto entre as análises.");
      return;
    }
    lastCallRef.current = now;

    setLoading(true);
    setErrorMsg(null);

    try {
      // Fetch products with low stock and their sales
      const { data: products } = await supabase
        .from("products")
        .select("id, name, barcode, stock_quantity, min_stock, category, cost_price, price")
        .eq("company_id", companyId)
        .or("is_active.is.null,is_active.eq.true")
        .order("stock_quantity", { ascending: true })
        .limit(100);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const productIds = (products || []).map((p) => p.id);
      const BATCH = 15;
      let saleItems: any[] = [];
      for (let i = 0; i < productIds.length; i += BATCH) {
        const batch = productIds.slice(i, i + BATCH);
        const { data } = await supabase
          .from("sale_items")
          .select("product_id, quantity, sale_id, sales!inner(created_at, company_id)")
          .in("product_id", batch)
          .eq("sales.company_id", companyId)
          .gte("sales.created_at", thirtyDaysAgo.toISOString());
        if (data) saleItems.push(...data);
      }

      // Aggregate
      const salesMap: Record<string, number> = {};
      saleItems.forEach((si: any) => {
        salesMap[si.product_id] = (salesMap[si.product_id] || 0) + (si.quantity || 0);
      });

      const productSummary = (products || []).map((p) => ({
        nome: p.name,
        estoque: p.stock_quantity || 0,
        min: p.min_stock || 0,
        vendas_30d: salesMap[p.id] || 0,
        custo: p.cost_price || 0,
        preco: p.price || 0,
        categoria: p.category || "Sem categoria",
      }));

      // Call AI via ai-report edge function with purchase type
      const { data, error } = await supabase.functions.invoke("ai-report", {
        body: {
          company_id: companyId,
          report_type: "purchase",
        },
      });

      if (error) throw error;
      setSuggestion(data?.report || data?.insight || "Sem sugestões no momento.");
    } catch (err: any) {
      console.error("[SugestaoCompra] Error:", err);
      setErrorMsg(err.message || "Erro ao gerar sugestão.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-primary" />
            Sugestão de Compra por IA
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            A IA analisa seu estoque e vendas recentes para sugerir o pedido ideal
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Análise Inteligente de Reposição
            </CardTitle>
            <Button
              onClick={fetchSuggestion}
              disabled={loading || cooldown}
              size="sm"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analisando...</>
              ) : cooldown ? (
                <><RefreshCw className="w-4 h-4 mr-2" />Aguarde...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" />Gerar Sugestão</>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {errorMsg && (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 text-destructive mb-4">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{errorMsg}</p>
            </div>
          )}

          {!suggestion && !loading && !errorMsg && (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="font-semibold text-lg text-muted-foreground">Nenhuma sugestão gerada</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Clique em "Gerar Sugestão" para a IA analisar seu estoque e vendas
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Analisando 100 produtos e vendas dos últimos 30 dias...</p>
            </div>
          )}

          {suggestion && !loading && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{suggestion}</ReactMarkdown>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
