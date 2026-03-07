import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { adminQuery } from "@/lib/admin-query";

export function AdminCompanyGrowthChart() {
  const [data, setData] = useState<{ month: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const companies = await adminQuery<{ created_at: string }>({
          table: "companies",
          select: "created_at",
          order: { column: "created_at", ascending: true },
          limit: 5000,
        });

        // Group by month
        const monthMap: Record<string, number> = {};
        const now = new Date();
        // Last 6 months
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          monthMap[key] = 0;
        }

        for (const c of companies) {
          const key = c.created_at?.slice(0, 7);
          if (key && key in monthMap) monthMap[key]++;
        }

        const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        setData(
          Object.entries(monthMap).map(([k, v]) => ({
            month: months[parseInt(k.split("-")[1]) - 1],
            total: v,
          }))
        );
      } catch (err) {
        console.error("[AdminCompanyGrowthChart]", err);
      }
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" /> Crescimento de Empresas
      </h3>
      <Card>
        <CardContent className="p-4">
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Empresas"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
