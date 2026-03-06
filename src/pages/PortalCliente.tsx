import { useState } from "react";
import { User, Package, Truck, CreditCard, Shield, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useSales } from "@/hooks/useSales";
import { useFinancialEntries } from "@/hooks/useFinancialEntries";
import { useDeliveryTracking } from "@/hooks/useDeliveryTracking";
import { useCompany } from "@/hooks/useCompany";
import { format } from "date-fns";

const orderStatusMap: Record<string, { label: string; color: string; progress: number }> = {
  pending: { label: "Pendente", color: "bg-muted text-muted-foreground", progress: 10 },
  confirmed: { label: "Confirmado", color: "bg-blue-500/10 text-blue-600", progress: 25 },
  em_separacao: { label: "Em Separação", color: "bg-amber-500/10 text-amber-600", progress: 40 },
  em_rota: { label: "Em Rota de Entrega", color: "bg-orange-500/10 text-orange-600", progress: 65 },
  proximo: { label: "Próximo", color: "bg-orange-500/10 text-orange-600", progress: 75 },
  montagem: { label: "Em Montagem", color: "bg-purple-500/10 text-purple-600", progress: 80 },
  completed: { label: "Entregue", color: "bg-emerald-500/10 text-emerald-600", progress: 100 },
  entregue: { label: "Entregue", color: "bg-emerald-500/10 text-emerald-600", progress: 100 },
};

const fallbackStatus = { label: "Em Andamento", color: "bg-muted text-muted-foreground", progress: 50 };

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PortalCliente() {
  const [activeTab, setActiveTab] = useState("pedidos");
  const { companyName } = useCompany();
  const { data: sales = [], isLoading: loadingSales } = useSales(100);
  const { data: entries = [], isLoading: loadingEntries } = useFinancialEntries({ type: "receber" });
  const { deliveries, loading: loadingDeliveries } = useDeliveryTracking();

  const activeDeliveries = deliveries.filter(d => d.status !== "entregue");

  // Derive warranties from completed sales (1-year warranty)
  const warranties = sales
    .filter(s => s.status === "completed" || s.status === "entregue")
    .map(s => {
      const purchaseDate = new Date(s.created_at);
      const validUntil = new Date(purchaseDate);
      validUntil.setFullYear(validUntil.getFullYear() + 1);
      return {
        id: s.id,
        description: s.customer_name || `Pedido #${s.number || s.id.slice(0, 6)}`,
        purchaseDate,
        validUntil,
        active: validUntil > new Date(),
      };
    });

  const isLoading = loadingSales || loadingEntries || loadingDeliveries;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <User className="w-6 h-6 text-primary" /> Portal do Cliente
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Área do cliente: pedidos, entregas, pagamentos e garantias</p>
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-lg">
            {(companyName || "L").charAt(0)}
          </div>
          <div>
            <h2 className="font-semibold text-lg">{companyName || "Loja"}</h2>
            <p className="text-sm text-muted-foreground">
              {sales.length} pedidos • {warranties.filter(w => w.active).length} garantias ativas
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-md">
          <TabsTrigger value="pedidos" className="gap-1"><Package className="w-3.5 h-3.5" /> Pedidos</TabsTrigger>
          <TabsTrigger value="entregas" className="gap-1"><Truck className="w-3.5 h-3.5" /> Entregas</TabsTrigger>
          <TabsTrigger value="pagamentos" className="gap-1"><CreditCard className="w-3.5 h-3.5" /> Parcelas</TabsTrigger>
          <TabsTrigger value="garantias" className="gap-1"><Shield className="w-3.5 h-3.5" /> Garantias</TabsTrigger>
        </TabsList>

        {/* PEDIDOS */}
        <TabsContent value="pedidos" className="space-y-3 mt-4">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : sales.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Nenhum pedido encontrado</p>
          ) : (
            sales.map(sale => {
              const st = orderStatusMap[sale.status] || fallbackStatus;
              const saleLabel = sale.number ? `PED-${sale.number}` : sale.id.slice(0, 8);
              // Extract item names from items_json
              let itemNames = "";
              try {
                const items = Array.isArray(sale.items_json) ? sale.items_json : JSON.parse(sale.items_json || "[]");
                itemNames = items.map((i: any) => i.product_name || i.name || "Item").join(", ");
              } catch { itemNames = ""; }

              return (
                <Card key={sale.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold">{saleLabel}</span>
                        <Badge variant="outline" className={st.color}>{st.label}</Badge>
                      </div>
                      <span className="text-sm font-semibold text-primary">{formatCurrency(sale.total_value)}</span>
                    </div>
                    {itemNames && <p className="text-xs text-muted-foreground mb-2">{itemNames}</p>}
                    {sale.customer_name && <p className="text-xs text-muted-foreground mb-2">Cliente: {sale.customer_name}</p>}
                    <Progress value={st.progress} className="h-2" />
                    <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                      <span>Pedido</span><span>Separação</span><span>Entrega</span><span>Montagem</span><span>Concluído</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ENTREGAS */}
        <TabsContent value="entregas" className="space-y-3 mt-4">
          {loadingDeliveries ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : activeDeliveries.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Nenhuma entrega em andamento</p>
          ) : (
            activeDeliveries.map(d => {
              const st = orderStatusMap[d.status] || fallbackStatus;
              return (
                <Card key={d.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-primary/10"><Truck className="w-5 h-5 text-primary" /></div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm">{d.client_name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {d.address} {d.eta ? `• Previsão: ${d.eta}` : ""}
                        </p>
                        {d.driver_name && <p className="text-xs text-muted-foreground">Motorista: {d.driver_name}</p>}
                      </div>
                      <Badge className={st.color}>{st.label}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* PAGAMENTOS */}
        <TabsContent value="pagamentos" className="space-y-3 mt-4">
          {loadingEntries ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : entries.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Nenhuma parcela encontrada</p>
          ) : (
            entries.map(entry => {
              const isPaid = entry.status === "pago";
              return (
                <Card key={entry.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isPaid
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        : <Clock className="w-5 h-5 text-amber-500" />
                      }
                      <div>
                        <p className="text-sm font-medium">{entry.description}</p>
                        <p className="text-xs text-muted-foreground">
                          Venc: {format(new Date(entry.due_date), "dd/MM/yyyy")}
                          {entry.category ? ` • ${entry.category}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">{formatCurrency(entry.amount)}</p>
                      <Badge variant={isPaid ? "default" : "outline"} className={`text-[10px] ${isPaid ? "bg-emerald-500" : ""}`}>
                        {isPaid ? "PAGO" : "PENDENTE"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* GARANTIAS */}
        <TabsContent value="garantias" className="space-y-3 mt-4">
          {loadingSales ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : warranties.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Nenhuma garantia encontrada</p>
          ) : (
            warranties.map(w => (
              <Card key={w.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{w.description}</p>
                      <p className="text-xs text-muted-foreground">Válida até {format(w.validUntil, "dd/MM/yyyy")}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={w.active ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}>
                    {w.active ? "Ativa" : "Expirada"}
                  </Badge>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
