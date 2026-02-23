import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useEmployees } from "@/hooks/useEmployees";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, DollarSign, Users, Download, Percent } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function Comissoes() {
  const { companyId } = useCompany();
  const { data: employees = [] } = useEmployees();
  const [currentDate, setCurrentDate] = useState(new Date());

  const start = format(startOfMonth(currentDate), "yyyy-MM-dd");
  const end = format(endOfMonth(currentDate), "yyyy-MM-dd");

  const { data: sales = [] } = useQuery({
    queryKey: ["commission_sales", companyId, start, end],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("fiscal_documents")
        .select("id, total_value, issued_by, created_at, customer_name, status")
        .eq("company_id", companyId)
        .gte("created_at", `${start}T00:00:00`)
        .lte("created_at", `${end}T23:59:59`)
        .in("status", ["autorizada", "pendente"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const employeeByUserId = useMemo(() => {
    const map: Record<string, any> = {};
    employees.forEach((e: any) => { if (e.user_id) map[e.user_id] = e; });
    return map;
  }, [employees]);

  const commissionData = useMemo(() => {
    const grouped: Record<string, { employee: any; totalSales: number; salesCount: number; commission: number }> = {};
    sales.forEach((sale: any) => {
      const emp = sale.issued_by ? employeeByUserId[sale.issued_by] : null;
      if (!emp) return;
      const rate = Number(emp.commission_rate || 0);
      if (!grouped[emp.id]) grouped[emp.id] = { employee: emp, totalSales: 0, salesCount: 0, commission: 0 };
      grouped[emp.id].totalSales += Number(sale.total_value);
      grouped[emp.id].salesCount += 1;
      grouped[emp.id].commission += Number(sale.total_value) * (rate / 100);
    });
    return Object.values(grouped).sort((a, b) => b.commission - a.commission);
  }, [sales, employeeByUserId]);

  const totalSales = commissionData.reduce((s, c) => s + c.totalSales, 0);
  const totalCommission = commissionData.reduce((s, c) => s + c.commission, 0);
  const sellersCount = commissionData.length;
  const chartData = commissionData.map((c) => ({ name: c.employee.name.split(" ")[0], vendas: Number(c.totalSales.toFixed(2)), comissao: Number(c.commission.toFixed(2)) }));

  const exportCSV = () => {
    const header = "Vendedor;Cargo;Taxa %;Vendas;Qtd Vendas;Comissão\n";
    const rows = commissionData.map((c) => `${c.employee.name};${c.employee.role || ""};${c.employee.commission_rate || 0}%;${c.totalSales.toFixed(2)};${c.salesCount};${c.commission.toFixed(2)}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `comissoes_${start}_${end}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Comissão de Vendedores</h1>
          <p className="text-muted-foreground text-sm">Cálculo automático baseado nas vendas do período</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium min-w-[120px] text-center capitalize">{format(currentDate, "MMMM yyyy", { locale: ptBR })}</span>
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" /> CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-primary/10"><DollarSign className="w-5 h-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">Total Vendas</p><p className="text-lg font-bold">{fmt(totalSales)}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-chart-2/20"><Percent className="w-5 h-5 text-chart-2" /></div><div><p className="text-xs text-muted-foreground">Total Comissões</p><p className="text-lg font-bold">{fmt(totalCommission)}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-chart-3/20"><Users className="w-5 h-5 text-chart-3" /></div><div><p className="text-xs text-muted-foreground">Vendedores Ativos</p><p className="text-lg font-bold">{sellersCount}</p></div></CardContent></Card>
      </div>

      {chartData.length > 0 && (
        <Card><CardHeader><CardTitle className="text-base">Vendas vs Comissão por Vendedor</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Bar dataKey="vendas" name="Vendas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="comissao" name="Comissão" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>
      )}

      <Card><CardHeader><CardTitle className="text-base">Detalhamento</CardTitle></CardHeader><CardContent>
        {commissionData.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Nenhuma venda com vendedor identificado neste período. Certifique-se de que os funcionários tenham o campo "user_id" vinculado e taxa de comissão definida.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table><TableHeader><TableRow>
              <TableHead>Vendedor</TableHead><TableHead>Cargo</TableHead><TableHead className="text-right">Taxa %</TableHead><TableHead className="text-right">Vendas</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Comissão</TableHead>
            </TableRow></TableHeader><TableBody>
              {commissionData.map((c) => (
                <TableRow key={c.employee.id}>
                  <TableCell className="font-medium">{c.employee.name}</TableCell>
                  <TableCell>{c.employee.role || "-"}</TableCell>
                  <TableCell className="text-right"><Badge variant="secondary">{c.employee.commission_rate || 0}%</Badge></TableCell>
                  <TableCell className="text-right">{fmt(c.totalSales)}</TableCell>
                  <TableCell className="text-right">{c.salesCount}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{fmt(c.commission)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-bold">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right">{fmt(totalSales)}</TableCell>
                <TableCell className="text-right">{commissionData.reduce((s, c) => s + c.salesCount, 0)}</TableCell>
                <TableCell className="text-right text-primary">{fmt(totalCommission)}</TableCell>
              </TableRow>
            </TableBody></Table>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}