import { useState } from "react";
import { Brain, TrendingUp, Package, AlertTriangle, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const demandData = [
  { month: "Jan", real: 45, previsto: 42 }, { month: "Fev", real: 52, previsto: 50 },
  { month: "Mar", real: 48, previsto: 55 }, { month: "Abr", real: null, previsto: 58 },
  { month: "Mai", real: null, previsto: 62 }, { month: "Jun", real: null, previsto: 55 },
];

const productForecasts = [
  { name: "Sofá Retrátil 3L", current: 8, predicted: 15, trend: "up" as const, confidence: 87, action: "Reabastecer" },
  { name: "Guarda-Roupa 6P", current: 3, predicted: 9, trend: "up" as const, confidence: 92, action: "Pedir urgente" },
  { name: "Mesa Jantar 6L", current: 12, predicted: 7, trend: "down" as const, confidence: 78, action: "Estoque OK" },
  { name: "Rack TV 180cm", current: 5, predicted: 11, trend: "up" as const, confidence: 85, action: "Reabastecer" },
  { name: "Cama Box King", current: 2, predicted: 8, trend: "up" as const, confidence: 91, action: "Pedir urgente" },
  { name: "Escrivaninha", current: 15, predicted: 6, trend: "down" as const, confidence: 73, action: "Estoque OK" },
];

const seasonalInsights = [
  { event: "Dia das Mães", date: "Mai/2026", impact: "+35% Sofás e Poltronas", severity: "alta" },
  { event: "Dia dos Namorados", date: "Jun/2026", impact: "+25% Camas e Colchões", severity: "media" },
  { event: "Black Friday", date: "Nov/2026", impact: "+60% Todas categorias", severity: "alta" },
  { event: "Volta às Aulas", date: "Jan/2027", impact: "+40% Escrivaninhas", severity: "media" },
];

export default function PrevisaoDemanda() {
  const [period, setPeriod] = useState("3m");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" /> Previsão de Demanda (IA)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Previsões inteligentes baseadas em histórico de vendas e sazonalidade</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1m">1 mês</SelectItem>
            <SelectItem value="3m">3 meses</SelectItem>
            <SelectItem value="6m">6 meses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Demand Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Tendência de Vendas (Real vs Previsto)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={demandData}>
                <defs>
                  <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPrev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Area type="monotone" dataKey="real" stroke="hsl(var(--primary))" fill="url(#colorReal)" strokeWidth={2} name="Real" />
                <Area type="monotone" dataKey="previsto" stroke="hsl(var(--chart-2))" fill="url(#colorPrev)" strokeWidth={2} strokeDasharray="5 5" name="Previsto" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product forecasts */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="font-semibold text-lg flex items-center gap-2"><Package className="w-5 h-5" /> Previsão por Produto</h2>
          {productForecasts.map((p, i) => (
            <Card key={i}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`p-1.5 rounded-lg ${p.trend === "up" ? "bg-success/10" : "bg-info/10"}`}>
                    {p.trend === "up" ? <ArrowUpRight className="w-4 h-4 text-success" /> : <ArrowDownRight className="w-4 h-4 text-info" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{p.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>Estoque: <strong>{p.current}</strong></span>
                      <span>Previsão demanda: <strong className="text-primary">{p.predicted}</strong></span>
                      <span>Confiança: {p.confidence}%</span>
                    </div>
                  </div>
                </div>
                <Badge variant={p.action.includes("urgente") ? "destructive" : p.action === "Estoque OK" ? "default" : "outline"}
                  className={p.action === "Estoque OK" ? "bg-success" : ""}>
                  {p.action}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Seasonal insights */}
        <div className="space-y-3">
          <h2 className="font-semibold text-lg flex items-center gap-2"><Calendar className="w-5 h-5" /> Alertas Sazonais</h2>
          {seasonalInsights.map((s, i) => (
            <Card key={i} className="border-l-4 border-l-primary">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-sm">{s.event}</h3>
                  <Badge variant="outline" className="text-[10px]">{s.date}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{s.impact}</p>
                <Badge variant="outline" className={`text-[10px] mt-1 ${s.severity === "alta" ? "border-destructive/30 text-destructive" : "border-warning/30 text-warning"}`}>
                  Impacto {s.severity}
                </Badge>
              </CardContent>
            </Card>
          ))}

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 text-center">
              <Brain className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium">IA analisa seu histórico de vendas para gerar previsões automáticas</p>
              <p className="text-xs text-muted-foreground mt-1">Quanto mais dados, maior a precisão</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
