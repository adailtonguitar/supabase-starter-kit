import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Search,
  Send,
  XCircle,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  Ban,
  RotateCcw,
  Printer,
  Loader2,
  Download,
  FileSpreadsheet,
  ShieldAlert,
  HardDrive,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { FiscalEmissionService } from "@/services/FiscalEmissionService";
import { useGapDetection, type NumberingGap } from "@/hooks/useGapDetection";
import { toast } from "sonner";
import type { FiscalConsultResult, FiscalPdfResult, FiscalBackupResult } from "@/integrations/supabase/fiscal.types";

type DocType = "nfce" | "nfe" | "sat";
type DocStatus = "pendente" | "autorizada" | "cancelada" | "rejeitada" | "contingencia" | "inutilizada";

interface FiscalDoc {
  id: string;
  doc_type: DocType;
  number: number | null;
  serie: number | null;
  access_key: string | null;
  status: DocStatus;
  total_value: number;
  customer_name: string | null;
  customer_cpf_cnpj: string | null;
  payment_method: string | null;
  created_at: string;
  is_contingency: boolean;
  environment: "homologacao" | "producao";
}

const statusConfig: Record<DocStatus, { icon: React.ElementType; label: string; className: string }> = {
  pendente: { icon: Clock, label: "Pendente", className: "bg-muted text-muted-foreground" },
  autorizada: { icon: CheckCircle, label: "Autorizada", className: "bg-success/10 text-success" },
  cancelada: { icon: XCircle, label: "Cancelada", className: "bg-destructive/10 text-destructive" },
  rejeitada: { icon: Ban, label: "Rejeitada", className: "bg-destructive/10 text-destructive" },
  contingencia: { icon: AlertTriangle, label: "Contingência", className: "bg-warning/10 text-warning" },
  inutilizada: { icon: RotateCcw, label: "Inutilizada", className: "bg-muted text-muted-foreground" },
};

const typeLabels: Record<DocType, string> = { nfce: "NFC-e", nfe: "NF-e", sat: "SAT" };

export default function Fiscal() {
  const { companyId } = useCompany();
  const [selectedType, setSelectedType] = useState<DocType | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<FiscalDoc | null>(null);
  const [docs, setDocs] = useState<FiscalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [printingDanfe, setPrintingDanfe] = useState(false);
  const [consultingStatus, setConsultingStatus] = useState(false);
  const [lastConsultDetails, setLastConsultDetails] = useState<Record<string, unknown> | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelJustificativa, setCancelJustificativa] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showInutPanel, setShowInutPanel] = useState(false);
  const [inutDocType, setInutDocType] = useState<"nfce" | "nfe">("nfce");
  const [inutSerie, setInutSerie] = useState(1);
  const [inutNumInicial, setInutNumInicial] = useState(1);
  const [inutNumFinal, setInutNumFinal] = useState(1);
  const [inutJustificativa, setInutJustificativa] = useState("");
  const [inutLoading, setInutLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const { gaps, loading: gapsLoading, refresh: refreshGaps } = useGapDetection();

  const loadDocs = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("fiscal_documents")
      .select("id, doc_type, number, serie, access_key, status, total_value, customer_name, customer_cpf_cnpj, payment_method, created_at, is_contingency, environment")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && data) setDocs(data as FiscalDoc[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleConsultStatus = async (doc: FiscalDoc) => {
    if (!doc.access_key) {
      toast.error("Documento sem chave de acesso para consulta.");
      return;
    }

    setConsultingStatus(true);
    setLastConsultDetails(null);
    try {
      const result = await FiscalEmissionService.consultStatus({
        accessKey: doc.access_key,
        docType: doc.doc_type as "nfce" | "nfe",
        companyId: companyId || undefined,
      }) as FiscalConsultResult;

      if (!result?.success) {
        toast.error(result?.error || "Falha ao consultar status na Nuvem Fiscal.");
        return;
      }

      setLastConsultDetails(result?.details || null);
      const newStatus = (result?.status || doc.status) as DocStatus;
      setSelectedDoc({
        ...doc,
        status: newStatus,
        number: result?.number ?? doc.number,
        access_key: result?.access_key || doc.access_key,
      });
      await loadDocs();

      if (newStatus === "autorizada") {
        toast.success("Status reconciliado com a Nuvem Fiscal: documento autorizado.");
      } else {
        toast.info(`Status atual na Nuvem Fiscal: ${newStatus}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao consultar status.";
      toast.error(message);
    } finally {
      setConsultingStatus(false);
    }
  };

  const handlePrintDanfe = async (doc: FiscalDoc) => {
    if (!doc.access_key) {
      toast.error("Documento sem chave de acesso. Não é possível gerar DANFE.");
      return;
    }
    setPrintingDanfe(true);
    try {
      const result = await FiscalEmissionService.downloadPdf(doc.access_key, doc.doc_type as "nfce" | "nfe") as FiscalPdfResult;
      const pdfBase64 = result?.pdf_base64 || result?.base64;
      if (pdfBase64) {
        const byteCharacters = atob(pdfBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        toast.success("DANFE gerada com sucesso!");
      } else if (result?.error) {
        toast.error(`Erro da Nuvem Fiscal: ${typeof result.error === 'string' ? result.error : 'Documento não encontrado no provedor fiscal.'}`);
      } else {
        toast.error("Não foi possível obter o PDF da DANFE.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao gerar DANFE";
      toast.error(`Erro ao gerar DANFE: ${message}`);
    } finally {
      setPrintingDanfe(false);
    }
  };

  const filtered = docs.filter((doc) => {
    const matchType = selectedType === "all" || doc.doc_type === selectedType;
    const matchSearch =
      String(doc.number || "").includes(search) ||
      (doc.access_key?.includes(search) ?? false) ||
      (doc.customer_name?.toLowerCase().includes(search.toLowerCase()) ?? false);
    return matchType && matchSearch;
  });

  const statusCounts = {
    autorizada: docs.filter((d) => d.status === "autorizada").length,
    pendente: docs.filter((d) => d.status === "pendente").length,
    contingencia: docs.filter((d) => d.status === "contingencia").length,
    rejeitada: docs.filter((d) => d.status === "rejeitada").length,
  };

  const [spedYear, setSpedYear] = useState(new Date().getFullYear());
  const [spedMonth, setSpedMonth] = useState(new Date().getMonth() + 1);
  const [spedGenerating, setSpedGenerating] = useState(false);
  const [spedJobId, setSpedJobId] = useState<string | null>(null);
  const [spedProgress, setSpedProgress] = useState(0);
  const [showSpedPanel, setShowSpedPanel] = useState(false);

  useEffect(() => {
    if (!spedJobId) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("processing_jobs")
        .select("status, progress, result, error")
        .eq("id", spedJobId)
        .single();
      if (!data) return;
      setSpedProgress(data.progress || 0);
      if (data.status === "completed") {
        clearInterval(interval);
        setSpedGenerating(false);
        setSpedJobId(null);
        const result = data.result as any;
        toast.success(`SPED gerado: ${result?.period} — ${result?.docs_count} documentos`);
        if (result?.file_path) {
          const { data: fileData } = await supabase.storage.from("company-backups").download(result.file_path);
          if (fileData) {
            const url = URL.createObjectURL(fileData);
            const a = document.createElement("a");
            a.href = url;
            a.download = `SPED_${result.period?.replace("/", "_")}.txt`;
            a.click();
            URL.revokeObjectURL(url);
          }
        }
      } else if (data.status === "failed") {
        clearInterval(interval);
        setSpedGenerating(false);
        setSpedJobId(null);
        toast.error(`Erro ao gerar SPED: ${data.error || "erro desconhecido"}`);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [spedJobId]);

  const handleGenerateSped = async () => {
    setSpedGenerating(true);
    setSpedProgress(0);
    try {
      const { data, error } = await supabase.functions.invoke("generate-sped", {
        body: { year: spedYear, month: spedMonth },
      });
      if (error) throw error;
      if (data?.job_id) {
        setSpedJobId(data.job_id);
        toast.info(`Gerando SPED ${data.period}...`);
      } else if (data?.success) {
        setSpedGenerating(false);
        toast.success("SPED gerado com sucesso!");
      } else {
        throw new Error(data?.error || "Erro desconhecido");
      }
    } catch (err: unknown) {
      setSpedGenerating(false);
      const message = err instanceof Error ? err.message : "Erro ao gerar SPED";
      toast.error(message);
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Documentos Fiscais</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">NFC-e, NF-e e SAT</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button
            onClick={() => setShowInutPanel(!showInutPanel)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-warning/10 text-warning text-xs sm:text-sm font-medium hover:bg-warning/20 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Inutilizar</span>
          </button>
          <button
            onClick={async () => {
              if (!companyId) return;
              setBackupLoading(true);
              const result = await FiscalEmissionService.backupXmls(companyId) as FiscalBackupResult;
              if (result.success) {
                toast.success(result.message || `Backup concluído: ${result.backed} XMLs salvos.`);
              } else {
                toast.error(result.error || "Erro ao fazer backup");
              }
              setBackupLoading(false);
            }}
            disabled={backupLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-accent-foreground text-xs sm:text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
          >
            {backupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
            <span className="hidden sm:inline">Backup XMLs</span>
            <span className="sm:hidden">XML</span>
          </button>
          <button
            onClick={() => setShowSpedPanel(!showSpedPanel)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-xs sm:text-sm font-medium hover:opacity-90 transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">SPED Fiscal</span>
            <span className="sm:hidden">SPED</span>
          </button>
        </div>
      </div>

      {showSpedPanel && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl card-shadow border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Exportação SPED Fiscal (EFD ICMS/IPI)</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Gera o arquivo SPED Fiscal com os registros de documentos fiscais, produtos e participantes do período selecionado.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mês</label>
              <select value={spedMonth} onChange={(e) => setSpedMonth(Number(e.target.value))}
                className="px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i).toLocaleString("pt-BR", { month: "long" })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ano</label>
              <input type="number" value={spedYear} onChange={(e) => setSpedYear(Number(e.target.value))} min={2020} max={2030}
                className="w-24 px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <button onClick={handleGenerateSped} disabled={spedGenerating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50">
              {spedGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando... {spedProgress}%
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Gerar e Baixar SPED
                </>
              )}
            </button>
          </div>
          {spedGenerating && (
            <div className="mt-3">
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${spedProgress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Processando documentos fiscais do período...</p>
            </div>
          )}
        </motion.div>
      )}

      {showInutPanel && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl card-shadow border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <RotateCcw className="w-5 h-5 text-warning" />
            <h2 className="text-base font-semibold text-foreground">Inutilização de Numeração</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Inutilize faixas de numeração quando houver quebra na sequência. Obrigatório para evitar multa por numeração não utilizada.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
              <select value={inutDocType} onChange={(e) => setInutDocType(e.target.value as "nfce" | "nfe")}
                className="px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm">
                <option value="nfce">NFC-e</option>
                <option value="nfe">NF-e</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Série</label>
              <input type="number" value={inutSerie} onChange={(e) => setInutSerie(Number(e.target.value))} min={1}
                className="w-20 px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nº Inicial</label>
              <input type="number" value={inutNumInicial} onChange={(e) => setInutNumInicial(Number(e.target.value))} min={1}
                className="w-28 px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nº Final</label>
              <input type="number" value={inutNumFinal} onChange={(e) => setInutNumFinal(Number(e.target.value))} min={1}
                className="w-28 px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm font-mono" />
            </div>
          </div>
          <div className="mt-4">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Justificativa (mín. 15 caracteres)</label>
            <textarea value={inutJustificativa} onChange={(e) => setInutJustificativa(e.target.value)}
              placeholder="Ex: Quebra de sequência por falha no sistema..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-warning/30" />
          </div>
          <button
            disabled={inutLoading || inutJustificativa.length < 15 || inutNumFinal < inutNumInicial}
            onClick={async () => {
              if (!companyId) return;
              setInutLoading(true);
              const result = await FiscalEmissionService.inutilizeNumbers({
                companyId,
                docType: inutDocType,
                serie: inutSerie,
                numeroInicial: inutNumInicial,
                numeroFinal: inutNumFinal,
                justificativa: inutJustificativa,
              });
              if (result.success) {
                toast.success((result as any).message || "Numeração inutilizada com sucesso!");
                setShowInutPanel(false);
                loadDocs();
                refreshGaps();
              } else {
                toast.error(result.error || "Erro ao inutilizar");
              }
              setInutLoading(false);
            }}
            className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-warning text-warning-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
          >
            {inutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Inutilizar na SEFAZ
          </button>
        </motion.div>
      )}

      {/* ── Gap Detection Alert ── */}
      {gaps.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-destructive/5 rounded-xl border border-destructive/30 p-4 sm:p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            <h2 className="text-sm sm:text-base font-semibold text-destructive">
              {gaps.length} gap{gaps.length > 1 ? "s" : ""} de numeração detectado{gaps.length > 1 ? "s" : ""}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Números fiscais não utilizados devem ser inutilizados na SEFAZ para evitar multa (Art. 199 do RICMS). Clique para preencher automaticamente.
          </p>
          <div className="space-y-2">
            {gaps.map((gap, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                    {gap.docType === "nfce" ? "NFC-e" : "NF-e"}
                  </span>
                  <span className="text-sm font-mono text-foreground">
                    Série {gap.serie}: <strong>#{gap.start}</strong> → <strong>#{gap.end}</strong>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({gap.count} número{gap.count > 1 ? "s" : ""})
                  </span>
                </div>
                <button
                  onClick={() => {
                    setInutDocType(gap.docType);
                    setInutSerie(gap.serie);
                    setInutNumInicial(gap.start);
                    setInutNumFinal(gap.end);
                    setInutJustificativa("Quebra de sequência numérica detectada automaticamente pelo sistema.");
                    setShowInutPanel(true);
                    toast.info(`Formulário preenchido com gap ${gap.start}–${gap.end}. Confirme a inutilização.`);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning/10 text-warning text-xs font-medium hover:bg-warning/20 transition-all self-start sm:self-auto"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Inutilizar
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por número, chave ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {(["all", "nfce", "nfe", "sat"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                selectedType === type
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {type === "all" ? "Todos" : typeLabels[type]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Autorizadas", count: statusCounts.autorizada, className: "text-success" },
          { label: "Pendentes", count: statusCounts.pendente, className: "text-muted-foreground" },
          { label: "Contingência", count: statusCounts.contingencia, className: "text-warning" },
          { label: "Rejeitadas", count: statusCounts.rejeitada, className: "text-destructive" },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-3 sm:p-4 card-shadow">
            <p className="text-[10px] sm:text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-lg sm:text-2xl font-bold font-mono mt-0.5 ${s.className}`}>{s.count}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando documentos...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum documento encontrado.</div>
        ) : (
          filtered.map((doc, i) => {
            const st = statusConfig[doc.status];
            return (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-card rounded-xl card-shadow border border-border p-3 sm:p-4 hover:border-primary/30 transition-all cursor-pointer"
                onClick={() => setSelectedDoc(doc)}
              >
                <div className="sm:hidden space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                        {typeLabels[doc.doc_type]}
                      </span>
                      <span className="text-sm font-semibold text-foreground font-mono">
                        #{String(doc.number || 0).padStart(6, "0")}
                      </span>
                      {doc.is_contingency && <AlertTriangle className="w-3 h-3 text-warning" />}
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${st.className}`}>
                      <st.icon className="w-3 h-3" />
                      {st.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                      {doc.customer_name && <span className="ml-1.5">• {doc.customer_name}</span>}
                    </div>
                    <span className="text-sm font-bold font-mono text-primary">{formatCurrency(doc.total_value)}</span>
                  </div>
                  <div className="flex items-center gap-1 justify-end">
                    {doc.status === "autorizada" && doc.access_key && (
                      <button onClick={(e) => { e.stopPropagation(); handlePrintDanfe(doc); }} disabled={printingDanfe}
                        className="p-1 rounded-lg text-primary hover:bg-primary/10 transition-colors" title="DANFE">
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="hidden sm:flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                      <FileText className="w-5 h-5 text-accent-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                          {typeLabels[doc.doc_type]}
                        </span>
                        <span className="font-semibold text-foreground font-mono">
                          #{String(doc.number || 0).padStart(6, "0")}
                        </span>
                        <span className="text-xs text-muted-foreground">Série {doc.serie || 1}</span>
                        {doc.is_contingency && <AlertTriangle className="w-3.5 h-3.5 text-warning" />}
                      </div>
                      {doc.access_key && (
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate max-w-[300px]">
                          {doc.access_key}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {doc.customer_name && <p className="text-sm text-foreground">{doc.customer_name}</p>}
                      <p className="text-xs text-muted-foreground">
                        {new Date(doc.created_at).toLocaleString("pt-BR")} • {doc.payment_method || "-"}
                      </p>
                    </div>
                    <span className="text-lg font-bold font-mono text-primary">{formatCurrency(doc.total_value)}</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${st.className}`}>
                      <st.icon className="w-3 h-3" />
                      {st.label}
                    </span>
                    {doc.status === "autorizada" && doc.access_key && (
                      <button onClick={(e) => { e.stopPropagation(); handlePrintDanfe(doc); }} disabled={printingDanfe}
                        className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors" title="Imprimir DANFE">
                        <Printer className="w-4 h-4" />
                      </button>
                    )}
                    <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {selectedDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm"
          onClick={() => setSelectedDoc(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card rounded-2xl border border-border card-shadow w-full max-w-lg mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">
                {typeLabels[selectedDoc.doc_type]} #{String(selectedDoc.number || 0).padStart(6, "0")}
              </h3>
              <button onClick={() => setSelectedDoc(null)} className="p-1 rounded text-muted-foreground hover:text-foreground">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[selectedDoc.status].className}`}>
                  {statusConfig[selectedDoc.status].label}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ambiente</span><span className="text-foreground capitalize">{selectedDoc.environment}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Valor Total</span><span className="font-mono font-semibold text-primary">{formatCurrency(selectedDoc.total_value)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Pagamento</span><span className="text-foreground">{selectedDoc.payment_method || "-"}</span></div>
              {selectedDoc.customer_name && (
                <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span className="text-foreground">{selectedDoc.customer_name}</span></div>
              )}
              {selectedDoc.customer_cpf_cnpj && (
                <div className="flex justify-between"><span className="text-muted-foreground">CPF/CNPJ</span><span className="font-mono text-foreground">{selectedDoc.customer_cpf_cnpj}</span></div>
              )}
              {selectedDoc.access_key && (
                <div>
                  <span className="text-muted-foreground block mb-1">Chave de Acesso</span>
                  <code className="text-xs font-mono bg-muted p-2 rounded-lg block break-all text-foreground">{selectedDoc.access_key}</code>
                </div>
              )}
              {selectedDoc.is_contingency && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 text-warning text-xs">
                  <AlertTriangle className="w-4 h-4" />
                  Documento emitido em contingência
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => handleConsultStatus(selectedDoc)}
                disabled={consultingStatus || !selectedDoc.access_key}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
              >
                {consultingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Consultar na Nuvem Fiscal
              </button>
            </div>

            {lastConsultDetails && (
              <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Último retorno bruto da Nuvem Fiscal</p>
                <pre className="max-h-48 overflow-auto text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">{JSON.stringify(lastConsultDetails, null, 2)}</pre>
              </div>
            )}

            {/* XML Download/Save Buttons */}
            {selectedDoc.status === "autorizada" && selectedDoc.access_key && (
              <div className="flex gap-2 mt-6">
                <button
                  onClick={async () => {
                    const result = await FiscalEmissionService.downloadXml(selectedDoc.access_key!, selectedDoc.doc_type as "nfce" | "nfe");
                    const xml = (result as any)?.xml || (result as any)?.xml_content;
                    if (xml) {
                      const blob = new Blob([xml], { type: "application/xml" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${selectedDoc.doc_type}_${selectedDoc.number || 0}.xml`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success("XML baixado no seu PC!");
                    } else {
                      toast.error((result as any)?.error || "Não foi possível obter o XML.");
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-all"
                >
                  <Download className="w-4 h-4" />
                  Baixar XML (PC)
                </button>
                <button
                  onClick={async () => {
                    if (!companyId) return;
                    const result = await FiscalEmissionService.downloadXml(selectedDoc.access_key!, selectedDoc.doc_type as "nfce" | "nfe");
                    const xml = (result as any)?.xml || (result as any)?.xml_content;
                    if (!xml) { toast.error((result as any)?.error || "Não foi possível obter o XML."); return; }
                    const saveResult = await FiscalEmissionService.saveXmlToCloud({
                      companyId,
                      accessKey: selectedDoc.access_key!,
                      docType: selectedDoc.doc_type as "nfce" | "nfe",
                      number: selectedDoc.number || 0,
                      xmlContent: xml,
                    });
                    if (saveResult.success) {
                      toast.success(`XML salvo na nuvem: ${(saveResult as any).fileName}`);
                    } else {
                      toast.error(saveResult.error || "Erro ao salvar na nuvem");
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition-all"
                >
                  <HardDrive className="w-4 h-4" />
                  Salvar na Nuvem
                </button>
              </div>
            )}

            <div className="flex gap-2 mt-3">
              {selectedDoc.status === "autorizada" && selectedDoc.access_key && (
                <button
                  onClick={() => handlePrintDanfe(selectedDoc)}
                  disabled={printingDanfe}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {printingDanfe ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  Imprimir DANFE
                </button>
              )}
              {selectedDoc.status !== "autorizada" && (
                <button
                  disabled
                  className="flex-1 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-medium cursor-not-allowed"
                >
                  DANFE indisponível
                </button>
              )}
              {selectedDoc.status === "autorizada" && (() => {
                const deadline = FiscalEmissionService.isCancelDeadlineExpired(
                  selectedDoc.created_at,
                  selectedDoc.doc_type as "nfce" | "nfe"
                );
                return deadline.expired ? (
                  <div className="flex-1 py-2.5 rounded-xl bg-destructive/10 text-destructive text-xs font-medium text-center px-2">
                    Prazo expirado ({deadline.hoursElapsed}h / máx {deadline.maxHours}h)
                  </div>
                ) : (
                  <button
                    onClick={() => { setCancelJustificativa(""); setShowCancelConfirm(true); }}
                    className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 transition-all"
                  >
                    Cancelar ({deadline.maxHours - deadline.hoursElapsed}h restantes)
                  </button>
                );
              })()}
            </div>

            {/* Cancel confirmation */}
            {showCancelConfirm && (
              <div className="mt-4 p-4 rounded-xl bg-destructive/5 border border-destructive/20 space-y-3">
                <p className="text-sm font-medium text-foreground">Justificativa do cancelamento</p>
                <textarea
                  value={cancelJustificativa}
                  onChange={(e) => setCancelJustificativa(e.target.value)}
                  placeholder="Mínimo 15 caracteres. Ex: Erro na emissão do documento fiscal..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-destructive/30"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="flex-1 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Voltar
                  </button>
                  <button
                    disabled={cancelling || cancelJustificativa.length < 15}
                    onClick={async () => {
                      setCancelling(true);
                      const result = await FiscalEmissionService.cancelDocument({
                        accessKey: selectedDoc.access_key || undefined,
                        fiscalDocId: selectedDoc.id,
                        docType: selectedDoc.doc_type as "nfce" | "nfe",
                        justificativa: cancelJustificativa,
                      });
                      if (result.success) {
                        toast.success("Documento cancelado com sucesso!");
                        setSelectedDoc(null);
                        setShowCancelConfirm(false);
                        loadDocs();
                      } else {
                        toast.error(result.error || "Erro ao cancelar");
                      }
                      setCancelling(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {cancelling && <Loader2 className="w-4 h-4 animate-spin" />}
                    Confirmar Cancelamento
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
