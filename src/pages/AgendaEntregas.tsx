import { useState, useMemo, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Truck, Plus, CalendarIcon, MapPin, Clock, Phone, CheckCircle, AlertCircle, Search, Camera, X, Image, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  driver: string;
  helper: string;
  photos: string[]; // base64 data URLs
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
    return JSON.parse(raw).map((d: any) => ({ ...d, scheduledDate: new Date(d.scheduledDate), driver: d.driver || "", helper: d.helper || "", photos: d.photos || [] }));
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
  const [photoDialog, setPhotoDialog] = useState<Delivery | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<Delivery | null>(null);
  const [confirmPhotos, setConfirmPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirmFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    clientName: "", phone: "", address: "", scheduledDate: new Date(),
    scheduledTime: "09:00", items: "", notes: "", needsAssembly: false,
    driver: "", helper: "",
  });

  const filtered = useMemo(() => {
    return deliveries.filter(d => {
      const matchSearch = !search || d.clientName.toLowerCase().includes(search.toLowerCase()) || d.address.toLowerCase().includes(search.toLowerCase()) || (d.driver || "").toLowerCase().includes(search.toLowerCase());
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
    setForm({ clientName: "", phone: "", address: "", scheduledDate: new Date(), scheduledTime: "09:00", items: "", notes: "", needsAssembly: false, driver: "", helper: "" });
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
        photos: [],
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
    if (status === "entregue") {
      const d = deliveries.find(x => x.id === id);
      if (d) {
        setConfirmDialog(d);
        setConfirmPhotos([]);
        return;
      }
    }
    const updated = deliveries.map(d => d.id === id ? { ...d, status } : d);
    setDeliveries(updated);
    saveDeliveries(updated);
    toast.success(`Status atualizado: ${statusConfig[status].label}`);
  };

  const handleConfirmDelivery = () => {
    if (!confirmDialog) return;
    const updated = deliveries.map(d =>
      d.id === confirmDialog.id ? { ...d, status: "entregue" as DeliveryStatus, photos: [...(d.photos || []), ...confirmPhotos] } : d
    );
    setDeliveries(updated);
    saveDeliveries(updated);
    setConfirmDialog(null);
    setConfirmPhotos([]);
    toast.success("Entrega confirmada com sucesso!");
  };

  const handlePhotoUpload = (files: FileList | null, target: "form" | "confirm") => {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (target === "confirm") {
          setConfirmPhotos(prev => [...prev, dataUrl]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleEdit = (d: Delivery) => {
    setForm({
      clientName: d.clientName, phone: d.phone, address: d.address,
      scheduledDate: d.scheduledDate, scheduledTime: d.scheduledTime,
      items: d.items, notes: d.notes, needsAssembly: d.needsAssembly,
      driver: d.driver || "", helper: d.helper || "",
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
          <p className="text-muted-foreground text-sm mt-1">Gerencie entregas, equipe e confirmações</p>
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
              <motion.div key={d.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
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
                          {d.photos && d.photos.length > 0 && (
                            <Badge variant="outline" className="text-[10px] cursor-pointer border-emerald-500/30 text-emerald-600" onClick={() => setPhotoDialog(d)}>
                              <Camera className="w-3 h-3 mr-1" /> {d.photos.length} foto{d.photos.length > 1 ? "s" : ""}
                            </Badge>
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
                        {(d.driver || d.helper) && (
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {d.driver && (
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" /> 🚛 {d.driver}
                              </span>
                            )}
                            {d.helper && (
                              <span className="flex items-center gap-1">👷 {d.helper}</span>
                            )}
                          </div>
                        )}
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
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
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

            {/* Team Assignment */}
            <div className="p-3 rounded-xl bg-muted/50 border border-border space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Equipe de Entrega
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Motorista</Label>
                  <Input value={form.driver} onChange={e => setForm({ ...form, driver: e.target.value })} placeholder="Nome do motorista" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Ajudante</Label>
                  <Input value={form.helper} onChange={e => setForm({ ...form, helper: e.target.value })} placeholder="Nome do ajudante" className="h-9" />
                </div>
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

      {/* Delivery Confirmation Dialog */}
      <AnimatePresence>
        {confirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDialog(null)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md mx-4 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-border">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  Confirmar Entrega
                </h2>
                <p className="text-xs text-muted-foreground mt-1">{confirmDialog.clientName} — {confirmDialog.address}</p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    📸 Fotos de Confirmação (opcional)
                  </p>
                  <p className="text-[10px] text-muted-foreground mb-3">
                    Registre fotos do móvel entregue no local do cliente
                  </p>

                  <input
                    ref={confirmFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    className="hidden"
                    onChange={e => handlePhotoUpload(e.target.files, "confirm")}
                  />

                  <div className="flex flex-wrap gap-2">
                    {confirmPhotos.map((photo, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border group">
                        <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => setConfirmPhotos(prev => prev.filter((_, j) => j !== i))}
                          className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => confirmFileRef.current?.click()}
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
                    >
                      <Camera className="w-5 h-5" />
                      <span className="text-[9px] mt-1">Adicionar</span>
                    </button>
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 border-t border-border flex gap-2">
                <Button variant="outline" onClick={() => setConfirmDialog(null)} className="flex-1">
                  Cancelar
                </Button>
                <Button onClick={handleConfirmDelivery} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirmar Entrega
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Photo Gallery Dialog */}
      <AnimatePresence>
        {photoDialog && photoDialog.photos && photoDialog.photos.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setPhotoDialog(null)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Image className="w-5 h-5 text-primary" /> Fotos da Entrega
                  </h2>
                  <p className="text-xs text-muted-foreground">{photoDialog.clientName}</p>
                </div>
                <button onClick={() => setPhotoDialog(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
                {photoDialog.photos.map((photo, i) => (
                  <div key={i} className="rounded-xl overflow-hidden border border-border">
                    <img src={photo} alt={`Entrega foto ${i + 1}`} className="w-full h-auto object-cover" />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
