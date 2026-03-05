import { useState, useMemo } from "react";
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
import { Wrench, Plus, CalendarIcon, Clock, User, CheckCircle, AlertCircle, Search, Hammer } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

type AssemblyStatus = "agendada" | "em_andamento" | "concluida" | "reagendada" | "cancelada";

interface Assembly {
  id: string;
  clientName: string;
  address: string;
  phone: string;
  assembler: string;
  scheduledDate: Date;
  scheduledTime: string;
  items: string;
  notes: string;
  status: AssemblyStatus;
}

const statusConfig: Record<AssemblyStatus, { label: string; color: string }> = {
  agendada: { label: "Agendada", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  em_andamento: { label: "Em Andamento", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  concluida: { label: "Concluída", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  reagendada: { label: "Reagendada", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  cancelada: { label: "Cancelada", color: "bg-destructive/10 text-destructive border-destructive/20" },
};

const STORAGE_KEY = "as_furniture_assemblies";

function loadAssemblies(): Assembly[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((a: any) => ({ ...a, scheduledDate: new Date(a.scheduledDate) }));
  } catch { return []; }
}

function saveAssemblies(assemblies: Assembly[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assemblies));
}

export default function ControleMontagem() {
  const [assemblies, setAssemblies] = useState<Assembly[]>(loadAssemblies);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientName: "", address: "", phone: "", assembler: "",
    scheduledDate: new Date(), scheduledTime: "08:00", items: "", notes: "",
  });

  const filtered = useMemo(() => {
    return assemblies.filter(a => {
      const matchSearch = !search || a.clientName.toLowerCase().includes(search.toLowerCase()) || a.assembler.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || a.status === statusFilter;
      return matchSearch && matchStatus;
    }).sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  }, [assemblies, search, statusFilter]);

  const stats = useMemo(() => ({
    total: assemblies.length,
    agendada: assemblies.filter(a => a.status === "agendada").length,
    em_andamento: assemblies.filter(a => a.status === "em_andamento").length,
    concluida: assemblies.filter(a => a.status === "concluida").length,
  }), [assemblies]);

  const resetForm = () => {
    setForm({ clientName: "", address: "", phone: "", assembler: "", scheduledDate: new Date(), scheduledTime: "08:00", items: "", notes: "" });
    setEditingId(null);
  };

  const handleSave = () => {
    if (!form.clientName || !form.address) {
      toast.error("Preencha o nome do cliente e endereço");
      return;
    }
    let updated: Assembly[];
    if (editingId) {
      updated = assemblies.map(a => a.id === editingId ? { ...a, ...form } : a);
    } else {
      updated = [...assemblies, { id: crypto.randomUUID(), ...form, status: "agendada" as AssemblyStatus }];
    }
    setAssemblies(updated);
    saveAssemblies(updated);
    setShowDialog(false);
    resetForm();
    toast.success(editingId ? "Montagem atualizada!" : "Montagem agendada!");
  };

  const handleStatusChange = (id: string, status: AssemblyStatus) => {
    const updated = assemblies.map(a => a.id === id ? { ...a, status } : a);
    setAssemblies(updated);
    saveAssemblies(updated);
    toast.success(`Status: ${statusConfig[status].label}`);
  };

  const handleEdit = (a: Assembly) => {
    setForm({
      clientName: a.clientName, address: a.address, phone: a.phone,
      assembler: a.assembler, scheduledDate: a.scheduledDate,
      scheduledTime: a.scheduledTime, items: a.items, notes: a.notes,
    });
    setEditingId(a.id);
    setShowDialog(true);
  };

  const handleDelete = (id: string) => {
    const updated = assemblies.filter(a => a.id !== id);
    setAssemblies(updated);
    saveAssemblies(updated);
    toast.success("Montagem removida");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wrench className="w-6 h-6 text-primary" />
            Controle de Montagem
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie ordens de montagem e assistência técnica</p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Montagem
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-foreground" },
          { label: "Agendadas", value: stats.agendada, color: "text-amber-600" },
          { label: "Em Andamento", value: stats.em_andamento, color: "text-blue-600" },
          { label: "Concluídas", value: stats.concluida, color: "text-emerald-600" },
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
          <Input placeholder="Buscar cliente ou montador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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

      {/* Assembly List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Hammer className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma montagem encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a, i) => {
            const sc = statusConfig[a.status];
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className="hover:border-primary/20 transition-all">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{a.clientName}</p>
                          <Badge variant="outline" className={cn("text-[10px]", sc.color)}>
                            {sc.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3" />
                            {format(a.scheduledDate, "dd/MM/yyyy", { locale: ptBR })} às {a.scheduledTime}
                          </span>
                          {a.assembler && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" /> {a.assembler}
                            </span>
                          )}
                        </div>
                        {a.items && <p className="text-xs text-muted-foreground">🪑 {a.items}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Select value={a.status} onValueChange={(v) => handleStatusChange(a.id, v as AssemblyStatus)}>
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(statusConfig).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(a)}>Editar</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(a.id)}>Excluir</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Montagem" : "Nova Montagem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente *</Label>
              <Input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} placeholder="Nome do cliente" />
            </div>
            <div>
              <Label>Endereço *</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Endereço de montagem" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" />
              </div>
              <div>
                <Label>Montador</Label>
                <Input value={form.assembler} onChange={e => setForm({ ...form, assembler: e.target.value })} placeholder="Nome do montador" />
              </div>
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
              <Label>Itens para montar</Label>
              <Textarea value={form.items} onChange={e => setForm({ ...form, items: e.target.value })} placeholder="Ex: Guarda-roupa 6 portas, Cama box casal" rows={2} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Detalhes adicionais" rows={2} />
            </div>
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
