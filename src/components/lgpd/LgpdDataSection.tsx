import { useCallback, useEffect, useState } from "react";
import { Download, Trash2, Shield, AlertTriangle, Loader2, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";
import { LEGAL_CONFIG } from "@/config/legal";

interface DeletionRequestRow {
  id: string;
  status: string;
  requested_at: string;
  processed_at: string | null;
  response_notes: string | null;
}

export function LgpdDataSection() {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeRequest, setActiveRequest] = useState<DeletionRequestRow | null>(null);
  const [loadingRequest, setLoadingRequest] = useState(true);

  const loadActiveRequest = useCallback(async () => {
    if (!user?.id) {
      setLoadingRequest(false);
      return;
    }
    try {
      const { data } = await supabase
        .from("data_subject_requests")
        .select("id, status, requested_at, processed_at, response_notes")
        .eq("user_id", user.id)
        .eq("type", "deletion")
        .in("status", ["pending", "in_progress"])
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setActiveRequest(data || null);
    } catch (err) {
      console.warn("[LgpdDataSection] load active request failed:", err);
    } finally {
      setLoadingRequest(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadActiveRequest();
  }, [loadActiveRequest]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const url = `${SUPABASE_URL}/functions/v1/export-my-data`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: "Falha ao exportar" }));
        throw new Error(errorBody.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `meus-dados-${user?.email || "usuario"}-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      toast.success("Exportação concluída. Seus dados foram baixados em JSON.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao exportar dados";
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteRequest = async () => {
    if (confirmEmail.trim().toLowerCase() !== (user?.email || "").toLowerCase()) {
      toast.error("O e-mail digitado não confere com o da sua conta.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-data-deletion", {
        body: { reason: deleteReason, confirm_email: confirmEmail.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(
        data?.message || "Pedido registrado. Você receberá um retorno em até 15 dias úteis.",
      );
      setDeleteOpen(false);
      setDeleteReason("");
      setConfirmEmail("");
      await loadActiveRequest();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao enviar pedido";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-primary" />
        <div>
          <h3 className="text-lg font-semibold">Meus dados pessoais (LGPD)</h3>
          <p className="text-xs text-muted-foreground">
            Direitos garantidos pela Lei nº 13.709/2018.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Download className="w-4 h-4 text-primary" />
            Exportar meus dados
          </div>
          <p className="text-xs text-muted-foreground">
            Baixe um arquivo JSON com todos os seus dados pessoais registrados no sistema
            (perfil, vínculos, consentimentos, pagamentos, histórico de ações).
          </p>
          <p className="text-[11px] text-muted-foreground">
            <FileText className="w-3 h-3 inline mr-1" />
            Art. 18, II e V — Acesso e portabilidade.
          </p>
          <Button onClick={handleExport} disabled={exporting} size="sm" className="w-full">
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Preparando…
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Baixar meus dados
              </>
            )}
          </Button>
        </div>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <Trash2 className="w-4 h-4" />
            Excluir meus dados
          </div>
          <p className="text-xs text-muted-foreground">
            Solicite a eliminação dos seus dados pessoais. O pedido é processado manualmente em
            até 15 dias úteis.
          </p>
          <p className="text-[11px] text-muted-foreground">
            <FileText className="w-3 h-3 inline mr-1" />
            Art. 18, VI — Eliminação.
          </p>

          {loadingRequest ? (
            <div className="h-9 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : activeRequest ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Pedido em andamento
              </div>
              <div className="text-muted-foreground">
                Protocolo: <code>{activeRequest.id.slice(0, 8)}</code>
                <br />
                Solicitado em{" "}
                {new Date(activeRequest.requested_at).toLocaleDateString("pt-BR")}.
              </div>
            </div>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Solicitar exclusão
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-foreground">Atenção:</strong> Dados sujeitos a obrigação legal
            de retenção (documentos fiscais como NF-e e NFC-e emitidas) serão conservados pelo prazo
            mínimo legal (5 anos) conforme exigência da legislação tributária. Sempre que possível,
            serão anonimizados.
          </div>
        </div>
        <div>
          Para outros direitos (retificação, informação sobre tratamento, portabilidade em outro
          formato, revogação de consentimentos específicos), entre em contato com nosso DPO:
          <a
            href={`mailto:${LEGAL_CONFIG.dpoEmail}`}
            className="text-primary hover:underline ml-1"
          >
            {LEGAL_CONFIG.dpoEmail}
          </a>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={(open) => !submitting && setDeleteOpen(open)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Solicitar exclusão dos meus dados
            </DialogTitle>
            <DialogDescription>
              Este pedido será registrado e processado pelo nosso time em até 15 dias úteis, conforme
              exige a LGPD (art. 18, VI).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-muted-foreground">
              <strong className="text-amber-700 dark:text-amber-400">Antes de confirmar:</strong>
              <ul className="mt-1 list-disc pl-4 space-y-1">
                <li>Se você for único administrador de uma empresa, precisará cancelar ou transferir a titularidade antes da exclusão.</li>
                <li>Documentos fiscais emitidos em seu nome não podem ser eliminados por obrigação legal.</li>
                <li>Considere antes <button type="button" className="underline text-primary" onClick={() => { setDeleteOpen(false); void handleExport(); }}>baixar uma cópia dos seus dados</button>.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Motivo (opcional)</Label>
              <Textarea
                id="reason"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Conte por que está solicitando. Isso ajuda a melhorarmos o serviço."
                maxLength={500}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm_email">
                Digite seu e-mail <span className="text-destructive">*</span>
              </Label>
              <Input
                id="confirm_email"
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={user?.email || ""}
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">
                Precisamos confirmar que é você mesmo fazendo o pedido.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRequest}
              disabled={submitting || !confirmEmail.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando…
                </>
              ) : (
                "Confirmar pedido de exclusão"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
