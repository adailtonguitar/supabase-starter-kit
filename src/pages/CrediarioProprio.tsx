import { useState } from "react";
import { BadgeDollarSign, TrendingUp, AlertTriangle, Users, Plus, Search, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface CreditClient {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  score: number;
  limit: number;
  used: number;
  installments: CreditInstallment[];
  status: "ativo" | "bloqueado" | "inadimplente";
}

interface CreditInstallment {
  id: string;
  orderId: string;
  number: string;
  value: number;
  dueDate: string;
  paid: boolean;
  paidDate?: string;
}

const mockClients: CreditClient[] = [
  {
    id: "1", name: "Maria Silva", cpf: "123.456.789-00", phone: "(11) 99999-1234",
    score: 850, limit: 5000, used: 2150, status: "ativo",
    installments: [
      { id: "i1", orderId: "PED-1042", number: "1/4", value: 537.50, dueDate: "2026-02-15", paid: true, paidDate: "2026-02-14" },
      { id: "i2", orderId: "PED-1042", number: "2/4", value: 537.50, dueDate: "2026-03-15", paid: false },
      { id: "i3", orderId: "PED-1042", number: "3/4", value: 537.50, dueDate: "2026-04-15", paid: false },
      { id: "i4", orderId: "PED-1042", number: "4/4", value: 537.50, dueDate: "2026-05-15", paid: false },
    ],
  },
  {
    id: "2", name: "João Santos", cpf: "987.654.321-00", phone: "(11) 98888-5678",
    score: 520, limit: 2000, used: 1800, status: "inadimplente",
    installments: [
      { id: "i5", orderId: "PED-980", number: "3/6", value: 300, dueDate: "2026-02-01", paid: false },
      { id: "i6", orderId: "PED-980", number: "4/6", value: 300, dueDate: "2026-03-01", paid: false },
    ],
  },
];

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
  const [clients, setClients] = useState<CreditClient[]>(mockClients);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.cpf.includes(search));

  const totalLimite = clients.reduce((a, c) => a + c.limit, 0);
  const totalUsado = clients.reduce((a, c) => a + c.used, 0);
  const inadimplentes = clients.filter(c => c.status === "inadimplente").length;
  const overdue = clients.flatMap(c => c.installments).filter(i => !i.paid && new Date(i.dueDate) < new Date()).length;

  const markPaid = (clientId: string, installmentId: string) => {
    setClients(prev => prev.map(c => c.id === clientId ? {
      ...c,
      installments: c.installments.map(i => i.id === installmentId ? { ...i, paid: true, paidDate: new Date().toISOString().split("T")[0] } : i),
    } : c));
    toast.success("Parcela marcada como paga!");
  };

  const sendWhatsAppReminder = (client: CreditClient) => {
    const overdue = client.installments.filter(i => !i.paid && new Date(i.dueDate) < new Date());
    const msg = `Olá ${client.name.split(" ")[0]}! 😊\n\nIdentificamos ${overdue.length} parcela(s) em atraso.\nPor favor, regularize para manter seu crédito ativo.\n\nDúvidas? Responda esta mensagem.`;
    window.open(`https://wa.me/55${client.phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BadgeDollarSign className="w-6 h-6 text-primary" /> Crediário Próprio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Score interno, carnês, limites e cobrança automatizada via WhatsApp</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center"><Users className="w-5 h-5 text-primary mx-auto mb-1" /><p className="text-2xl font-bold">{clients.length}</p><p className="text-xs text-muted-foreground">Clientes</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" /><p className="text-2xl font-bold">R$ {(totalUsado / 1000).toFixed(1)}k</p><p className="text-xs text-muted-foreground">Crédito Utilizado</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-1" /><p className="text-2xl font-bold">{inadimplentes}</p><p className="text-xs text-muted-foreground">Inadimplentes</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><Clock className="w-5 h-5 text-destructive mx-auto mb-1" /><p className="text-2xl font-bold">{overdue}</p><p className="text-xs text-muted-foreground">Parcelas Vencidas</p></CardContent></Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map(client => {
          const usagePercent = (client.used / client.limit) * 100;
          const statusColor = client.status === "ativo" ? "bg-emerald-500/10 text-emerald-600" : client.status === "inadimplente" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
          const overdueInstallments = client.installments.filter(i => !i.paid && new Date(i.dueDate) < new Date());

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
                        📱 Cobrar WhatsApp
                      </Button>
                    )}
                  </div>
                </div>

                {/* Limit bar */}
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Limite utilizado</span>
                    <span>R$ {client.used.toLocaleString("pt-BR")} / R$ {client.limit.toLocaleString("pt-BR")}</span>
                  </div>
                  <Progress value={usagePercent} className="h-2" />
                </div>

                {/* Installments */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {client.installments.map(inst => {
                    const isOverdue = !inst.paid && new Date(inst.dueDate) < new Date();
                    return (
                      <div key={inst.id} className={`flex items-center justify-between p-2 rounded-lg border text-sm ${isOverdue ? "border-destructive/40 bg-destructive/5" : inst.paid ? "border-emerald-500/20 bg-emerald-500/5" : "border-border"}`}>
                        <div>
                          <p className="font-medium text-xs">Parcela {inst.number}</p>
                          <p className="text-[10px] text-muted-foreground">Venc: {inst.dueDate}</p>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <span className="font-bold text-xs">R$ {inst.value.toFixed(2)}</span>
                          {inst.paid ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => markPaid(client.id, inst.id)}>Pagar</Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
