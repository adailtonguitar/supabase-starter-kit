import { useState } from "react";
import { Percent, Users, DollarSign, TrendingUp, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const commissionData = [
  {
    name: "Ana Vendedora", role: "Vendedora", salesCount: 28, totalSold: 89500,
    commissionRate: 5, commissionEarned: 4475, target: 100000, paid: 3200,
  },
  {
    name: "Carlos Montador", role: "Montador", salesCount: 42, totalSold: 0,
    commissionRate: 0, commissionEarned: 2520, target: 0, paid: 2100,
    assemblyCount: 42, perAssembly: 60,
  },
  {
    name: "Marcos Vendedor", role: "Vendedor", salesCount: 22, totalSold: 67200,
    commissionRate: 5, commissionEarned: 3360, target: 80000, paid: 2800,
  },
  {
    name: "Roberto Montador", role: "Montador", salesCount: 0, totalSold: 0,
    commissionRate: 0, commissionEarned: 2280, target: 0, paid: 1900,
    assemblyCount: 38, perAssembly: 60,
  },
];

const monthlyChart = [
  { month: "Out", vendedores: 6200, montadores: 3800 },
  { month: "Nov", vendedores: 7100, montadores: 4200 },
  { month: "Dez", vendedores: 9800, montadores: 5600 },
  { month: "Jan", vendedores: 5900, montadores: 3400 },
  { month: "Fev", vendedores: 7835, montadores: 4800 },
  { month: "Mar", vendedores: 4475, montadores: 2520 },
];

export default function ComissoesMoveis() {
  const [period, setPeriod] = useState("mes");

  const totalComm = commissionData.reduce((a, c) => a + c.commissionEarned, 0);
  const totalPaid = commissionData.reduce((a, c) => a + c.paid, 0);
  const pending = totalComm - totalPaid;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Percent className="w-6 h-6 text-primary" /> Comissões Móveis
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Comissões de vendedores (% sobre vendas) e montadores (por serviço)</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mes">Este Mês</SelectItem>
            <SelectItem value="trimestre">Trimestre</SelectItem>
            <SelectItem value="ano">Ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center"><DollarSign className="w-5 h-5 text-primary mx-auto mb-1" /><p className="text-2xl font-bold">R$ {(totalComm / 1000).toFixed(1)}k</p><p className="text-xs text-muted-foreground">Total Comissões</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" /><p className="text-2xl font-bold">R$ {(totalPaid / 1000).toFixed(1)}k</p><p className="text-xs text-muted-foreground">Pago</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><Calendar className="w-5 h-5 text-amber-500 mx-auto mb-1" /><p className="text-2xl font-bold">R$ {(pending / 1000).toFixed(1)}k</p><p className="text-xs text-muted-foreground">Pendente</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><Users className="w-5 h-5 text-blue-500 mx-auto mb-1" /><p className="text-2xl font-bold">{commissionData.length}</p><p className="text-xs text-muted-foreground">Comissionados</p></CardContent></Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Evolução de Comissões</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} />
                <Bar dataKey="vendedores" name="Vendedores" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="montadores" name="Montadores" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Individual cards */}
      <div className="space-y-3">
        {commissionData.map((c, i) => {
          const isVendedor = c.role === "Vendedor" || c.role === "Vendedora";
          const pendingAmount = c.commissionEarned - c.paid;
          return (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm">
                      {c.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{c.name}</h3>
                        <Badge variant="outline" className={isVendedor ? "bg-primary/10 text-primary" : "bg-blue-500/10 text-blue-600"}>{c.role}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {isVendedor ? (
                          <>
                            <span>{c.salesCount} vendas</span>
                            <span>R$ {(c.totalSold / 1000).toFixed(1)}k vendido</span>
                            <span>{c.commissionRate}% comissão</span>
                          </>
                        ) : (
                          <>
                            <span>{(c as any).assemblyCount || 0} montagens</span>
                            <span>R$ {(c as any).perAssembly || 0}/montagem</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">R$ {c.commissionEarned.toLocaleString("pt-BR")}</p>
                    <div className="flex items-center gap-2 justify-end text-xs">
                      <span className="text-emerald-500">Pago: R$ {c.paid}</span>
                      {pendingAmount > 0 && <Badge variant="outline" className="text-amber-600 border-amber-500/30">Pendente: R$ {pendingAmount}</Badge>}
                    </div>
                  </div>
                </div>
                {isVendedor && c.target > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Meta de vendas</span>
                      <span>{Math.round((c.totalSold / c.target) * 100)}%</span>
                    </div>
                    <Progress value={(c.totalSold / c.target) * 100} className="h-2" />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
