import { useState, useMemo } from "react";
import { Percent, Users, DollarSign, TrendingUp, Calendar, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useSales } from "@/hooks/useSales";
import { useEmployees } from "@/hooks/useEmployees";
import { useAssemblies } from "@/hooks/useAssemblies";
import { startOfMonth, subMonths, isAfter, format } from "date-fns";

export default function ComissoesMoveis() {
  const [period, setPeriod] = useState("mes");
  const { data: sales = [], isLoading: loadingSales } = useSales(500);
  const { data: employees = [], isLoading: loadingEmployees } = useEmployees();
  const { assemblies, loading: loadingAssemblies } = useAssemblies();

  const loading = loadingSales || loadingEmployees || loadingAssemblies;

  const periodStart = useMemo(() => {
    const now = new Date();
    if (period === "mes") return startOfMonth(now);
    if (period === "trimestre") return subMonths(startOfMonth(now), 2);
    return subMonths(startOfMonth(now), 11);
  }, [period]);

  const filteredSales = useMemo(() => {
    return sales.filter(s => s.status !== "cancelled" && isAfter(new Date(s.created_at), periodStart));
  }, [sales, periodStart]);

  const filteredAssemblies = useMemo(() => {
    return assemblies.filter(a => isAfter(new Date(a.created_at), periodStart));
  }, [assemblies, periodStart]);

  // Build commission data from employees + sales
  const commissionData = useMemo(() => {
    const result: {
      name: string; role: string; salesCount: number; totalSold: number;
      commissionRate: number; commissionEarned: number; target: number; paid: number;
      assemblyCount?: number; perAssembly?: number;
    }[] = [];

    // Sellers: employees with role vendedor/vendedora or all employees as sellers
    const sellers = employees.filter((e: any) =>
      (e.role || e.position || "").toLowerCase().includes("vend")
    );
    const assemblers = employees.filter((e: any) =>
      (e.role || e.position || "").toLowerCase().includes("montad")
    );

    // For sellers, compute commission from sales (using customer_name matching or total sales / seller count)
    if (sellers.length > 0) {
      sellers.forEach((emp: any) => {
        const empName = emp.name || "";
        // Simple heuristic: divide total sales equally if no seller tracking
        const empSalesCount = Math.round(filteredSales.length / sellers.length);
        const empTotalSold = Math.round(filteredSales.reduce((a, s) => a + (s.total_value || 0), 0) / sellers.length);
        const rate = emp.commission_rate || emp.commission || 5;
        const earned = Math.round(empTotalSold * rate / 100);
        result.push({
          name: empName, role: emp.role || emp.position || "Vendedor",
          salesCount: empSalesCount, totalSold: empTotalSold,
          commissionRate: rate, commissionEarned: earned,
          target: emp.sales_target || 0, paid: 0,
        });
      });
    } else {
      // No sellers in employees: show aggregate
      const totalSold = filteredSales.reduce((a, s) => a + (s.total_value || 0), 0);
      if (totalSold > 0) {
        result.push({
          name: "Vendas Geral", role: "Vendedor",
          salesCount: filteredSales.length, totalSold,
          commissionRate: 5, commissionEarned: Math.round(totalSold * 0.05),
          target: 0, paid: 0,
        });
      }
    }

    // Assemblers from assemblies data
    const assemblerNames = new Set<string>();
    filteredAssemblies.forEach(a => {
      if (a.assembler) assemblerNames.add(a.assembler);
    });

    if (assemblers.length > 0) {
      assemblers.forEach((emp: any) => {
        const count = filteredAssemblies.filter(a => a.assembler === emp.name).length || Math.round(filteredAssemblies.length / assemblers.length);
        const perAssembly = emp.per_assembly || 60;
        result.push({
          name: emp.name, role: emp.role || emp.position || "Montador",
          salesCount: 0, totalSold: 0, commissionRate: 0,
          commissionEarned: count * perAssembly,
          target: 0, paid: 0,
          assemblyCount: count, perAssembly,
        });
      });
    } else {
      assemblerNames.forEach(name => {
        const count = filteredAssemblies.filter(a => a.assembler === name).length;
        result.push({
          name, role: "Montador",
          salesCount: 0, totalSold: 0, commissionRate: 0,
          commissionEarned: count * 60,
          target: 0, paid: 0,
          assemblyCount: count, perAssembly: 60,
        });
      });
    }

    return result;
  }, [employees, filteredSales, filteredAssemblies]);

  // Monthly chart from actual sales
  const monthlyChart = useMemo(() => {
    const months: { month: string; vendedores: number; montadores: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = subMonths(startOfMonth(new Date()), i);
      const end = i > 0 ? subMonths(startOfMonth(new Date()), i - 1) : new Date();
      const monthSales = sales.filter(s => {
        const d = new Date(s.created_at);
        return d >= start && d < end && s.status !== "cancelled";
      });
      const monthAssemblies = assemblies.filter(a => {
        const d = new Date(a.created_at);
        return d >= start && d < end;
      });
      const vendedoresComm = Math.round(monthSales.reduce((a, s) => a + (s.total_value || 0), 0) * 0.05);
      const montadoresComm = monthAssemblies.length * 60;
      months.push({ month: format(start, "MMM").slice(0, 3), vendedores: vendedoresComm, montadores: montadoresComm });
    }
    return months;
  }, [sales, assemblies]);

  const totalComm = commissionData.reduce((a, c) => a + c.commissionEarned, 0);
  const totalPaid = commissionData.reduce((a, c) => a + c.paid, 0);
  const pending = totalComm - totalPaid;

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

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
        <Card><CardContent className="p-3 text-center"><DollarSign className="w-5 h-5 text-primary mx-auto mb-1" /><p className="text-2xl font-bold">R$ {totalComm > 1000 ? `${(totalComm / 1000).toFixed(1)}k` : totalComm.toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground">Total Comissões</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" /><p className="text-2xl font-bold">R$ {totalPaid > 1000 ? `${(totalPaid / 1000).toFixed(1)}k` : totalPaid.toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground">Pago</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><Calendar className="w-5 h-5 text-amber-500 mx-auto mb-1" /><p className="text-2xl font-bold">R$ {pending > 1000 ? `${(pending / 1000).toFixed(1)}k` : pending.toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground">Pendente</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><Users className="w-5 h-5 text-blue-500 mx-auto mb-1" /><p className="text-2xl font-bold">{commissionData.length}</p><p className="text-xs text-muted-foreground">Comissionados</p></CardContent></Card>
      </div>

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

      {commissionData.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Nenhum dado de comissão encontrado</p>
          <p className="text-xs mt-1">Cadastre funcionários e registre vendas para ver comissões</p>
        </div>
      ) : (
        <div className="space-y-3">
          {commissionData.map((c, i) => {
            const isVendedor = c.role.toLowerCase().includes("vend");
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
                              <span>{c.assemblyCount || 0} montagens</span>
                              <span>R$ {c.perAssembly || 0}/montagem</span>
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
      )}
    </div>
  );
}
