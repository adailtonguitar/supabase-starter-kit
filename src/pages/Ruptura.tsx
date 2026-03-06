import { motion } from "framer-motion";
import { AlertTriangle, Package, TrendingDown, DollarSign, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRupturaReport } from "@/hooks/useRupturaReport";
import { useState } from "react";

export default function Ruptura() {
  const { data: items, isLoading, refetch } = useRupturaReport();
  const [search, setSearch] = useState("");

  const filtered = (items || []).filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.barcode && i.barcode.includes(search))
  );

  const totalLost = filtered.reduce((s, i) => s + i.revenue_lost_estimate, 0);
  const criticalCount = filtered.filter((i) => i.stock_quantity <= 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-destructive" />
            Relatório de Ruptura
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Produtos que vendem mas estão com estoque zero ou crítico
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-destructive" />
              <div>
                <p className="text-xs text-muted-foreground">Produtos em Ruptura</p>
                <p className="text-2xl font-black">{criticalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <TrendingDown className="w-8 h-8 text-warning" />
              <div>
                <p className="text-xs text-muted-foreground">Total de Itens Críticos</p>
                <p className="text-2xl font-black">{filtered.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-destructive" />
              <div>
                <p className="text-xs text-muted-foreground">Receita Perdida (est.)</p>
                <p className="text-2xl font-black text-destructive">
                  {totalLost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou código..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-12 h-12 text-success mx-auto mb-3" />
            <h3 className="font-semibold text-lg">Nenhuma ruptura detectada!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Todos os produtos com vendas recentes estão com estoque adequado.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 font-semibold">Produto</th>
                    <th className="text-center py-3 px-3 font-semibold">Estoque</th>
                    <th className="text-center py-3 px-3 font-semibold">Mín.</th>
                    <th className="text-center py-3 px-3 font-semibold">Vendas 30d</th>
                    <th className="text-center py-3 px-3 font-semibold">Média/dia</th>
                    <th className="text-right py-3 px-4 font-semibold">Receita Perdida</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, i) => (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className={`border-b border-border/50 ${item.stock_quantity <= 0 ? "bg-destructive/5" : ""}`}
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.barcode && (
                            <p className="text-xs text-muted-foreground">{item.barcode}</p>
                          )}
                          {item.category && (
                            <span className="inline-flex px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium mt-1">
                              {item.category}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`font-bold ${
                            item.stock_quantity <= 0
                              ? "text-destructive"
                              : "text-warning"
                          }`}
                        >
                          {item.stock_quantity}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center text-muted-foreground">{item.min_stock}</td>
                      <td className="py-3 px-3 text-center font-semibold">{item.total_sold_30d}</td>
                      <td className="py-3 px-3 text-center">{item.avg_daily_sales}</td>
                      <td className="py-3 px-4 text-right font-semibold text-destructive">
                        {item.revenue_lost_estimate > 0
                          ? item.revenue_lost_estimate.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })
                          : "—"}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
