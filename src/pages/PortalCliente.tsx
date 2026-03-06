import { useState } from "react";
import { User, Package, Truck, CreditCard, Shield, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const mockOrders = [
  { id: "PED-1042", date: "2026-02-20", items: ["Sofá Retrátil 3L", "Mesa de Centro"], total: 4890, status: "entregue" as const },
  { id: "PED-1078", date: "2026-03-02", items: ["Guarda-Roupa 6P", "Criado-Mudo x2"], total: 3250, status: "em_rota" as const },
  { id: "PED-1095", date: "2026-03-05", items: ["Escrivaninha", "Cadeira Gamer"], total: 1890, status: "montagem" as const },
];

const mockPayments = [
  { id: "PAG-01", orderId: "PED-1078", type: "Carnê 6x", installment: "2/6", value: 541.67, dueDate: "2026-04-02", paid: false },
  { id: "PAG-02", orderId: "PED-1078", type: "Carnê 6x", installment: "1/6", value: 541.67, dueDate: "2026-03-02", paid: true },
  { id: "PAG-03", orderId: "PED-1042", type: "PIX", installment: "Única", value: 4890, dueDate: "2026-02-20", paid: true },
];

const mockWarranties = [
  { product: "Sofá Retrátil 3L", validUntil: "2027-02-20", status: "ativa" as const },
  { product: "Mesa de Centro", validUntil: "2027-02-20", status: "ativa" as const },
];

const orderStatusMap = {
  pendente: { label: "Pendente", color: "bg-muted text-muted-foreground", progress: 10 },
  confirmado: { label: "Confirmado", color: "bg-blue-500/10 text-blue-600", progress: 25 },
  separacao: { label: "Em Separação", color: "bg-amber-500/10 text-amber-600", progress: 40 },
  em_rota: { label: "Em Rota de Entrega", color: "bg-orange-500/10 text-orange-600", progress: 65 },
  montagem: { label: "Em Montagem", color: "bg-purple-500/10 text-purple-600", progress: 80 },
  entregue: { label: "Entregue", color: "bg-emerald-500/10 text-emerald-600", progress: 100 },
};

export default function PortalCliente() {
  const [activeTab, setActiveTab] = useState("pedidos");
  const clientName = "Maria Silva";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <User className="w-6 h-6 text-primary" /> Portal do Cliente
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Área do cliente: pedidos, entregas, pagamentos e garantias</p>
      </div>

      {/* Client header */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-lg">
            {clientName.split(" ").map(n => n[0]).join("")}
          </div>
          <div>
            <h2 className="font-semibold text-lg">{clientName}</h2>
            <p className="text-sm text-muted-foreground">{mockOrders.length} pedidos • {mockWarranties.length} garantias ativas</p>
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

        <TabsContent value="pedidos" className="space-y-3 mt-4">
          {mockOrders.map(order => {
            const st = orderStatusMap[order.status];
            return (
              <Card key={order.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">{order.id}</span>
                      <Badge variant="outline" className={st.color}>{st.label}</Badge>
                    </div>
                    <span className="text-sm font-semibold text-primary">R$ {order.total.toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{order.items.join(", ")}</p>
                  <Progress value={st.progress} className="h-2" />
                  <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                    <span>Pedido</span><span>Separação</span><span>Entrega</span><span>Montagem</span><span>Concluído</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="entregas" className="space-y-3 mt-4">
          {mockOrders.filter(o => ["em_rota", "montagem"].includes(o.status)).map(order => (
            <Card key={order.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-primary/10"><Truck className="w-5 h-5 text-primary" /></div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">{order.id} — {order.items[0]}</h3>
                    <p className="text-xs text-muted-foreground">
                      {order.status === "em_rota" ? "🚚 Veículo a caminho • Previsão: Hoje 14h-16h" : "🔧 Equipe de montagem no local"}
                    </p>
                  </div>
                  <Badge className={orderStatusMap[order.status].color}>{orderStatusMap[order.status].label}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          {mockOrders.filter(o => ["em_rota", "montagem"].includes(o.status)).length === 0 && (
            <p className="text-center text-muted-foreground py-10">Nenhuma entrega em andamento</p>
          )}
        </TabsContent>

        <TabsContent value="pagamentos" className="space-y-3 mt-4">
          {mockPayments.map(pay => (
            <Card key={pay.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {pay.paid
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    : <Clock className="w-5 h-5 text-amber-500" />
                  }
                  <div>
                    <p className="text-sm font-medium">{pay.type} — Parcela {pay.installment}</p>
                    <p className="text-xs text-muted-foreground">Pedido {pay.orderId} • Venc: {pay.dueDate}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">R$ {pay.value.toFixed(2)}</p>
                  <Badge variant={pay.paid ? "default" : "outline"} className={`text-[10px] ${pay.paid ? "bg-emerald-500" : ""}`}>
                    {pay.paid ? "PAGO" : "PENDENTE"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="garantias" className="space-y-3 mt-4">
          {mockWarranties.map((w, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{w.product}</p>
                    <p className="text-xs text-muted-foreground">Válida até {w.validUntil}</p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600">Ativa</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
