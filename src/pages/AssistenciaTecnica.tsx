import { useState } from "react";
import { Wrench, Plus, Clock, CheckCircle2, AlertCircle, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTechnicalTickets, type TicketStatus, type TicketPriority } from "@/hooks/useTechnicalTickets";

const statusMap: Record<TicketStatus, { label: string; color: string; icon: any }> = {
  aberto: { label: "Aberto", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: AlertCircle },
  em_andamento: { label: "Em Andamento", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  aguardando_peca: { label: "Aguardando Peça", color: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: Clock },
  concluido: { label: "Concluído", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
};

const priorityColors: Record<TicketPriority, string> = {
  baixa: "bg-muted text-muted-foreground", media: "bg-blue-500/10 text-blue-600",
  alta: "bg-amber-500/10 text-amber-600", urgente: "bg-destructive/10 text-destructive",
};

export default function AssistenciaTecnica() {
  const { tickets, loading, create, updateStatus } = useTechnicalTickets();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("todos");
  const [form, setForm] = useState({ client_name: "", product: "", issue: "", priority: "media" as TicketPriority });

  const handleCreate = () => {
    if (!form.client_name || !form.product || !form.issue) { return; }
    create(form);
    setForm({ client_name: "", product: "", issue: "", priority: "media" });
    setDialogOpen(false);
  };

  const filtered = activeTab === "todos" ? tickets : tickets.filter(t => t.status === activeTab);
  const counts = {
    todos: tickets.length,
    aberto: tickets.filter(t => t.status === "aberto").length,
    em_andamento: tickets.filter(t => t.status === "em_andamento").length,
    aguardando_peca: tickets.filter(t => t.status === "aguardando_peca").length,
    concluido: tickets.filter(t => t.status === "concluido").length,
  };
  const isOverdue = (deadline: string) => deadline && new Date(deadline) < new Date();

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Wrench className="w-6 h-6 text-primary" /> Assistência Técnica
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão pós-venda: chamados, peças, SLA e histórico</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Novo Chamado</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Abrir Chamado Técnico</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Cliente</Label><Input placeholder="Nome do cliente" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} /></div>
              <div><Label>Produto</Label><Input placeholder="Produto com problema" value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} /></div>
              <div><Label>Problema</Label><Textarea placeholder="Descreva o defeito..." value={form.issue} onChange={e => setForm(f => ({ ...f, issue: e.target.value }))} /></div>
              <div><Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={(v: TicketPriority) => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} className="w-full">Abrir Chamado</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["aberto", "em_andamento", "aguardando_peca", "concluido"] as TicketStatus[]).map(s => {
          const { label, icon: Icon, color } = statusMap[s];
          return (
            <Card key={s} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab(s)}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${color}`}><Icon className="w-4 h-4" /></div>
                <div><p className="text-2xl font-bold">{counts[s]}</p><p className="text-xs text-muted-foreground">{label}</p></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="todos">Todos ({counts.todos})</TabsTrigger>
          <TabsTrigger value="aberto">Abertos</TabsTrigger>
          <TabsTrigger value="em_andamento">Em Andamento</TabsTrigger>
          <TabsTrigger value="concluido">Concluídos</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-3 mt-4">
          {filtered.map(ticket => {
            const { label, color, icon: StatusIcon } = statusMap[ticket.status];
            const overdue = ticket.status !== "concluido" && isOverdue(ticket.sla_deadline);
            return (
              <Card key={ticket.id} className={overdue ? "border-destructive/50" : ""}>
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_number}</span>
                        <Badge className={priorityColors[ticket.priority]} variant="outline">{ticket.priority.toUpperCase()}</Badge>
                        <Badge className={color} variant="outline"><StatusIcon className="w-3 h-3 mr-1" />{label}</Badge>
                        {overdue && <Badge variant="destructive" className="text-[10px]">SLA ESTOURADO</Badge>}
                      </div>
                      <h3 className="font-semibold text-sm">{ticket.client_name} — {ticket.product}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{ticket.issue}</p>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span>Aberto: {new Date(ticket.created_at).toLocaleDateString("pt-BR")}</span>
                        {ticket.sla_deadline && <span>SLA: {ticket.sla_deadline}</span>}
                      </div>
                      {(ticket.notes || []).length > 0 && (
                        <div className="mt-2 space-y-1">
                          {(ticket.notes as string[]).map((n, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                              <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" /><span>{n}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {ticket.status === "aberto" && <Button size="sm" variant="outline" onClick={() => updateStatus(ticket.id, "em_andamento")}>Iniciar</Button>}
                      {ticket.status === "em_andamento" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => updateStatus(ticket.id, "aguardando_peca")}>Aguardar Peça</Button>
                          <Button size="sm" onClick={() => updateStatus(ticket.id, "concluido")}>Concluir</Button>
                        </>
                      )}
                      {ticket.status === "aguardando_peca" && <Button size="sm" onClick={() => updateStatus(ticket.id, "em_andamento")}>Peça Chegou</Button>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && <p className="text-center text-muted-foreground py-10">Nenhum chamado encontrado</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
