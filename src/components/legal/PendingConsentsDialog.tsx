import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface PendingDoc {
  document_id: string;
  kind: string;
  version: string;
  title: string;
  summary?: string | null;
  published_at: string;
}

const KIND_LINKS: Record<string, string> = {
  terms: "/termos",
  privacy: "/privacidade",
  contract_saas: "/contrato-saas",
  fiscal_terms: "/termos-fiscais",
};

export function PendingConsentsDialog() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchPending = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_pending_consents");
      if (error) throw error;
      const list = (data as PendingDoc[] | null) ?? [];
      setDocs(list);
      setOpen(list.length > 0);
    } catch (err) {
      console.warn("[PendingConsentsDialog] fetch failed:", err);
      setDocs([]);
      setOpen(false);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

  const allChecked = docs.length > 0 && docs.every((d) => accepted[d.document_id]);

  const handleAcceptAll = async () => {
    if (!allChecked) return;
    setSubmitting(true);
    try {
      let ip: string | null = null;
      try {
        const res = await fetch("https://api.ipify.org?format=json");
        const json = await res.json();
        ip = json.ip ?? null;
      } catch { /* ignore */ }

      for (const d of docs) {
        const { error } = await supabase.rpc("accept_legal_document", {
          p_document_id: d.document_id,
          p_ip: ip,
          p_user_agent: navigator.userAgent,
        });
        if (error) throw error;
      }

      toast.success("Obrigado! Seus consentimentos foram registrados.");
      setOpen(false);
      setDocs([]);
      setAccepted({});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao registrar consentimento";
      toast.error(msg);
    }
    setSubmitting(false);
  };

  if (!user || docs.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !allChecked) return; setOpen(v); }}>
      <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Atualizamos nossos documentos
          </DialogTitle>
          <DialogDescription>
            Para continuar usando o sistema, revise e aceite as novas versões abaixo.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((d) => (
              <div key={d.document_id} className="flex items-start gap-3 rounded border p-3">
                <Checkbox
                  id={`c-${d.document_id}`}
                  checked={!!accepted[d.document_id]}
                  onCheckedChange={(v) =>
                    setAccepted((prev) => ({ ...prev, [d.document_id]: v === true }))
                  }
                />
                <label htmlFor={`c-${d.document_id}`} className="flex-1 text-sm cursor-pointer space-y-1">
                  <div className="font-medium">
                    {d.title}{" "}
                    <span className="text-xs text-muted-foreground font-normal">v{d.version}</span>
                  </div>
                  {d.summary && (
                    <p className="text-xs text-muted-foreground">{d.summary}</p>
                  )}
                  {KIND_LINKS[d.kind] && (
                    <Link
                      to={KIND_LINKS[d.kind]}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Ler documento →
                    </Link>
                  )}
                </label>
              </div>
            ))}
          </div>
        )}

        <Button onClick={handleAcceptAll} disabled={!allChecked || submitting} className="w-full">
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Li e aceito todos os documentos
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default PendingConsentsDialog;
