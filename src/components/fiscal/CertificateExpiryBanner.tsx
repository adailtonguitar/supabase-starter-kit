import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";

interface CertAlert {
  company_id: string;
  expires_at: string | null;
  days_remaining: number | null;
  status: "ok" | "warning" | "critical" | "expired" | "missing";
}

export function CertificateExpiryBanner() {
  const { companyId } = useCompany();
  const [alert, setAlert] = useState<CertAlert | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_certificate_alerts", { p_days: 30 });
        if (cancelled || error) return;
        const list = (data as CertAlert[] | null) ?? [];
        const mine = list.find((a) => a.company_id === companyId);
        if (mine && mine.status !== "ok") setAlert(mine);
      } catch {
        /* silent */
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  if (!alert || dismissed) return null;

  const dateStr = alert.expires_at
    ? new Date(alert.expires_at).toLocaleDateString("pt-BR")
    : null;

  let title = "Certificado digital precisa de atenção";
  let msg = "Seu certificado A1 está cadastrado mas sem data de vencimento — revise em Configurações.";
  let tone: "destructive" | "default" = "default";

  if (alert.status === "expired") {
    title = "Certificado digital VENCIDO";
    msg = `O certificado venceu em ${dateStr}. A emissão fiscal está bloqueada. Renove e faça upload em Configurações.`;
    tone = "destructive";
  } else if (alert.status === "critical") {
    title = `Certificado vence em ${alert.days_remaining} dia(s)`;
    msg = `Renove antes de ${dateStr} para evitar interrupção na emissão de NF-e / NFC-e.`;
    tone = "destructive";
  } else if (alert.status === "warning") {
    title = `Certificado vence em ${alert.days_remaining} dias`;
    msg = `Planeje a renovação antes de ${dateStr}.`;
  } else if (alert.status === "missing") {
    title = "Certificado digital não cadastrado";
    msg = "Para emitir notas fiscais, cadastre seu certificado A1 em Configurações.";
  }

  return (
    <div className="px-3 sm:px-4 pt-3">
      <Alert variant={tone} className="pr-10">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          {msg}{" "}
          <Link to="/configuracoes" className="underline font-medium">
            Abrir Configurações
          </Link>
        </AlertDescription>
        <button
          type="button"
          className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setDismissed(true)}
          aria-label="Dispensar"
        >
          ✕
        </button>
      </Alert>
    </div>
  );
}

export default CertificateExpiryBanner;
