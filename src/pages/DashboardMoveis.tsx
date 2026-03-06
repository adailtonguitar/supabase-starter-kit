import { useMemo } from "react";
import { useProducts } from "@/hooks/useProducts";
import { useSales } from "@/hooks/useSales";
import { useDeliveryTracking } from "@/hooks/useDeliveryTracking";
import { useFurnitureProjects } from "@/hooks/useFurnitureProjects";
import { useTechnicalTickets } from "@/hooks/useTechnicalTickets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Armchair, Package, Truck, Wrench, TrendingUp, DollarSign,
  AlertTriangle, CheckCircle, Clock, ShoppingCart, Home, Star, BarChart3,
} from "lucide-react";
import { motion } from "framer-motion";

export default function DashboardMoveis() {
  const { data: products = [] } = useProducts();
  const { data: sales = [] } = useSales();
  const { deliveries } = useDeliveryTracking();
  const { projects } = useFurnitureProjects();
  const { tickets } = useTechnicalTickets();

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const stats = useMemo(() => {
    const totalProducts = products.length;
    const totalStock = products.reduce((s, p) => s + (p.stock_quantity || 0), 0);
    const stockValue = products.reduce((s, p) => s + (p.price || 0) * (p.stock_quantity || 0), 0);
    const lowStock = products.filter(p => p.min_stock && p.stock_quantity <= p.min_stock).length;

    // Entregas do banco (delivery_tracking)
    const pendingDeliveries = deliveries.filter(d => d.status === "em_separacao" || d.status === "em_rota" || d.status === "proximo").length;
    const completedDeliveries = deliveries.filter(d => d.status === "entregue").length;

    // Tickets técnicos do banco
    const pendingTickets = tickets.filter(t => t.status === "aberto" || t.status === "em_andamento" || t.status === "aguardando_peca").length;
    const completedTickets = tickets.filter(t => t.status === "concluido").length;

    const totalSales = sales.length;
    const totalRevenue = sales.reduce((s: number, v: any) => s + (v.total || 0), 0);
    const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

    const totalCost = products.reduce((s, p) => s + (p.cost_price || 0) * (p.stock_quantity || 0), 0);
    const avgMargin = stockValue > 0 ? ((stockValue - totalCost) / stockValue * 100) : 0;

    const deliveryRate = deliveries.length > 0 ? (completedDeliveries / deliveries.length * 100) : 0;

    // Projetos (galeria antes/depois) do banco
    const totalProjects = projects.length;
    const avgRating = projects.length > 0
      ? projects.reduce((s, p: any) => s + (p.rating || 0), 0) / projects.filter((p: any) => p.rating > 0).length || 0
      : 0;

    return {
      totalProducts, totalStock, stockValue, lowStock,
      pendingDeliveries, completedDeliveries,
      pendingTickets, completedTickets,
      totalSales, totalRevenue, avgTicket,
      avgMargin, avgRating, deliveryRate, totalProjects,
    };
  }, [products, deliveries, sales, projects, tickets]);

  const financialCards = [
    { label: "Faturamento", value: fmt(stats.totalRevenue), icon: DollarSign, color: "text-emerald-600" },
    { label: "Ticket Médio", value: fmt(stats.avgTicket), icon: TrendingUp, color: "text-blue-600" },
    { label: "Valor em Estoque", value: fmt(stats.stockValue), icon: ShoppingCart, color: "text-primary" },
    { label: "Margem Média", value: `${stats.avgMargin.toFixed(1)}%`, icon: BarChart3, color: stats.avgMargin > 30 ? "text-emerald-600" : "text-amber-600" },
  ];

  const operationalCards = [
    { label: "Entregas Pendentes", value: stats.pendingDeliveries, icon: Truck, color: stats.pendingDeliveries > 0 ? "text-amber-600" : "text-emerald-600", alert: stats.pendingDeliveries > 0 },
    { label: "Entregas Concluídas", value: stats.completedDeliveries, icon: CheckCircle, color: "text-emerald-600" },
    { label: "Chamados Abertos", value: stats.pendingTickets, icon: Wrench, color: stats.pendingTickets > 0 ? "text-amber-600" : "text-emerald-600", alert: stats.pendingTickets > 0 },
    { label: "Taxa de Entrega", value: `${stats.deliveryRate.toFixed(0)}%`, icon: CheckCircle, color: "text-emerald-600" },
  ];

  const showroomCards = [
    { label: "Produtos Cadastrados", value: stats.totalProducts, icon: Armchair, color: "text-primary" },
    { label: "Estoque Baixo", value: stats.lowStock, icon: AlertTriangle, color: stats.lowStock > 0 ? "text-destructive" : "text-muted-foreground", alert: stats.lowStock > 0 },
    { label: "Projetos (Galeria)", value: stats.totalProjects, icon: Home, color: "text-primary" },
    { label: "Avaliação Média", value: stats.avgRating > 0 ? `${stats.avgRating.toFixed(1)} ⭐` : "—", icon: Star, color: "text-amber-500" },
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
              <span><strong>{stats.totalProjects}</strong> projetos</span>
              <span>•</span>
              <span><strong>{stats.pendingDeliveries + stats.pendingTickets}</strong> pendências</span>
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
      {renderCardSection("Showroom & Portfólio", "🏬", showroomCards, 0.4)}

      {(stats.pendingDeliveries > 0 || stats.pendingTickets > 0 || stats.lowStock > 0) && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-4 h-4" /> Atenção
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {stats.pendingDeliveries > 0 && <p className="text-sm">🚚 {stats.pendingDeliveries} entrega{stats.pendingDeliveries > 1 ? "s" : ""} pendente{stats.pendingDeliveries > 1 ? "s" : ""}</p>}
              {stats.pendingTickets > 0 && <p className="text-sm">🔧 {stats.pendingTickets} chamado{stats.pendingTickets > 1 ? "s" : ""} técnico{stats.pendingTickets > 1 ? "s" : ""} aberto{stats.pendingTickets > 1 ? "s" : ""}</p>}
              {stats.lowStock > 0 && <p className="text-sm">⚠️ {stats.lowStock} produto{stats.lowStock > 1 ? "s" : ""} com estoque baixo</p>}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
