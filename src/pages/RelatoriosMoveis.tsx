import { useState } from "react";
import { BarChart3, TrendingUp, Wrench, RotateCcw, DollarSign, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// Mock data — will connect to real DB aggregations
const marginByRoom = [
  { room: "Sala Estar", revenue: 45200, cost: 28900, margin: 36 },
  { room: "Quarto Casal", revenue: 38500, cost: 23100, margin: 40 },
  { room: "Cozinha", revenue: 32000, cost: 22400, margin: 30 },
  { room: "Escritório", revenue: 18900, cost: 11340, margin: 40 },
  { room: "Quarto Infantil", revenue: 15200, cost: 10640, margin: 30 },
  { room: "Sala Jantar", revenue: 22800, cost: 13680, margin: 40 },
];

const assemblerRanking = [
  { name: "Carlos Silva", jobs: 42, avgRating: 4.8, avgTime: "3h20", complaints: 1 },
  { name: "Roberto Santos", jobs: 38, avgRating: 4.6, avgTime: "3h45", complaints: 2 },
  { name: "Pedro Oliveira", jobs: 35, avgRating: 4.5, avgTime: "4h10", complaints: 0 },
  { name: "André Costa", jobs: 28, avgRating: 4.2, avgTime: "4h30", complaints: 3 },
];

const returnData = [
  { reason: "Defeito de fábrica", count: 8, pct: 38 },
  { reason: "Dano no transporte", count: 5, pct: 24 },
  { reason: "Cor diferente", count: 4, pct: 19 },
  { reason: "Medida errada", count: 3, pct: 14 },
  { reason: "Desistência", count: 1, pct: 5 },
];

const CHART_COLORS = [
  "hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))",
];

export default function RelatoriosMoveis() {
  const [period, setPeriod] = useState("30d");

  const totalRevenue = marginByRoom.reduce((a, r) => a + r.revenue, 0);
  const totalCost = marginByRoom.reduce((a, r) => a + r.cost, 0);
  const avgMargin = ((1 - totalCost / totalRevenue) * 100).toFixed(1);
  const totalJobs = assemblerRanking.reduce((a, r) => a + r.jobs, 0);
  const totalReturns = returnData.reduce((a, r) => a + r.count, 0);
  const returnRate = ((totalReturns / (totalJobs + totalReturns)) * 100).toFixed(1);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Relatórios Móveis
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Margem por ambiente, ranking de montadores e taxa de devolução</p>
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

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center"><DollarSign className="w-5 h-5 text-primary mx-auto mb-1" /><p className="text-2xl font-bold">R$ {(totalRevenue / 1000).toFixed(0)}k</p><p className="text-xs text-muted-foreground">Faturamento</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" /><p className="text-2xl font-bold">{avgMargin}%</p><p className="text-xs text-muted-foreground">Margem Média</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><Wrench className="w-5 h-5 text-blue-500 mx-auto mb-1" /><p className="text-2xl font-bold">{totalJobs}</p><p className="text-xs text-muted-foreground">Montagens</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><RotateCcw className="w-5 h-5 text-amber-500 mx-auto mb-1" /><p className="text-2xl font-bold">{returnRate}%</p><p className="text-xs text-muted-foreground">Taxa Devolução</p></CardContent></Card>
      </div>

      <Tabs defaultValue="margem">
        <TabsList>
          <TabsTrigger value="margem">Margem por Ambiente</TabsTrigger>
          <TabsTrigger value="montadores">Ranking Montadores</TabsTrigger>
          <TabsTrigger value="devolucoes">Devoluções</TabsTrigger>
        </TabsList>

        <TabsContent value="margem" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Margem de Lucro por Tipo de Ambiente</CardTitle></CardHeader>
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
        </TabsContent>

        <TabsContent value="montadores" className="mt-4 space-y-3">
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
                        <span>⭐ {m.avgRating}</span>
                        <span>⏱ {m.avgTime}</span>
                        <span>{m.complaints} reclamações</span>
                      </div>
                    </div>
                  </div>
                  <Badge variant={m.avgRating >= 4.5 ? "default" : "outline"} className={m.avgRating >= 4.5 ? "bg-emerald-500" : ""}>{m.avgRating >= 4.5 ? "Top" : "Regular"}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="devolucoes" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Motivos de Devolução</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={returnData} dataKey="count" nameKey="reason" cx="50%" cy="50%" outerRadius={100} label={({ reason, pct }) => `${reason} (${pct}%)`}>
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
                      <div className="w-3 h-3 rounded-full" style={{ background: CHART_COLORS[i] }} />
                      <span className="text-sm">{r.reason}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{r.count}</span>
                      <Badge variant="outline" className="text-[10px]">{r.pct}%</Badge>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t mt-3">
                  <p className="text-sm font-semibold">Total: {totalReturns} devoluções • Taxa: {returnRate}%</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
