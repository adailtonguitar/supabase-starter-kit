import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeHtml } from "@/lib/sanitize";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Mail, Send, Loader2, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { logAction } from "@/services/ActionLogger";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeHtml } from "@/lib/sanitize";

export function AdminBulkEmail() {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);

  const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  const buildHtml = (content: string) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: #1a1a2e; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: #4ade80; margin: 0; font-size: 20px;">AnthoSystem</h1>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e2e8f0;">
        ${content.split("\n").map(line => line.trim() ? `<p style="margin: 0 0 12px;">${escapeHtml(line)}</p>` : "<br/>").join("")}
      </div>
      <div style="background: #1a1a2e; padding: 16px; text-align: center; border-radius: 0 0 8px 8px;">
        <p style="color: #64748b; margin: 0; font-size: 11px;">AnthoSystem — Sistema de Gestão Comercial</p>
      </div>
    </div>
  `;

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Preencha o assunto e o corpo do e-mail");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-bulk-email", {
        body: { subject: subject.trim(), html_body: buildHtml(body) },
      });

      if (error) {
        const errMsg = typeof error === "object" && "message" in error ? error.message : "Erro ao enviar";
        toast.error(errMsg);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success(`E-mail enviado para ${data.sent} usuário(s)!${data.failed ? ` (${data.failed} falharam)` : ""}`);
      logAction({ companyId: "system", userId: user?.id, action: "E-mail em massa enviado", module: "admin", details: `Assunto: ${subject.trim()}, Enviados: ${data.sent}, Falhas: ${data.failed || 0}` });
      setSubject("");
      setBody("");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Mail className="h-4 w-4 text-primary" />
          Disparo de E-mail em Massa
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-4">
        <p className="text-sm text-muted-foreground">
          Envie um e-mail para todos os usuários cadastrados no sistema.
        </p>

        <div className="space-y-3">
          <Input
            placeholder="Assunto do e-mail"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <Textarea
            placeholder="Corpo do e-mail (texto simples, cada linha vira um parágrafo)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
          />
        </div>

        <div className="flex gap-3">
          <Dialog open={preview} onOpenChange={setPreview}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!body.trim()} className="gap-1.5">
                <Eye className="w-4 h-4" /> Preview
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Preview do E-mail</DialogTitle>
              </DialogHeader>
              <div className="border rounded-lg p-4 bg-muted/30">
                <p className="text-sm font-semibold mb-2">Assunto: {subject || "(vazio)"}</p>
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(buildHtml(body)) }} />
              </div>
            </DialogContent>
          </Dialog>

          <Button
            size="sm"
            onClick={handleSend}
            disabled={sending || !subject.trim() || !body.trim()}
            className="gap-1.5"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Enviando..." : "Enviar para todos"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
