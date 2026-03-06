import { useState } from "react";
import { MapPin, Truck, Clock, CheckCircle2, Phone, MessageSquare, Navigation, Copy, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface DeliveryTracking {
  id: string;
  orderId: string;
  clientName: string;
  clientPhone: string;
  address: string;
  driver: string;
  driverPhone: string;
  status: "em_separacao" | "em_rota" | "proximo" | "entregue";
  eta: string;
  timeline: { time: string; event: string; done: boolean }[];
  trackingLink: string;
}

const mockDeliveries: DeliveryTracking[] = [
  {
    id: "ENT-042", orderId: "PED-1078", clientName: "Maria Silva", clientPhone: "(11) 99999-1234",
    address: "Rua das Flores, 123 - Vila Nova", driver: "Carlos", driverPhone: "(11) 97777-5678",
    status: "em_rota", eta: "14:30", trackingLink: "https://rastreio.loja.com/ENT-042",
    timeline: [
      { time: "08:00", event: "Pedido separado no depósito", done: true },
      { time: "10:15", event: "Carregado no veículo", done: true },
      { time: "11:00", event: "Saiu para entrega", done: true },
      { time: "14:30", event: "Previsão de chegada", done: false },
      { time: "--:--", event: "Entrega confirmada", done: false },
    ],
  },
  {
    id: "ENT-043", orderId: "PED-1095", clientName: "João Santos", clientPhone: "(11) 98888-5678",
    address: "Av. Brasil, 456 - Centro", driver: "Roberto", driverPhone: "(11) 96666-4321",
    status: "proximo", eta: "12:00", trackingLink: "https://rastreio.loja.com/ENT-043",
    timeline: [
      { time: "08:00", event: "Pedido separado no depósito", done: true },
      { time: "09:30", event: "Carregado no veículo", done: true },
      { time: "10:00", event: "Saiu para entrega", done: true },
      { time: "11:45", event: "Motorista próximo ao destino", done: true },
      { time: "12:00", event: "Previsão de chegada", done: false },
    ],
  },
  {
    id: "ENT-041", orderId: "PED-1042", clientName: "Ana Costa", clientPhone: "(11) 97777-9999",
    address: "Rua Palmeiras, 789 - Jardim Europa", driver: "Carlos", driverPhone: "(11) 97777-5678",
    status: "entregue", eta: "Concluída", trackingLink: "",
    timeline: [
      { time: "08:00", event: "Pedido separado", done: true },
      { time: "09:00", event: "Saiu para entrega", done: true },
      { time: "10:30", event: "Entrega confirmada ✅", done: true },
    ],
  },
];

const statusConfig = {
  em_separacao: { label: "Em Separação", color: "bg-blue-500/10 text-blue-600", icon: "📦" },
  em_rota: { label: "Em Rota", color: "bg-amber-500/10 text-amber-600", icon: "🚚" },
  proximo: { label: "Próximo", color: "bg-orange-500/10 text-orange-600", icon: "📍" },
  entregue: { label: "Entregue", color: "bg-emerald-500/10 text-emerald-600", icon: "✅" },
};

export default function RastreioEntrega() {
  const [deliveries] = useState<DeliveryTracking[]>(mockDeliveries);

  const copyTrackingLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("Link copiado! Envie para o cliente.");
  };

  const sendTrackingWhatsApp = (delivery: DeliveryTracking) => {
    const msg = `Olá ${delivery.clientName.split(" ")[0]}! 😊\n\n🚚 Sua entrega ${delivery.id} está a caminho!\n📍 Status: ${statusConfig[delivery.status].label}\n⏰ Previsão: ${delivery.eta}\n🔗 Acompanhe: ${delivery.trackingLink}\n\nMotorista: ${delivery.driver} (${delivery.driverPhone})`;
    window.open(`https://wa.me/55${delivery.clientPhone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const active = deliveries.filter(d => d.status !== "entregue");
  const completed = deliveries.filter(d => d.status === "entregue");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Navigation className="w-6 h-6 text-primary" /> Rastreio de Entregas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Acompanhamento em tempo real com link de rastreio para o cliente</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["em_separacao", "em_rota", "proximo", "entregue"] as const).map(s => {
          const count = deliveries.filter(d => d.status === s).length;
          const { label, icon } = statusConfig[s];
          return (
            <Card key={s}><CardContent className="p-3 text-center">
              <span className="text-2xl">{icon}</span>
              <p className="text-xl font-bold mt-1">{count}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent></Card>
          );
        })}
      </div>

      {/* Active deliveries */}
      {active.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-lg">🚚 Entregas em Andamento</h2>
          {active.map(delivery => {
            const { label, color } = statusConfig[delivery.status];
            return (
              <Card key={delivery.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-bold">{delivery.id}</span>
                        <Badge variant="outline" className={color}>{label}</Badge>
                        <Badge variant="outline" className="text-xs">ETA: {delivery.eta}</Badge>
                      </div>
                      <h3 className="font-semibold">{delivery.clientName}</h3>
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{delivery.address}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Truck className="w-3 h-3" />Motorista: {delivery.driver} • {delivery.driverPhone}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => copyTrackingLink(delivery.trackingLink)} className="gap-1">
                        <Copy className="w-3.5 h-3.5" /> Link
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => sendTrackingWhatsApp(delivery)} className="gap-1 text-[#25D366]">
                        📱 WhatsApp
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => window.open(`tel:${delivery.driverPhone}`, "_self")} className="gap-1">
                        <Phone className="w-3.5 h-3.5" /> Ligar
                      </Button>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="relative pl-6 space-y-3">
                    {delivery.timeline.map((event, i) => (
                      <div key={i} className="flex items-start gap-3 relative">
                        <div className={`absolute left-[-18px] w-3 h-3 rounded-full border-2 ${event.done ? "bg-primary border-primary" : "bg-background border-muted-foreground/30"}`} />
                        {i < delivery.timeline.length - 1 && (
                          <div className={`absolute left-[-13px] top-4 w-0.5 h-6 ${event.done ? "bg-primary/30" : "bg-muted-foreground/15"}`} />
                        )}
                        <div className="flex-1">
                          <p className={`text-sm ${event.done ? "font-medium" : "text-muted-foreground"}`}>{event.event}</p>
                          <p className="text-[10px] text-muted-foreground">{event.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">✅ Entregas Concluídas</h2>
          {completed.map(d => (
            <Card key={d.id} className="opacity-75">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="font-medium text-sm">{d.clientName} — {d.orderId}</p>
                    <p className="text-xs text-muted-foreground">{d.address}</p>
                  </div>
                </div>
                <Badge className="bg-emerald-500">Entregue</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
