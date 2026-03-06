import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Phone, MessageSquare, Mail, MapPin, Calendar, Check, SkipForward, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useFollowUps, useCreateFollowUp, useUpdateFollowUp, type FollowUp } from "@/hooks/useFollowUps";
import { useClients } from "@/hooks/useClients";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format, isToday, isPast, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const contactIcons: Record<string, any> = {
  whatsapp: MessageSquare, phone: Phone, email: Mail, visit: MapPin,
};
const contactLabels: Record<string, string> = {
  whatsapp: "WhatsApp", phone: "Telefone", email: "E-mail", visit: "Visita",
};
const statusColors: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600", done: "bg-primary/10 text-primary",
  skipped: "bg-muted text-muted-foreground", rescheduled: "bg-blue-500/10 text-blue-600",
};

export default function FollowUpPage() {
  const [tab, setTab] = useState("pending");
  const { data: followUps = [], isLoading } = useFollowUps(tab === "all" ? undefined : tab);
  const { data: clients = [] } = useClients();
  const createFollowUp = useCreateFollowUp();
  const updateFollowUp = useUpdateFollowUp();
  const [showForm, setShowForm] = useState(false);

  // Form
  const [clientId, setClientId] = useState("");
  const [contactType, setContactType] = useState("whatsapp");
  const [dueDate, setDueDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");

  const handleCreate = async () => {
    if (!clientId) { toast.error("Selecione um cliente"); return; }
    await createFollowUp.mutateAsync({
      client_id: clientId, contact_type: contactType as any,
      due_date: dueDate, notes: notes || undefined,
    });
    setShowForm(false);
    setClientId(""); setNotes("");
  };

  const markDone = (id: string) => updateFollowUp.mutate({ id, status: "done", completed_at: new Date().toISOString() });
  const markSkipped = (id: string) => updateFollowUp.mutate({ id, status: "skipped" });

  const getDueDateLabel = (date: string) => {
    const d = new Date(date + "T12:00:00");
    if (isToday(d)) return "Hoje";
    if (isTomorrow(d)) return "Amanhã";
    if (isPast(d)) return "Atrasado";
    return format(d, "dd/MM", { locale: ptBR });
  };

  const getDueDateStyle = (date: string) => {
    const d = new Date(date + "T12:00:00");
    if (isPast(d) && !isToday(d)) return "text-destructive font-bold";
    if (isToday(d)) return "text-primary font-bold";
    return "text-muted-foreground";
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Follow-up Comercial</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Acompanhe orçamentos e contatos pendentes</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Novo Follow-up
        </Button>
      </motion.div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="done">Concluídos</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl mb-2" />)
          ) : followUps.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Nenhum follow-up {tab === "pending" ? "pendente" : "encontrado"}.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {followUps.map((fu) => {
                const Icon = contactIcons[fu.contact_type] || Phone;
                return (
                  <motion.div key={fu.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="bg-card rounded-xl border border-border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
                    <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-accent-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{fu.client?.name || "Cliente"}</p>
                      <p className="text-xs text-muted-foreground">{contactLabels[fu.contact_type]} • {fu.notes || "Sem observação"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${getDueDateStyle(fu.due_date)}`}>
                        <Clock className="w-3 h-3 inline mr-0.5" />
                        {getDueDateLabel(fu.due_date)}
                      </span>
                      <Badge variant="secondary" className={statusColors[fu.status]}>{fu.status}</Badge>
                      {fu.status === "pending" && (
                        <div className="flex gap-1">
                          <button onClick={() => markDone(fu.id)} className="p-1.5 rounded-lg text-primary hover:bg-primary/10" title="Concluir">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => markSkipped(fu.id)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted" title="Pular">
                            <SkipForward className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Follow-up</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Contato</Label>
                <Select value={contactType} onValueChange={setContactType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="visit">Visita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea placeholder="Ex: Cliente demonstrou interesse no combo cozinha..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={createFollowUp.isPending}>Agendar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
