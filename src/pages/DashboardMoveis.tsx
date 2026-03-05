import { useMemo } from "react";
import { useProducts } from "@/hooks/useProducts";
import { useSales } from "@/hooks/useSales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Armchair, Package, Truck, Wrench, TrendingUp, DollarSign,
  AlertTriangle, CheckCircle, Clock, ShoppingCart,
} from "lucide-react";
import { motion } from "framer-motion";

// Load localStorage data
function loadJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") || fallback; } catch { return fallback; }
}

export default function DashboardMoveis() {
  const { data: products = [] } = useProducts();
  const { data: sales = [] } = useSales();

  const deliveries = loadJSON<any[]>("as_furniture_deliveries", []);
  const assemblies = loadJSON<any[]>("as_furniture_assemblies", []);
  const showroomData = loadJSON<Record<string, any>>("as_showroom_items", {});

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const stats = useMemo(() => {
    const totalProducts = products.length;
    const totalStock = products.reduce((s, p) => s + (p.stock_quantity || 0), 0);
    const stockValue = products.reduce((s, p) => s + (p.price || 0) * (p.stock_quantity || 0), 0);
    const lowStock = products.filter(p => p.min_stock && p.stock_quantity <= p.min_stock).length;

    const pendingDeliveries = deliveries.filter(d => d.status === "pendente" || d.status === "em_rota").length;
    const completedDeliveries = deliveries.filter(d => d.status === "entregue").length;
    const pendingAssemblies = assemblies.filter(a => a.status === "agendada" || a.status === "em_andamento").length;
    const completedAssemblies = assemblies.filter(a => a.status === "concluida").length;

    const showroomMontado = Object.values(showroomData).filter((s: any) => s.status === "montado").length;
    const showroomRepor = Object.values(showroomData).filter((s: any) => s.status === "reposicao" || s.status === "desmontado" || s.status === "danificado").length;

    const totalSales = sales.length;
    const totalRevenue = sales.reduce((s: number, v: any) => s + (v.total || 0), 0);
    const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

    return {
      totalProducts, totalStock, stockValue, lowStock,
      pendingDeliveries, completedDeliveries,
      pendingAssemblies, completedAssemblies,
      showroomMontado, showroomRepor,
      totalSales, totalRevenue, avgTicket,
    };
  }, [products, deliveries, assemblies, showroomData, sales]);

  const cards = [
    { label: "Produtos Ativos", value: stats.totalProducts, icon: Package, color: "text-primary" },
    { label: "Faturamento", value: fmt(stats.totalRevenue), icon: DollarSign, color: "text-emerald-600" },
    { label: "Ticket Médio", value: fmt(stats.avgTicket), icon: TrendingUp, color: "text-blue-600" },
    { label: "Valor em Estoque", value: fmt(stats.stockValue), icon: ShoppingCart, color: "text-primary" },
  ];

  const operationalCards = [
    { label: "Entregas Pendentes", value: stats.pendingDeliveries, icon: Truck, color: stats.pendingDeliveries > 0 ? "text-amber-600" : "text-emerald-600", alert: stats.pendingDeliveries > 0 },
    { label: "Entregas Concluídas", value: stats.completedDeliveries, icon: CheckCircle, color: "text-emerald-600" },
    { label: "Montagens Pendentes", value: stats.pendingAssemblies, icon: Wrench, color: stats.pendingAssemblies > 0 ? "text-amber-600" : "text-emerald-600", alert: stats.pendingAssemblies > 0 },
    { label: "Montagens Concluídas", value: stats.completedAssemblies, icon: CheckCircle, color: "text-emerald-600" },
  ];

  const showroomCards = [
    { label: "Montados na Exposição", value: stats.showroomMontado, icon: Armchair, color: "text-emerald-600" },
    { label: "Falta Repor/Montar", value: stats.showroomRepor, icon: AlertTriangle, color: stats.showroomRepor > 0 ? "text-destructive" : "text-muted-foreground", alert: stats.showroomRepor > 0 },
    { label: "Estoque Baixo", value: stats.lowStock, icon: AlertTriangle, color: stats.lowStock > 0 ? "text-amber-600" : "text-emerald-600", alert: stats.lowStock > 0 },
    { label: "Total Vendas", value: stats.totalSales, icon: ShoppingCart, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Armchair className="w-6 h-6 text-primary" />
          Dashboard — Loja de Móveis
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Visão geral do seu negócio de móveis</p>
      </div>

      {/* Financial KPIs */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase mb-3">💰 Financeiro</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((c, i) => (
            <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground uppercase">{c.label}</p>
                    <c.icon className={cn("w-4 h-4", c.color)} />
                  </div>
                  <p className={cn("text-xl font-bold mt-2", c.color)}>{c.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Operational KPIs */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase mb-3">🚚 Operações</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {operationalCards.map((c, i) => (
            <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}>
              <Card className={c.alert ? "border-amber-500/30" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground uppercase">{c.label}</p>
                    <c.icon className={cn("w-4 h-4", c.color)} />
                  </div>
                  <p className={cn("text-2xl font-bold mt-2", c.color)}>{c.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Showroom & Stock */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase mb-3">🏬 Exposição & Estoque</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {showroomCards.map((c, i) => (
            <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.05 }}>
              <Card className={c.alert ? "border-destructive/30" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground uppercase">{c.label}</p>
                    <c.icon className={cn("w-4 h-4", c.color)} />
                  </div>
                  <p className={cn("text-2xl font-bold mt-2", c.color)}>{c.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {(stats.pendingDeliveries > 0 || stats.pendingAssemblies > 0 || stats.showroomRepor > 0 || stats.lowStock > 0) && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-4 h-4" /> Atenção
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {stats.pendingDeliveries > 0 && <p className="text-sm">🚚 {stats.pendingDeliveries} entrega{stats.pendingDeliveries > 1 ? "s" : ""} pendente{stats.pendingDeliveries > 1 ? "s" : ""}</p>}
              {stats.pendingAssemblies > 0 && <p className="text-sm">🔧 {stats.pendingAssemblies} montagem{stats.pendingAssemblies > 1 ? "ns" : ""} pendente{stats.pendingAssemblies > 1 ? "s" : ""}</p>}
              {stats.showroomRepor > 0 && <p className="text-sm">🏬 {stats.showroomRepor} item{stats.showroomRepor > 1 ? "ns" : ""} para repor na exposição</p>}
              {stats.lowStock > 0 && <p className="text-sm">⚠️ {stats.lowStock} produto{stats.lowStock > 1 ? "s" : ""} com estoque baixo</p>}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
