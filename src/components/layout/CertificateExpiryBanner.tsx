import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

/**
 * Banner de alerta in-app para certificado digital A1 próximo do vencimento.
 *
 * Complementa o e-mail de `notify-fiscal-certificate` para empresas que não
 * acompanham o inbox: cobre o risco de descobrir o vencimento somente na
 * primeira venda rejeitada pela SEFAZ.
 *
 * Faixas de exibição:
 *   • ≤ 0 dias (vencido):   destaque destructive, não-dispensável.
 *   • 1-7 dias:             destaque destructive, dispensável 24h.
 *   • 8-30 dias:            destaque warning, dispensável 24h.
 *   • > 30 dias:            não exibido.
 */

const DISMISS_KEY = "cert_expiry_banner_dismissed_at";
const DISMISS_WINDOW_MS = 24 * 60 * 60 * 1000;

interface FiscalConfigRow {
  certificate_expires_at: string | null;
  doc_type: string | null;
  certificate_type: string | null;
}

export function CertificateExpiryBanner() {
  const { companyId } = useCompany();
  const [row, setRow] = useState<FiscalConfigRow | null>(null);
  const [dismissedUntil, setDismissedUntil] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      return raw ? Number(raw) : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    if (!companyId) {
      setRow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("fiscal_configs")
        .select("certificate_expires_at, doc_type, certificate_type")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .eq("certificate_type", "A1")
        .not("certificate_expires_at", "is", null)
        .order("certificate_expires_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setRow((data as FiscalConfigRow) || null);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const status = useMemo(() => {
    if (!row?.certificate_expires_at) return null;
    const exp = new Date(row.certificate_expires_at).getTime();
    if (Number.isNaN(exp)) return null;
    const now = Date.now();
    const daysRemaining = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    if (daysRemaining > 30) return null;
    const expired = daysRemaining <= 0;
    const critical = daysRemaining <= 7;
    return { daysRemaining, expired, critical };
  }, [row]);

  if (!status) return null;

  const isDismissed = !status.expired && dismissedUntil > Date.now();
  if (isDismissed) return null;

  const handleDismiss = () => {
    const until = Date.now() + DISMISS_WINDOW_MS;
    try {
      localStorage.setItem(DISMISS_KEY, String(until));
    } catch {
      /* ignore */
    }
    setDismissedUntil(until);
  };

  const severity = status.expired || status.critical ? "destructive" : "warning";
  const bg = severity === "destructive" ? "bg-destructive/10" : "bg-warning/10";
  const border = severity === "destructive" ? "border-destructive/30" : "border-warning/30";
  const fg = severity === "destructive" ? "text-destructive" : "text-warning";

  const message = status.expired
    ? "Certificado digital A1 VENCIDO — a emissão de NF-e / NFC-e está bloqueada na SEFAZ."
    : `Certificado digital A1 vence em ${status.daysRemaining} dia${status.daysRemaining === 1 ? "" : "s"}.`;

  return (
    <div className={`border-b ${border} ${bg} px-4 py-2 shrink-0`}>
      <div className="flex items-center gap-3 max-w-7xl mx-auto">
        <ShieldAlert className={`w-4 h-4 ${fg} shrink-0`} />
        <p className={`text-xs sm:text-sm ${fg} flex-1 min-w-0`}>
          <strong>{message}</strong>{" "}
          <Link
            to="/configuracoes/fiscal"
            className="underline hover:no-underline font-medium"
          >
            Renovar agora
          </Link>
        </p>
        {!status.expired && (
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Ocultar aviso por 24 horas"
            className={`p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 ${fg}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
