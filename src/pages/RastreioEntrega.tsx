import { useState } from "react";
import { MapPin, Truck, CheckCircle2, Phone, Navigation, Copy, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useDeliveryTracking } from "@/hooks/useDeliveryTracking";
import { toast } from "sonner";

const statusConfig = {
  em_separacao: { label: "Em Separação", color: "bg-blue-500/10 text-blue-600", icon: "📦" },
  em_rota: { label: "Em Rota", color: "bg-amber-500/10 text-amber-600", icon: "🚚" },
  proximo: { label: "Próximo", color: "bg-orange-500/10 text-orange-600", icon: "📍" },
  entregue: { label: "Entregue", color: "bg-emerald-500/10 text-emerald-600", icon: "✅" },
};

export default function RastreioEntrega() {
  const { deliveries, loading, create, advanceStatus } = useDeliveryTracking();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ order_id: "", client_name: "", client_phone: "", address: "", driver_name: "", driver_phone: "", eta: "" });

  const handleCreate = () => {
    if (!form.client_name || !form.address) { toast.error("Preencha cliente e endereço"); return; }
    create(form);
    setForm({ order_id: "", client_name: "", client_phone: "", address: "", driver_name: "", driver_phone: "", eta: "" });
    setDialogOpen(false);
  };

  const sendTrackingWhatsApp = (d: typeof deliveries[0]) => {
    const st = statusConfig[d.status as keyof typeof statusConfig];
    const msg = `Olá ${d.client_name.split(" ")[0]}! 😊\n\n🚚 Sua entrega está a caminho!\n📍 Status: ${st.label}\n⏰ Previsão: ${d.eta || "Em breve"}\n\nMotorista: ${d.driver_name} (${d.driver_phone})`;
    window.open(`https://wa.me/55${(d.client_phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handleAdvance = (id: string) => {
    const delivery = deliveries.find(d => d.id === id);
    advanceStatus(id);
    // Auto WhatsApp notification
    if (delivery && delivery.client_phone) {
      const order = ["em_separacao", "em_rota", "proximo", "entregue"];
      const nextIdx = order.indexOf(delivery.status) + 1;
      if (nextIdx < order.length) {
        const nextLabel = statusConfig[order[nextIdx] as keyof typeof statusConfig]?.label;
        const msg = `Olá ${delivery.client_name.split(" ")[0]}! 🚚\n\nAtualização da sua entrega:\n📍 Novo status: ${nextLabel}\n⏰ Previsão: ${delivery.eta || "Em breve"}`;
        window.open(`https://wa.me/55${delivery.client_phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
      }
    }
  };

  const active = deliveries.filter(d => d.status !== "entregue");
  const completed = deliveries.filter(d => d.status === "entregue");

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Navigation className="w-6 h-6 text-primary" /> Rastreio de Entregas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Acompanhamento em tempo real com notificação automática via WhatsApp</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Nova Entrega</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Entrega</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Pedido</Label><Input placeholder="PED-XXXX" value={form.order_id} onChange={e => setForm(f => ({ ...f, order_id: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cliente</Label><Input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} /></div>
                <div><Label>Telefone</Label><Input value={form.client_phone} onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))} /></div>
              </div>
              <div><Label>Endereço</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Motorista</Label><Input value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} /></div>
                <div><Label>Tel Motorista</Label><Input value={form.driver_phone} onChange={e => setForm(f => ({ ...f, driver_phone: e.target.value }))} /></div>
              </div>
              <div><Label>Previsão (ETA)</Label><Input placeholder="14:30" value={form.eta} onChange={e => setForm(f => ({ ...f, eta: e.target.value }))} /></div>
              <Button onClick={handleCreate} className="w-full">Criar Rastreio</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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

      {active.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-lg">🚚 Em Andamento</h2>
          {active.map(delivery => {
            const { label, color } = statusConfig[delivery.status as keyof typeof statusConfig] || statusConfig.em_separacao;
            return (
              <Card key={delivery.id}>
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-bold">{delivery.tracking_code?.toUpperCase()}</span>
                        <Badge variant="outline" className={color}>{label}</Badge>
                        {delivery.eta && <Badge variant="outline" className="text-xs">ETA: {delivery.eta}</Badge>}
                      </div>
                      <h3 className="font-semibold">{delivery.client_name}</h3>
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{delivery.address}</p>
                      {delivery.driver_name && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Truck className="w-3 h-3" />Motorista: {delivery.driver_name}</p>}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => sendTrackingWhatsApp(delivery)} className="gap-1 text-[#25D366]">📱 WhatsApp</Button>
                      {delivery.driver_phone && <Button variant="outline" size="sm" onClick={() => window.open(`tel:${delivery.driver_phone}`, "_self")}><Phone className="w-3.5 h-3.5" /></Button>}
                      <Button size="sm" onClick={() => handleAdvance(delivery.id)}>Avançar Status</Button>
                    </div>
                  </div>

                  {(delivery.timeline as any[])?.length > 0 && (
                    <div className="relative pl-6 space-y-3">
                      {(delivery.timeline as any[]).map((event: any, i: number) => (
                        <div key={i} className="flex items-start gap-3 relative">
                          <div className={`absolute left-[-18px] w-3 h-3 rounded-full border-2 ${event.done ? "bg-primary border-primary" : "bg-background border-muted-foreground/30"}`} />
                          {i < (delivery.timeline as any[]).length - 1 && <div className={`absolute left-[-13px] top-4 w-0.5 h-6 ${event.done ? "bg-primary/30" : "bg-muted-foreground/15"}`} />}
                          <div className="flex-1">
                            <p className={`text-sm ${event.done ? "font-medium" : "text-muted-foreground"}`}>{event.event}</p>
                            <p className="text-[10px] text-muted-foreground">{event.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">✅ Concluídas</h2>
          {completed.map(d => (
            <Card key={d.id} className="opacity-75">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="font-medium text-sm">{d.client_name} — {d.order_id}</p>
                    <p className="text-xs text-muted-foreground">{d.address}</p>
                  </div>
                </div>
                <Badge className="bg-emerald-500">Entregue</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {deliveries.length === 0 && <p className="text-center text-muted-foreground py-20">Nenhuma entrega cadastrada</p>}
    </div>
  );
}
