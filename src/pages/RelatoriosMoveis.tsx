import { useState, useMemo } from "react";
import { BarChart3, TrendingUp, Wrench, RotateCcw, DollarSign, Users, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useSales } from "@/hooks/useSales";
import { useProducts } from "@/hooks/useProducts";
import { useAssemblies } from "@/hooks/useAssemblies";
import { useTechnicalTickets } from "@/hooks/useTechnicalTickets";
import { subDays, isAfter } from "date-fns";

const CHART_COLORS = [
  "hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))",
];

export default function RelatoriosMoveis() {
  const [period, setPeriod] = useState("30d");
  const { data: sales = [], isLoading: l1 } = useSales(500);
  const { data: products = [], isLoading: l2 } = useProducts();
  const { assemblies, loading: l3 } = useAssemblies();
  const { tickets, loading: l4 } = useTechnicalTickets();

  const loading = l1 || l2 || l3 || l4;

  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const cutoff = subDays(new Date(), days);

  const filteredSales = useMemo(() =>
    sales.filter(s => s.status !== "cancelled" && isAfter(new Date(s.created_at), cutoff)),
    [sales, cutoff]
  );

  // Margin by category (room type)
  const marginByRoom = useMemo(() => {
    const catMap: Record<string, { revenue: number; cost: number }> = {};
    // Group products by category for cost reference
    const productMap = new Map(products.map(p => [p.id, p]));

    // Parse sale items from items_json to get category-level data
    filteredSales.forEach(s => {
      try {
        const items = Array.isArray(s.items_json) ? s.items_json : typeof s.items_json === "string" ? JSON.parse(s.items_json) : [];
        items.forEach((item: any) => {
          const prod = productMap.get(item.product_id || item.id);
          const cat = prod?.category || item.category || "Outros";
          if (!catMap[cat]) catMap[cat] = { revenue: 0, cost: 0 };
          const qty = item.quantity || 1;
          const price = item.unit_price || item.price || 0;
          const cost = prod?.cost_price || item.cost_price || price * 0.6;
          catMap[cat].revenue += price * qty;
          catMap[cat].cost += cost * qty;
        });
      } catch {}
    });

    // If no item-level data, use total sales as "Geral"
    if (Object.keys(catMap).length === 0 && filteredSales.length > 0) {
      const total = filteredSales.reduce((a, s) => a + (s.total_value || 0), 0);
      catMap["Geral"] = { revenue: total, cost: total * 0.6 };
    }

    return Object.entries(catMap).map(([room, { revenue, cost }]) => ({
      room,
      revenue: Math.round(revenue),
      cost: Math.round(cost),
      margin: revenue > 0 ? Math.round((1 - cost / revenue) * 100) : 0,
    })).sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales, products]);

  // Assembler ranking from assemblies
  const assemblerRanking = useMemo(() => {
    const map: Record<string, { jobs: number }> = {};
    const filtered = assemblies.filter(a => isAfter(new Date(a.created_at), cutoff));
    filtered.forEach(a => {
      if (a.assembler) {
        if (!map[a.assembler]) map[a.assembler] = { jobs: 0 };
        map[a.assembler].jobs++;
      }
    });
    return Object.entries(map)
      .map(([name, { jobs }]) => ({ name, jobs, avgRating: 0, avgTime: "—", complaints: 0 }))
      .sort((a, b) => b.jobs - a.jobs);
  }, [assemblies, cutoff]);

  // Return/issue data from technical tickets
  const returnData = useMemo(() => {
    const filtered = tickets.filter(t => isAfter(new Date(t.created_at), cutoff));
    const reasons: Record<string, number> = {};
    filtered.forEach(t => {
      const reason = t.issue || "Outros";
      reasons[reason] = (reasons[reason] || 0) + 1;
    });
    const total = Object.values(reasons).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(reasons)
      .map(([reason, count]) => ({ reason, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [tickets, cutoff]);

  const totalRevenue = marginByRoom.reduce((a, r) => a + r.revenue, 0);
  const totalCost = marginByRoom.reduce((a, r) => a + r.cost, 0);
  const avgMargin = totalRevenue > 0 ? ((1 - totalCost / totalRevenue) * 100).toFixed(1) : "0";
  const totalJobs = assemblerRanking.reduce((a, r) => a + r.jobs, 0);
  const totalReturns = returnData.reduce((a, r) => a + r.count, 0);
  const returnRate = totalJobs + totalReturns > 0 ? ((totalReturns / (totalJobs + totalReturns)) * 100).toFixed(1) : "0";

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Relatórios Móveis
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Margem por ambiente, ranking de montadores e ocorrências técnicas</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
            <SelectItem value="90d">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center"><DollarSign className="w-5 h-5 text-primary mx-auto mb-1" /><p className="text-2xl font-bold">R$ {totalRevenue > 1000 ? `${(totalRevenue / 1000).toFixed(0)}k` : totalRevenue}</p><p className="text-xs text-muted-foreground">Faturamento</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" /><p className="text-2xl font-bold">{avgMargin}%</p><p className="text-xs text-muted-foreground">Margem Média</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><Wrench className="w-5 h-5 text-blue-500 mx-auto mb-1" /><p className="text-2xl font-bold">{totalJobs}</p><p className="text-xs text-muted-foreground">Montagens</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><RotateCcw className="w-5 h-5 text-amber-500 mx-auto mb-1" /><p className="text-2xl font-bold">{returnRate}%</p><p className="text-xs text-muted-foreground">Taxa Ocorrências</p></CardContent></Card>
      </div>

      <Tabs defaultValue="margem">
        <TabsList>
          <TabsTrigger value="margem">Margem por Ambiente</TabsTrigger>
          <TabsTrigger value="montadores">Ranking Montadores</TabsTrigger>
          <TabsTrigger value="devolucoes">Ocorrências</TabsTrigger>
        </TabsList>

        <TabsContent value="margem" className="mt-4 space-y-4">
          {marginByRoom.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground"><p>Nenhuma venda no período selecionado</p></div>
          ) : (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">Margem de Lucro por Categoria</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={marginByRoom}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="room" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} />
                        <Bar dataKey="revenue" name="Faturamento" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="cost" name="Custo" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {marginByRoom.map((r, i) => (
                  <Card key={i}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-sm">{r.room}</h3>
                        <Badge variant={r.margin >= 35 ? "default" : "outline"} className={r.margin >= 35 ? "bg-emerald-500" : ""}>{r.margin}%</Badge>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>Fat: R$ {(r.revenue / 1000).toFixed(1)}k</span>
                        <span>Custo: R$ {(r.cost / 1000).toFixed(1)}k</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="montadores" className="mt-4 space-y-3">
          {assemblerRanking.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground"><p>Nenhuma montagem registrada no período</p></div>
          ) : (
            <div className="space-y-3">
              {assemblerRanking.map((m, i) => (
                <Card key={i}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${i === 0 ? "bg-amber-500/15 text-amber-600" : i === 1 ? "bg-slate-400/15 text-slate-500" : i === 2 ? "bg-orange-400/15 text-orange-500" : "bg-muted text-muted-foreground"}`}>
                        {i + 1}º
                      </div>
                      <div>
                        <h3 className="font-semibold">{m.name}</h3>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{m.jobs} montagens</span>
                        </div>
                      </div>
                    </div>
                    <Badge variant={i === 0 ? "default" : "outline"} className={i === 0 ? "bg-emerald-500" : ""}>{i === 0 ? "Top" : `${m.jobs} jobs`}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="devolucoes" className="mt-4">
          {returnData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground"><p>Nenhuma ocorrência técnica no período</p></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Motivos de Ocorrência</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={returnData} dataKey="count" nameKey="reason" cx="50%" cy="50%" outerRadius={100} label={({ reason, pct }: any) => `${reason.substring(0, 20)} (${pct}%)`}>
                          {returnData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Detalhamento</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {returnData.map((r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-sm">{r.reason}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{r.count}</span>
                        <Badge variant="outline" className="text-[10px]">{r.pct}%</Badge>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 border-t mt-3">
                    <p className="text-sm font-semibold">Total: {totalReturns} ocorrências</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
