import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FiscalEmissionService } from "@/services/FiscalEmissionService";
import { toast } from "sonner";
import { AlertTriangle, FileX, FileCheck, Loader2, Info } from "lucide-react";

interface FiscalDocument {
  id: string;
  doc_type: "nfce" | "nfe";
  access_key: string | null;
  status: string;
  number: number | null;
  created_at: string;
  nuvem_fiscal_id?: string;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface FiscalReturnHandlerProps {
  saleId: string;
  companyId: string;
  onFiscalComplete?: () => void;
}

/**
 * Handles fiscal obligations when a sale is returned:
 * - NFC-e within 24h → cancels via SEFAZ
 * - NFC-e past 24h → warns user that NF-e de Devolução (CFOP 1.202) is needed
 */
export function FiscalReturnHandler({ saleId, companyId, onFiscalComplete }: FiscalReturnHandlerProps) {
  const [fiscalDoc, setFiscalDoc] = useState<FiscalDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelResult, setCancelResult] = useState<{ success: boolean; message: string } | null>(null);

  const checkFiscalDocument = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("fiscal_documents")
        .select("id, doc_type, access_key, status, number, created_at, nuvem_fiscal_id")
        .eq("sale_id", saleId)
        .eq("company_id", companyId)
        .in("status", ["autorizada", "simulado"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setFiscalDoc(data as FiscalDocument | null);
      setChecked(true);
    } catch {
      toast.error("Erro ao verificar documento fiscal");
    }
    setLoading(false);
  }, [saleId, companyId]);

  // Auto-check on mount
  if (!checked && !loading) {
    checkFiscalDocument();
  }

  const handleCancelNfce = async () => {
    if (!fiscalDoc?.access_key) {
      toast.error("Chave de acesso não encontrada");
      return;
    }

    setCanceling(true);
    try {
      const result = await FiscalEmissionService.cancelDocument({
        accessKey: fiscalDoc.access_key,
        fiscalDocId: fiscalDoc.id,
        saleId,
        docType: fiscalDoc.doc_type,
        nuvemFiscalId: fiscalDoc.nuvem_fiscal_id,
        justificativa: "Cancelamento por devolução de mercadoria ao consumidor",
      });

      if (result.success) {
        setCancelResult({ success: true, message: "NFC-e cancelada com sucesso na SEFAZ" });
        toast.success("NFC-e cancelada com sucesso!");
        onFiscalComplete?.();
      } else {
        setCancelResult({ success: false, message: result.error || "Erro ao cancelar NFC-e" });
        toast.error(result.error || "Erro ao cancelar NFC-e");
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setCancelResult({ success: false, message });
      toast.error(`Erro: ${message}`);
    }
    setCanceling(false);
  };

  if (loading || !checked) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Verificando documento fiscal...
      </div>
    );
  }

  // No fiscal document linked to this sale
  if (!fiscalDoc) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Info className="w-3.5 h-3.5" />
        Nenhum documento fiscal vinculado a esta venda
      </div>
    );
  }

  // Simulated document — no SEFAZ action needed
  if (fiscalDoc.status === "simulado") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Info className="w-3.5 h-3.5" />
        Documento fiscal simulado (homologação) — sem ação fiscal necessária
      </div>
    );
  }

  // Already handled
  if (cancelResult) {
    return (
      <div className={`flex items-center gap-2 text-xs py-2 ${cancelResult.success ? "text-green-600" : "text-destructive"}`}>
        {cancelResult.success ? <FileCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
        {cancelResult.message}
      </div>
    );
  }

  const deadline = FiscalEmissionService.isCancelDeadlineExpired(fiscalDoc.created_at, fiscalDoc.doc_type);

  // Within cancellation window
  if (!deadline.expired) {
    const hoursLeft = deadline.maxHours - deadline.hoursElapsed;
    return (
      <div className="space-y-2 py-2">
        <div className="flex items-start gap-2 text-xs text-warning dark:text-warning">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">
              {fiscalDoc.doc_type === "nfce" ? "NFC-e" : "NF-e"} #{fiscalDoc.number} autorizada
            </p>
            <p>Prazo para cancelamento: ~{hoursLeft}h restantes</p>
          </div>
        </div>
        <button
          onClick={handleCancelNfce}
          disabled={canceling}
          className="w-full px-4 py-2 rounded-xl bg-destructive text-destructive-foreground font-semibold text-xs disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {canceling ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cancelando na SEFAZ...</>
          ) : (
            <><FileX className="w-3.5 h-3.5" /> Cancelar {fiscalDoc.doc_type === "nfce" ? "NFC-e" : "NF-e"} na SEFAZ</>
          )}
        </button>
      </div>
    );
  }

  // Past cancellation window
  return (
    <div className="space-y-1.5 py-2">
      <div className="flex items-start gap-2 text-xs text-destructive">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold">
            Prazo de cancelamento expirado ({deadline.hoursElapsed}h de {deadline.maxHours}h)
          </p>
          <p className="text-muted-foreground">
            {fiscalDoc.doc_type === "nfce" ? "NFC-e" : "NF-e"} #{fiscalDoc.number} — É necessário emitir uma{" "}
            <strong>NF-e de Devolução (CFOP 1.202)</strong> referenciando a chave de acesso original.
          </p>
          {fiscalDoc.access_key && (
            <p className="font-mono text-[10px] mt-1 break-all text-muted-foreground/70">
              Chave: {fiscalDoc.access_key}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
