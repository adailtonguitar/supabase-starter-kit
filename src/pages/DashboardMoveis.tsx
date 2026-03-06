import { useMemo } from "react";
import { useProducts } from "@/hooks/useProducts";
import { useSales } from "@/hooks/useSales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Armchair, Package, Truck, Wrench, TrendingUp, DollarSign,
  AlertTriangle, CheckCircle, Clock, ShoppingCart, Home, Star, BarChart3,
} from "lucide-react";
import { motion } from "framer-motion";

function loadJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") || fallback; } catch { return fallback; }
}

export default function DashboardMoveis() {
  const { data: products = [] } = useProducts();
  const { data: sales = [] } = useSales();

  const deliveries = loadJSON<any[]>("as_furniture_deliveries", []);
  const assemblies = loadJSON<any[]>("as_furniture_assemblies", []);
  const showroomData = loadJSON<Record<string, any>>("as_showroom_items", {});
  const reviews = loadJSON<any[]>("as_furniture_reviews", []);

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

    const totalCost = products.reduce((s, p) => s + (p.cost_price || 0) * (p.stock_quantity || 0), 0);
    const avgMargin = stockValue > 0 ? ((stockValue - totalCost) / stockValue * 100) : 0;

    const avgRating = reviews.length > 0 ? reviews.reduce((s: number, r: any) => s + (r.rating || 0), 0) / reviews.length : 0;
    const deliveryRate = deliveries.length > 0 ? (completedDeliveries / deliveries.length * 100) : 0;

    return {
      totalProducts, totalStock, stockValue, lowStock,
      pendingDeliveries, completedDeliveries,
      pendingAssemblies, completedAssemblies,
      showroomMontado, showroomRepor,
      totalSales, totalRevenue, avgTicket,
      avgMargin, avgRating, deliveryRate, reviewCount: reviews.length,
    };
  }, [products, deliveries, assemblies, showroomData, sales, reviews]);

  const financialCards = [
    { label: "Faturamento", value: fmt(stats.totalRevenue), icon: DollarSign, color: "text-emerald-600" },
    { label: "Ticket Médio", value: fmt(stats.avgTicket), icon: TrendingUp, color: "text-blue-600" },
    { label: "Valor em Estoque", value: fmt(stats.stockValue), icon: ShoppingCart, color: "text-primary" },
    { label: "Margem Média", value: `${stats.avgMargin.toFixed(1)}%`, icon: BarChart3, color: stats.avgMargin > 30 ? "text-emerald-600" : "text-amber-600" },
  ];

  const operationalCards = [
    { label: "Entregas Pendentes", value: stats.pendingDeliveries, icon: Truck, color: stats.pendingDeliveries > 0 ? "text-amber-600" : "text-emerald-600", alert: stats.pendingDeliveries > 0 },
    { label: "Entregas Concluídas", value: stats.completedDeliveries, icon: CheckCircle, color: "text-emerald-600" },
    { label: "Montagens Pendentes", value: stats.pendingAssemblies, icon: Wrench, color: stats.pendingAssemblies > 0 ? "text-amber-600" : "text-emerald-600", alert: stats.pendingAssemblies > 0 },
    { label: "Taxa de Entrega", value: `${stats.deliveryRate.toFixed(0)}%`, icon: CheckCircle, color: "text-emerald-600" },
  ];

  const showroomCards = [
    { label: "Montados na Exposição", value: stats.showroomMontado, icon: Armchair, color: "text-emerald-600" },
    { label: "Falta Repor/Montar", value: stats.showroomRepor, icon: AlertTriangle, color: stats.showroomRepor > 0 ? "text-destructive" : "text-muted-foreground", alert: stats.showroomRepor > 0 },
    { label: "Avaliação Clientes", value: stats.avgRating > 0 ? `${stats.avgRating.toFixed(1)} ⭐` : "—", icon: Star, color: "text-amber-500" },
    { label: "Avaliações", value: stats.reviewCount, icon: Star, color: "text-primary" },
  ];

  const renderCardSection = (title: string, emoji: string, cards: { label: string; value: string | number; icon: any; color: string; alert?: boolean }[], delay: number) => (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase mb-3">{emoji} {title}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay + i * 0.05 }}>
            <Card className={(c as any).alert ? "border-amber-500/30" : ""}>
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
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Armchair className="w-6 h-6 text-primary" />
          Dashboard — Loja de Móveis
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Visão completa do seu negócio de móveis</p>
      </div>

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-6 items-center justify-center text-sm">
              <span><strong>{stats.totalProducts}</strong> produtos</span>
              <span>•</span>
              <span><strong>{stats.totalSales}</strong> vendas</span>
              <span>•</span>
              <span><strong>{stats.showroomMontado}</strong> em exposição</span>
              <span>•</span>
              <span><strong>{stats.pendingDeliveries + stats.pendingAssemblies}</strong> pendências</span>
              {stats.avgRating > 0 && (
                <>
                  <span>•</span>
                  <span>⭐ <strong>{stats.avgRating.toFixed(1)}</strong> avaliação</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {renderCardSection("Financeiro", "💰", financialCards, 0)}
      {renderCardSection("Operações", "🚚", operationalCards, 0.2)}
      {renderCardSection("Exposição & Clientes", "🏬", showroomCards, 0.4)}

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
