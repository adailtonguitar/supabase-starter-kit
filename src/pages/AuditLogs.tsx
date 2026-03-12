import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock, AlertTriangle, CheckCircle, FileText, Shield,
  XCircle, Send, Settings, Eye, RefreshCw, Search, Filter,
} from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface AuditEntry {
  id: string;
  action: string;
  details: Record<string, any> | null;
  doc_type: string | null;
  document_id: string | null;
  user_id: string | null;
  created_at: string;
  company_id: string;
}

function getSeverity(action: string): "info" | "warning" | "error" | "success" {
  const lower = action.toLowerCase();
  if (lower.includes("rejeição") || lower.includes("erro") || lower.includes("falha") || lower.includes("cancelamento")) return "error";
  if (lower.includes("contingência") || lower.includes("alerta")) return "warning";
  if (lower.includes("autoriza") || lower.includes("emissão") || lower.includes("sucesso")) return "success";
  return "info";
}

const severityConfig = {
  info: { icon: Eye, className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  success: { icon: CheckCircle, className: "bg-success/10 text-success", dot: "bg-success" },
  warning: { icon: AlertTriangle, className: "bg-warning/10 text-warning", dot: "bg-warning" },
  error: { icon: XCircle, className: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
};

function getActionIcon(action: string): React.ElementType {
  const lower = action.toLowerCase();
  if (lower.includes("emissão")) return Send;
  if (lower.includes("contingência")) return AlertTriangle;
  if (lower.includes("rejeição") || lower.includes("cancelamento")) return XCircle;
  if (lower.includes("certificado")) return Shield;
  if (lower.includes("config") || lower.includes("atualiz")) return Settings;
  if (lower.includes("resolv")) return CheckCircle;
  return FileText;
}

export default function AuditLogs() {
  const { companyId } = useCompany();
  const [search, setSearch] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("all");

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["fiscal-audit-logs", companyId],
    queryFn: async () => {
      if (!companyId) return [];

      // Fiscal audit logs only
      const { data: fiscalData } = await supabase
        .from("fiscal_audit_logs")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200);

      const fiscalEntries: AuditEntry[] = (fiscalData || []).map((d: any) => ({
        id: d.id,
        action: d.action,
        details: d.details,
        doc_type: d.doc_type || null,
        document_id: d.document_id || null,
        user_id: d.user_id,
        created_at: d.created_at,
        company_id: d.company_id,
      }));

      // Also include fiscal-module action_logs
      const { data: actionData } = await supabase
        .from("action_logs")
        .select("*")
        .eq("company_id", companyId)
        .eq("module", "fiscal")
        .order("created_at", { ascending: false })
        .limit(200);

      const actionEntries: AuditEntry[] = (actionData || []).map((d: any) => ({
        id: d.id,
        action: d.action,
        details: typeof d.details === "string" ? { description: d.details } : d.details,
        doc_type: "fiscal",
        document_id: null,
        user_id: d.user_id,
        created_at: d.created_at,
        company_id: d.company_id,
      }));

      // Merge and sort by date
      return [...fiscalEntries, ...actionEntries]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 200);
    },
    enabled: !!companyId,
  });

  const filtered = logs.filter((entry) => {
    const matchesSearch = !search ||
      entry.action.toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(entry.details).toLowerCase().includes(search.toLowerCase());
    const matchesType = docTypeFilter === "all" || entry.doc_type === docTypeFilter;
    return matchesSearch && matchesType;
  });

  const docTypes = [...new Set(logs.map((l) => l.doc_type).filter(Boolean))];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Auditoria Fiscal</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Histórico de emissões, cancelamentos e operações fiscais ({filtered.length} registros)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="self-start sm:self-auto">
          <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por ação ou detalhes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="w-4 h-4 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {docTypes.map((dt) => (
              <SelectItem key={dt} value={dt!}>{dt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="w-10 h-10 rounded-full" />
              <Skeleton className="flex-1 h-20 rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhum log fiscal encontrado</p>
          <p className="text-sm mt-1">Os registros aparecerão conforme operações fiscais (NF-e, NFC-e) forem realizadas.</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
          {filtered.map((entry, i) => {
            const severity = getSeverity(entry.action);
            const sev = severityConfig[severity];
            const ActionIcon = getActionIcon(entry.action);
            const details = entry.details || {};
            const detailText = details.entity_name
              ? `${details.entity_type || ""} ${details.entity_name || ""}`.trim()
              : details.description
                ? details.description
                : details.user_email
                  ? `Usuário: ${details.user_email}`
                  : "";

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.03 }}
                className="relative flex gap-4 pb-6 last:pb-0"
              >
                <div className="relative z-10 flex-shrink-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${sev.className}`}>
                    <ActionIcon className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex-1 bg-card rounded-xl border border-border p-3 sm:p-4 card-shadow min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 mb-1">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-semibold text-foreground break-all">{entry.action}</span>
                      {entry.doc_type && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground flex-shrink-0">
                          {entry.doc_type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {new Date(entry.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  {detailText && <p className="text-sm text-muted-foreground">{detailText}</p>}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
