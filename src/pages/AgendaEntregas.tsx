import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Truck, Plus, CalendarIcon, MapPin, Clock, Phone, CheckCircle, AlertCircle, Package, Search } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

type DeliveryStatus = "pendente" | "em_rota" | "entregue" | "cancelada";

interface Delivery {
  id: string;
  clientName: string;
  phone: string;
  address: string;
  scheduledDate: Date;
  scheduledTime: string;
  items: string;
  notes: string;
  status: DeliveryStatus;
  needsAssembly: boolean;
}

const statusConfig: Record<DeliveryStatus, { label: string; color: string; icon: any }> = {
  pendente: { label: "Pendente", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  em_rota: { label: "Em Rota", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Truck },
  entregue: { label: "Entregue", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle },
  cancelada: { label: "Cancelada", color: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertCircle },
};

const STORAGE_KEY = "as_furniture_deliveries";

function loadDeliveries(): Delivery[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((d: any) => ({ ...d, scheduledDate: new Date(d.scheduledDate) }));
  } catch { return []; }
}

function saveDeliveries(deliveries: Delivery[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deliveries));
}

export default function AgendaEntregas() {
  const [deliveries, setDeliveries] = useState<Delivery[]>(loadDeliveries);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    clientName: "", phone: "", address: "", scheduledDate: new Date(),
    scheduledTime: "09:00", items: "", notes: "", needsAssembly: false,
  });

  const filtered = useMemo(() => {
    return deliveries.filter(d => {
      const matchSearch = !search || d.clientName.toLowerCase().includes(search.toLowerCase()) || d.address.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || d.status === statusFilter;
      return matchSearch && matchStatus;
    }).sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  }, [deliveries, search, statusFilter]);

  const stats = useMemo(() => ({
    total: deliveries.length,
    pendente: deliveries.filter(d => d.status === "pendente").length,
    em_rota: deliveries.filter(d => d.status === "em_rota").length,
    entregue: deliveries.filter(d => d.status === "entregue").length,
  }), [deliveries]);

  const resetForm = () => {
    setForm({ clientName: "", phone: "", address: "", scheduledDate: new Date(), scheduledTime: "09:00", items: "", notes: "", needsAssembly: false });
    setEditingId(null);
  };

  const handleSave = () => {
    if (!form.clientName || !form.address) {
      toast.error("Preencha o nome do cliente e endereço");
      return;
    }
    let updated: Delivery[];
    if (editingId) {
      updated = deliveries.map(d => d.id === editingId ? { ...d, ...form } : d);
    } else {
      const newDelivery: Delivery = {
        id: crypto.randomUUID(),
        ...form,
        status: "pendente",
      };
      updated = [...deliveries, newDelivery];
    }
    setDeliveries(updated);
    saveDeliveries(updated);
    setShowDialog(false);
    resetForm();
    toast.success(editingId ? "Entrega atualizada!" : "Entrega agendada!");
  };

  const handleStatusChange = (id: string, status: DeliveryStatus) => {
    const updated = deliveries.map(d => d.id === id ? { ...d, status } : d);
    setDeliveries(updated);
    saveDeliveries(updated);
    toast.success(`Status atualizado: ${statusConfig[status].label}`);
  };

  const handleEdit = (d: Delivery) => {
    setForm({
      clientName: d.clientName, phone: d.phone, address: d.address,
      scheduledDate: d.scheduledDate, scheduledTime: d.scheduledTime,
      items: d.items, notes: d.notes, needsAssembly: d.needsAssembly,
    });
    setEditingId(d.id);
    setShowDialog(true);
  };

  const handleDelete = (id: string) => {
    const updated = deliveries.filter(d => d.id !== id);
    setDeliveries(updated);
    saveDeliveries(updated);
    toast.success("Entrega removida");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            Agenda de Entregas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie entregas e montagens agendadas</p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Entrega
        </Button>
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
          <Input placeholder="Buscar cliente ou endereço..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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

      {/* Deliveries List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma entrega encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d, i) => {
            const sc = statusConfig[d.status];
            const StatusIcon = sc.icon;
            return (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className="hover:border-primary/20 transition-all">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{d.clientName}</p>
                          <Badge variant="outline" className={cn("text-[10px]", sc.color)}>
                            <StatusIcon className="w-3 h-3 mr-1" /> {sc.label}
                          </Badge>
                          {d.needsAssembly && (
                            <Badge variant="secondary" className="text-[10px]">🔧 Montagem</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3" />
                            {format(d.scheduledDate, "dd/MM/yyyy", { locale: ptBR })} às {d.scheduledTime}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {d.address}
                          </span>
                          {d.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {d.phone}
                            </span>
                          )}
                        </div>
                        {d.items && <p className="text-xs text-muted-foreground">📦 {d.items}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Select value={d.status} onValueChange={(v) => handleStatusChange(d.id, v as DeliveryStatus)}>
                          <SelectTrigger className="w-[130px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(statusConfig).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(d)}>Editar</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(d.id)}>Excluir</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* New/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Entrega" : "Nova Entrega"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente *</Label>
              <Input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} placeholder="Nome do cliente" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <Label>Endereço *</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, bairro" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {format(form.scheduledDate, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={form.scheduledDate} onSelect={d => d && setForm({ ...form, scheduledDate: d })} className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Horário</Label>
                <Input type="time" value={form.scheduledTime} onChange={e => setForm({ ...form, scheduledTime: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Itens para entrega</Label>
              <Textarea value={form.items} onChange={e => setForm({ ...form, items: e.target.value })} placeholder="Ex: 1x Sofá 3 lugares, 2x Mesa lateral" rows={2} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Observações sobre a entrega" rows={2} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.needsAssembly} onChange={e => setForm({ ...form, needsAssembly: e.target.checked })} className="rounded border-border" />
              <span className="text-sm">Necessita montagem no local</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingId ? "Salvar" : "Agendar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
