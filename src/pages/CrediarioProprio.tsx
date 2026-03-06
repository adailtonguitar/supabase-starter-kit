import { useState } from "react";
import { BadgeDollarSign, TrendingUp, AlertTriangle, Users, Plus, Search, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCreditSystem } from "@/hooks/useCreditSystem";

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 700 ? "text-emerald-500" : score >= 400 ? "text-amber-500" : "text-destructive";
  const label = score >= 700 ? "Excelente" : score >= 400 ? "Regular" : "Ruim";
  return (
    <div className="flex items-center gap-2">
      <div className={`text-2xl font-bold ${color}`}>{score}</div>
      <div className="text-xs text-muted-foreground">
        <p className={`font-semibold ${color}`}>{label}</p>
        <p>Score Interno</p>
      </div>
    </div>
  );
}

export default function CrediarioProprio() {
  const { clients, loading, createClient, markPaid } = useCreditSystem();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", cpf: "", phone: "", credit_limit: 2000 });

  const filtered = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.cpf || "").includes(search));

  const totalUsado = clients.reduce((a, c) => a + Number(c.credit_used || 0), 0);
  const inadimplentes = clients.filter(c => c.status === "inadimplente").length;
  const overdue = clients.flatMap(c => c.installments).filter(i => !i.paid && new Date(i.due_date) < new Date()).length;

  const handleCreate = () => {
    if (!form.name) return;
    createClient(form as any);
    setForm({ name: "", cpf: "", phone: "", credit_limit: 2000 });
    setDialogOpen(false);
  };

  const sendWhatsAppReminder = (client: typeof clients[0]) => {
    const overdueInst = client.installments.filter(i => !i.paid && new Date(i.due_date) < new Date());
    const msg = `Olá ${client.name.split(" ")[0]}! 😊\n\nIdentificamos ${overdueInst.length} parcela(s) em atraso.\nPor favor, regularize para manter seu crédito ativo.\n\nDúvidas? Responda esta mensagem.`;
    window.open(`https://wa.me/55${(client.phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BadgeDollarSign className="w-6 h-6 text-primary" /> Crediário Próprio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Score interno, carnês, limites e cobrança automatizada via WhatsApp</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Novo Cliente</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Cliente de Crédito</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} /></div>
              <div><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label>Limite de Crédito (R$)</Label><Input type="number" value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: +e.target.value }))} /></div>
              <Button onClick={handleCreate} className="w-full">Criar Cliente</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center"><Users className="w-5 h-5 text-primary mx-auto mb-1" /><p className="text-2xl font-bold">{clients.length}</p><p className="text-xs text-muted-foreground">Clientes</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" /><p className="text-2xl font-bold">R$ {(totalUsado / 1000).toFixed(1)}k</p><p className="text-xs text-muted-foreground">Crédito Utilizado</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-1" /><p className="text-2xl font-bold">{inadimplentes}</p><p className="text-xs text-muted-foreground">Inadimplentes</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><Clock className="w-5 h-5 text-destructive mx-auto mb-1" /><p className="text-2xl font-bold">{overdue}</p><p className="text-xs text-muted-foreground">Parcelas Vencidas</p></CardContent></Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="space-y-4">
        {filtered.map(client => {
          const limit = Number(client.credit_limit) || 1;
          const used = Number(client.credit_used) || 0;
          const usagePercent = (used / limit) * 100;
          const statusColor = client.status === "ativo" ? "bg-emerald-500/10 text-emerald-600" : client.status === "inadimplente" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
          const overdueInstallments = client.installments.filter(i => !i.paid && new Date(i.due_date) < new Date());

          return (
            <Card key={client.id}>
              <CardContent className="p-4 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold">
                      {client.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{client.name}</h3>
                        <Badge variant="outline" className={statusColor}>{client.status.toUpperCase()}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{client.cpf} • {client.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <ScoreGauge score={client.score} />
                    {overdueInstallments.length > 0 && (
                      <Button variant="outline" size="sm" onClick={() => sendWhatsAppReminder(client)} className="gap-1 text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10">
                        📱 Cobrar
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Limite utilizado</span>
                    <span>R$ {used.toLocaleString("pt-BR")} / R$ {limit.toLocaleString("pt-BR")}</span>
                  </div>
                  <Progress value={Math.min(usagePercent, 100)} className="h-2" />
                </div>

                {client.installments.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {client.installments.map(inst => {
                      const isOv = !inst.paid && new Date(inst.due_date) < new Date();
                      return (
                        <div key={inst.id} className={`flex items-center justify-between p-2 rounded-lg border text-sm ${isOv ? "border-destructive/40 bg-destructive/5" : inst.paid ? "border-emerald-500/20 bg-emerald-500/5" : "border-border"}`}>
                          <div>
                            <p className="font-medium text-xs">Parcela {inst.installment_number}</p>
                            <p className="text-[10px] text-muted-foreground">Venc: {inst.due_date}</p>
                          </div>
                          <div className="text-right flex items-center gap-2">
                            <span className="font-bold text-xs">R$ {Number(inst.value).toFixed(2)}</span>
                            {inst.paid ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => markPaid(inst.id)}>Pagar</Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-10">Nenhum cliente de crédito cadastrado</p>}
      </div>
    </div>
  );
}
