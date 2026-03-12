import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bell, Send, Loader2, Trash2, Info, AlertTriangle, AlertCircle, Wrench } from "lucide-react";
import { adminQuery } from "@/lib/admin-query";
import { logAction } from "@/services/ActionLogger";
import { useAuth } from "@/hooks/useAuth";

const typeOptions = [
  { value: "info", label: "Informação", icon: Info, color: "text-primary" },
  { value: "warning", label: "Aviso", icon: AlertTriangle, color: "text-warning" },
  { value: "alert", label: "Alerta Urgente", icon: AlertCircle, color: "text-destructive" },
  { value: "maintenance", label: "Manutenção", icon: Wrench, color: "text-muted-foreground" },
];

interface CompanyOption {
  id: string;
  name: string;
}

interface SentNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  company_id: string | null;
  created_at: string;
}

export function AdminNotifications() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [companyId, setCompanyId] = useState<string>("all");
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SentNotification[]>([]);
  const [loadingSent, setLoadingSent] = useState(true);

  useEffect(() => {
    // Load companies for targeting
    const loadCompanies = async () => {
      const data = await adminQuery<CompanyOption>({
        table: "companies",
        select: "id, name",
        order: { column: "name", ascending: true },
        limit: 500,
      });
      setCompanies(data);
    };

    const loadSent = async () => {
      const data = await adminQuery<SentNotification>({
        table: "admin_notifications",
        select: "id, title, message, type, company_id, created_at",
        order: { column: "created_at", ascending: false },
        limit: 30,
      });
      setSent(data);
      setLoadingSent(false);
    };

    loadCompanies();
    loadSent();
  }, []);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Preencha título e mensagem");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("admin-action", {
        body: {
          action: "send_notification",
          title: title.trim(),
          message: message.trim(),
          type,
          company_id: companyId === "all" ? null : companyId,
        },
      });
      if (error) throw error;
      toast.success(companyId === "all" ? "Notificação enviada para todas as empresas!" : "Notificação enviada!");
      setTitle("");
      setMessage("");
      setType("info");
      setCompanyId("all");

      // Refresh sent list
      const data = await adminQuery<SentNotification>({
        table: "admin_notifications",
        select: "id, title, message, type, company_id, created_at",
        order: { column: "created_at", ascending: false },
        limit: 30,
      });
      setSent(data);
    } catch (err: any) {
      toast.error("Erro ao enviar: " + (err?.message || "erro desconhecido"));
    } finally {
      setSending(false);
    }
  };

  const companyName = (id: string | null) => {
    if (!id) return "Todas";
    return companies.find((c) => c.id === id)?.name || "—";
  };

  const typeBadge = (t: string) => {
    const opt = typeOptions.find((o) => o.value === t);
    if (!opt) return <Badge variant="outline">{t}</Badge>;
    return (
      <Badge variant="outline" className={`gap-1 ${opt.color}`}>
        <opt.icon className="w-3 h-3" /> {opt.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Send form */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Bell className="h-4 w-4 text-primary" />
            Enviar Notificação In-App
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-4">
          <p className="text-sm text-muted-foreground">
            Envie avisos diretamente na tela dos usuários. Eles verão um sino com contador no topo do sistema.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-2">
                        <o.icon className={`w-3.5 h-3.5 ${o.color}`} /> {o.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Destinatário</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">📢 Todas as empresas (broadcast)</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Manutenção programada amanhã"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descreva o aviso em detalhes..."
              maxLength={500}
              className="min-h-[100px]"
            />
          </div>

          <Button onClick={handleSend} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar Notificação
          </Button>
        </CardContent>
      </Card>

      {/* Sent history */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Notificações Enviadas</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          {loadingSent ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sent.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma notificação enviada ainda.</p>
          ) : (
            <div className="space-y-2">
              {sent.map((n) => (
                <div key={n.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{n.title}</span>
                      {typeBadge(n.type)}
                      <Badge variant="secondary" className="text-[10px]">
                        {companyName(n.company_id)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      {new Date(n.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
