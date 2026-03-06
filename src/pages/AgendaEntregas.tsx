import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Truck, Plus, MapPin, Clock, Phone, CheckCircle, Search, LayoutGrid, List, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useDeliveryTracking, DeliveryTrack } from "@/hooks/useDeliveryTracking";

type ViewStatus = DeliveryTrack["status"];

const statusConfig: Record<ViewStatus, { label: string; color: string; icon: any }> = {
  em_separacao: { label: "Pendente", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  em_rota: { label: "Em Rota", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Truck },
  proximo: { label: "Próximo", color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: MapPin },
  entregue: { label: "Entregue", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle },
};

export default function AgendaEntregas() {
  const { deliveries, loading, create, advanceStatus } = useDeliveryTracking();
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    client_name: "", client_phone: "", address: "",
    driver_name: "", driver_phone: "", eta: "", order_id: "",
  });

  const filtered = useMemo(() => {
    return deliveries.filter(d => {
      const matchSearch = !search ||
        d.client_name.toLowerCase().includes(search.toLowerCase()) ||
        d.address.toLowerCase().includes(search.toLowerCase()) ||
        (d.driver_name || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || d.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [deliveries, search, statusFilter]);

  const stats = useMemo(() => ({
    total: deliveries.length,
    pendente: deliveries.filter(d => d.status === "em_separacao").length,
    em_rota: deliveries.filter(d => d.status === "em_rota").length,
    entregue: deliveries.filter(d => d.status === "entregue").length,
  }), [deliveries]);

  const resetForm = () => {
    setForm({ client_name: "", client_phone: "", address: "", driver_name: "", driver_phone: "", eta: "", order_id: "" });
  };

  const handleSave = async () => {
    if (!form.client_name || !form.address) {
      toast.error("Preencha o nome do cliente e endereço");
      return;
    }
    setSaving(true);
    await create(form);
    setSaving(false);
    setShowDialog(false);
    resetForm();
  };

  const handleAdvance = async (id: string) => {
    await advanceStatus(id);
  };

  const renderDeliveryCard = (d: DeliveryTrack, i: number) => {
    const sc = statusConfig[d.status];
    const StatusIcon = sc.icon;
    return (
      <motion.div key={d.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
        <Card className="hover:border-primary/20 transition-all">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold">{d.client_name}</p>
                  <Badge variant="outline" className={cn("text-[10px]", sc.color)}>
                    <StatusIcon className="w-3 h-3 mr-1" /> {sc.label}
                  </Badge>
                  {d.tracking_code && (
                    <Badge variant="secondary" className="text-[10px] font-mono">#{d.tracking_code}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {d.address}
                  </span>
                  {d.client_phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {d.client_phone}
                    </span>
                  )}
                  {d.eta && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> ETA: {d.eta}</span>}
                </div>
                {d.driver_name && (
                  <p className="text-xs text-muted-foreground">🚛 {d.driver_name} {d.driver_phone ? `(${d.driver_phone})` : ""}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {d.status !== "entregue" && (
                  <Button size="sm" onClick={() => handleAdvance(d.id)}>
                    Avançar Status
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            Agenda de Entregas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie entregas e rastreamento</p>
        </div>
        <div className="flex gap-2">
          <Button variant={viewMode === "list" ? "default" : "outline"} size="icon" onClick={() => setViewMode("list")}><List className="w-4 h-4" /></Button>
          <Button variant={viewMode === "kanban" ? "default" : "outline"} size="icon" onClick={() => setViewMode("kanban")}><LayoutGrid className="w-4 h-4" /></Button>
          <Button onClick={() => { resetForm(); setShowDialog(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Nova Entrega
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-foreground" },
          { label: "Pendentes", value: stats.pendente, color: "text-amber-600" },
          { label: "Em Rota", value: stats.em_rota, color: "text-blue-600" },
          { label: "Entregues", value: stats.entregue, color: "text-emerald-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">{s.label}</p>
              <p className={cn("text-2xl font-bold mt-1", s.color)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente, endereço ou entregador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(statusConfig).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kanban View */}
      {viewMode === "kanban" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(["em_separacao", "em_rota", "proximo", "entregue"] as ViewStatus[]).map(status => {
            const sc = statusConfig[status];
            const StatusIcon = sc.icon;
            const items = filtered.filter(d => d.status === status);
            return (
              <div key={status} className="space-y-2">
                <div className={cn("flex items-center gap-2 p-2 rounded-lg border", sc.color)}>
                  <StatusIcon className="w-4 h-4" />
                  <span className="text-sm font-semibold">{sc.label}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">{items.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {items.map(d => (
                    <Card key={d.id} className="cursor-pointer hover:border-primary/20 transition-all">
                      <CardContent className="p-3 space-y-1">
                        <p className="text-sm font-semibold">{d.client_name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {d.address.substring(0, 30)}...
                        </p>
                        {d.driver_name && <p className="text-[10px] text-muted-foreground">🚛 {d.driver_name}</p>}
                        {d.status !== "entregue" && (
                          <Button size="sm" variant="outline" className="w-full mt-1 text-xs h-7" onClick={() => handleAdvance(d.id)}>
                            Avançar
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {items.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4 opacity-50">Nenhuma entrega</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma entrega encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d, i) => renderDeliveryCard(d, i))}
        </div>
      )}

      {/* New Delivery Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Entrega</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            <div>
              <Label>Cliente *</Label>
              <Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} placeholder="Nome do cliente" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.client_phone} onChange={e => setForm({ ...form, client_phone: e.target.value })} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <Label>Endereço *</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, bairro" />
            </div>
            <div>
              <Label>Nº do Pedido</Label>
              <Input value={form.order_id} onChange={e => setForm({ ...form, order_id: e.target.value })} placeholder="Referência do pedido" />
            </div>
            <div>
              <Label>Previsão (ETA)</Label>
              <Input value={form.eta} onChange={e => setForm({ ...form, eta: e.target.value })} placeholder="Ex: 14:00 - 16:00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Motorista</Label>
                <Input value={form.driver_name} onChange={e => setForm({ ...form, driver_name: e.target.value })} placeholder="Nome" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Tel. Motorista</Label>
                <Input value={form.driver_phone} onChange={e => setForm({ ...form, driver_phone: e.target.value })} placeholder="(00) 00000-0000" className="h-9" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
