import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { DollarSign, TrendingUp, Building2, Crown, Users, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const PLAN_PRICES: Record<string, number> = {
  starter: 149.9,
  business: 199.9,
  pro: 449.9,
  emissor: 99.9,
};

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  business: "Business",
  pro: "Pro",
  emissor: "Emissor",
};

const PLAN_COLORS: Record<string, string> = {
  starter: "hsl(var(--primary))",
  business: "hsl(45 100% 51%)",
  pro: "hsl(280 70% 55%)",
  emissor: "hsl(200 70% 50%)",
};

interface PlanMetrics {
  plan: string;
  active: number;
  trial: number;
  total: number;
  mrr: number;
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AdminRevenue() {
  const [metrics, setMetrics] = useState<PlanMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("company_plans")
        .select("plan, status");

      const grouped: Record<string, { active: number; trial: number; total: number }> = {};

      for (const tier of ["starter", "business", "pro", "emissor"]) {
        grouped[tier] = { active: 0, trial: 0, total: 0 };
      }

      (data ?? []).forEach((row: any) => {
        const plan = (row.plan || "starter").toLowerCase();
        if (!grouped[plan]) grouped[plan] = { active: 0, trial: 0, total: 0 };
        grouped[plan].total++;
        if (row.status === "active") grouped[plan].active++;
        if (row.status === "trial" || row.status === "trialing") grouped[plan].trial++;
      });

      const result: PlanMetrics[] = Object.entries(grouped).map(([plan, counts]) => ({
        plan,
        ...counts,
        mrr: counts.active * (PLAN_PRICES[plan] || 0),
      }));

      setMetrics(result);
      setLoading(false);
    };
    load();
  }, []);

  const totalMRR = metrics.reduce((sum, m) => sum + m.mrr, 0);
  const totalActive = metrics.reduce((sum, m) => sum + m.active, 0);
  const totalTrial = metrics.reduce((sum, m) => sum + m.trial, 0);
  const totalEmpresas = metrics.reduce((sum, m) => sum + m.total, 0);

  const chartData = metrics.map((m) => ({
    name: PLAN_LABELS[m.plan] || m.plan,
    value: m.mrr,
    color: PLAN_COLORS[m.plan] || "hsl(var(--primary))",
  }));

  return (
    <div className="space-y-6">
      {/* Total MRR Hero */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Crown className="w-5 h-5 text-primary" />
              <p className="text-sm font-semibold text-muted-foreground">Receita Mensal Recorrente (MRR)</p>
            </div>
            {loading ? (
              <Skeleton className="h-10 w-48 mx-auto" />
            ) : (
              <p className="text-4xl font-black text-foreground tracking-tight">{formatBRL(totalMRR)}</p>
            )}
            <div className="flex items-center justify-center gap-6 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {totalEmpresas} empresas</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {totalActive} ativas</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {totalTrial} em trial</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Cards por plano */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((m, i) => (
          <motion.div
            key={m.plan}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${PLAN_COLORS[m.plan]}20`, color: PLAN_COLORS[m.plan] }}
                  >
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{PLAN_LABELS[m.plan] || m.plan}</p>
                    <p className="text-xs text-muted-foreground">{formatBRL(PLAN_PRICES[m.plan] || 0)}/mês</p>
                  </div>
                </div>
                {loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <>
                    <p className="text-2xl font-black text-foreground">{formatBRL(m.mrr)}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{m.active} ativas</span>
                      <span>{m.trial} trial</span>
                      <span>{m.total} total</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Gráfico MRR por plano */}
      {!loading && totalMRR > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> MRR por Plano
              </h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={48}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatBRL(value), "MRR"]}
                      contentStyle={{ borderRadius: 12, fontSize: 13 }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Tabela detalhada */}
      {!loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Resumo Detalhado</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Plano</th>
                      <th className="pb-2 font-medium text-center">Ativas</th>
                      <th className="pb-2 font-medium text-center">Trial</th>
                      <th className="pb-2 font-medium text-center">Total</th>
                      <th className="pb-2 font-medium text-right">Valor Unitário</th>
                      <th className="pb-2 font-medium text-right">MRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map((m) => (
                      <tr key={m.plan} className="border-b last:border-0">
                        <td className="py-2.5 font-semibold text-foreground">{PLAN_LABELS[m.plan]}</td>
                        <td className="py-2.5 text-center">{m.active}</td>
                        <td className="py-2.5 text-center">{m.trial}</td>
                        <td className="py-2.5 text-center">{m.total}</td>
                        <td className="py-2.5 text-right text-muted-foreground">{formatBRL(PLAN_PRICES[m.plan] || 0)}</td>
                        <td className="py-2.5 text-right font-bold text-foreground">{formatBRL(m.mrr)}</td>
                      </tr>
                    ))}
                    <tr className="bg-muted/50 font-bold">
                      <td className="py-2.5 text-foreground">TOTAL</td>
                      <td className="py-2.5 text-center">{totalActive}</td>
                      <td className="py-2.5 text-center">{totalTrial}</td>
                      <td className="py-2.5 text-center">{totalEmpresas}</td>
                      <td className="py-2.5 text-right">—</td>
                      <td className="py-2.5 text-right text-primary">{formatBRL(totalMRR)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
