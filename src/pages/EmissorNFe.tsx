import { useState, useEffect, lazy, Suspense } from "react";
import {
  FileText, Plus, Download, RefreshCw, LogOut, Search,
  CheckCircle, AlertTriangle, Clock, Loader2, Menu, ChevronLeft,
  Building2, Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/mock-data";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "@/components/ThemeToggle";

const NFeEmissao = lazy(() => import("./NFeEmissao"));

type ViewMode = "list" | "new";

interface FiscalDoc {
  id: string;
  doc_type: string;
  number: number | null;
  access_key: string | null;
  status: string;
  total_value: number;
  dest_name: string | null;
  dest_doc: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  autorizado: { label: "Autorizada", color: "text-emerald-500 bg-emerald-500/10", icon: CheckCircle },
  cancelado: { label: "Cancelada", color: "text-destructive bg-destructive/10", icon: AlertTriangle },
  rejeitado: { label: "Rejeitada", color: "text-destructive bg-destructive/10", icon: AlertTriangle },
  pendente: { label: "Pendente", color: "text-warning bg-warning/10", icon: Clock },
  processando: { label: "Processando", color: "text-blue-500 bg-blue-500/10", icon: Loader2 },
};

export default function EmissorNFe() {
  const { user, signOut } = useAuth();
  const { companyId, companyName, logoUrl } = useCompany();
  const [view, setView] = useState<ViewMode>("list");
  const [docs, setDocs] = useState<FiscalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchDocs = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("fiscal_documents")
        .select("id, doc_type, number, access_key, status, total_value, dest_name, dest_doc, created_at")
        .eq("company_id", companyId)
        .eq("doc_type", "nfe")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setDocs((data as any[]) || []);
    } catch (err) {
      console.error("[EmissorNFe] fetch error:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (companyId) fetchDocs();
  }, [companyId]);

  const filteredDocs = docs.filter((d) => {
    const matchesSearch =
      !searchTerm ||
      d.dest_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.dest_doc?.includes(searchTerm) ||
      d.access_key?.includes(searchTerm) ||
      String(d.number).includes(searchTerm);

    const matchesStatus = statusFilter === "all" || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: docs.length,
    autorizadas: docs.filter((d) => d.status === "autorizado").length,
    pendentes: docs.filter((d) => d.status === "pendente" || d.status === "processando").length,
    erros: docs.filter((d) => d.status === "rejeitado").length,
  };

  if (view === "new") {
    return (
      <div className="min-h-screen bg-background">
        {/* Minimal header */}
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 sticky top-0 z-30">
          <button
            onClick={() => { setView("list"); fetchDocs(); }}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </button>
          <div className="flex-1" />
          <ThemeToggle />
        </header>
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-[60vh]">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          }
        >
          <NFeEmissao />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground truncate">Emissor NF-e</h1>
              <p className="text-[11px] text-muted-foreground truncate">{companyName || "Empresa"}</p>
            </div>
          </div>

          <div className="flex-1" />

          <ThemeToggle />

          <button
            onClick={signOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "Autorizadas", value: stats.autorizadas, color: "text-emerald-500" },
            { label: "Pendentes", value: stats.pendentes, color: "text-warning" },
            { label: "Rejeitadas", value: stats.erros, color: "text-destructive" },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-xl border border-border p-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Actions bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <button
            onClick={() => setView("new")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nova NF-e
          </button>

          <div className="flex-1 flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por destinatário, CNPJ, nº..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Todos</option>
              <option value="autorizado">Autorizadas</option>
              <option value="pendente">Pendentes</option>
              <option value="rejeitado">Rejeitadas</option>
            </select>

            <button
              onClick={fetchDocs}
              className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
              title="Atualizar"
            >
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* NF-e List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">
              {docs.length === 0 ? "Nenhuma NF-e emitida ainda." : "Nenhuma NF-e encontrada com os filtros aplicados."}
            </p>
            {docs.length === 0 && (
              <button
                onClick={() => setView("new")}
                className="text-sm text-primary font-medium hover:underline"
              >
                Emitir primeira NF-e →
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Nº</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Destinatário</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Valor</th>
                    <th className="text-center px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((doc) => {
                    const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pendente;
                    return (
                      <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-foreground">
                          {doc.number ? String(doc.number).padStart(6, "0") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-foreground font-medium truncate max-w-[200px]">{doc.dest_name || "—"}</p>
                          <p className="text-[11px] text-muted-foreground">{doc.dest_doc || ""}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                          {formatCurrency(doc.total_value)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
                            <cfg.icon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(doc.created_at).toLocaleDateString("pt-BR")}{" "}
                          {new Date(doc.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filteredDocs.map((doc) => {
                const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pendente;
                return (
                  <div key={doc.id} className="bg-card rounded-xl border border-border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium text-foreground">
                        Nº {doc.number ? String(doc.number).padStart(6, "0") : "—"}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color}`}>
                        <cfg.icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-foreground font-medium truncate">{doc.dest_name || "—"}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{new Date(doc.created_at).toLocaleDateString("pt-BR")}</span>
                      <span className="font-mono font-bold text-foreground">{formatCurrency(doc.total_value)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
