import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, CheckCircle, AlertTriangle, Loader2, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

interface CompanyInfo {
  name: string;
  trade_name: string | null;
  cnpj: string;
}

interface ConfigSummary {
  hasNfce: boolean;
  hasNfe: boolean;
  hasSat: boolean;
  certType: string | null;
  environment: string;
  hasCert: boolean;
}

export default function FiscalConfig() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [configSummary, setConfigSummary] = useState<ConfigSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const load = async () => {
      setLoading(true);
      const [companyRes, configRes] = await Promise.all([
        supabase.from("companies").select("name, trade_name, cnpj").eq("id", companyId).maybeSingle(),
        supabase.from("fiscal_configs").select("*").eq("company_id", companyId),
      ]);

      if (companyRes.data) setCompany(companyRes.data);

      if (configRes.data && configRes.data.length > 0) {
        const configs = configRes.data;
        const nfce = configs.find((c) => c.doc_type === "nfce" && c.is_active);
        const nfe = configs.find((c) => c.doc_type === "nfe" && c.is_active);
        const sat = configs.find((c) => c.doc_type === "sat" && c.is_active);
        const first = configs[0];
        setConfigSummary({
          hasNfce: !!nfce,
          hasNfe: !!nfe,
          hasSat: !!sat,
          certType: (first as any).certificate_type || "A1",
          environment: first.environment || "homologacao",
          hasCert: !!(first.certificate_path || (first as any).a3_thumbprint),
        });
      }

      setLoading(false);
    };

    load();
  }, [companyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuração Fiscal</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie as configurações fiscais da empresa
        </p>
      </div>

      {company ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl card-shadow border border-border overflow-hidden"
        >
          <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-semibold text-foreground truncate">
                  {company.trade_name || company.name}
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground font-mono truncate">{company.cnpj}</p>
              </div>
            </div>
            <button
              onClick={() => navigate("/fiscal/config/edit")}
              className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-primary text-primary-foreground text-xs sm:text-sm font-medium hover:opacity-90 transition-all flex-shrink-0"
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">Editar Configuração</span>
              <span className="sm:hidden">Editar</span>
            </button>
          </div>

          {configSummary ? (
            <div className="border-t border-border px-5 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Certificado</p>
                  <div className="flex items-center gap-1.5">
                    {configSummary.hasCert ? (
                      <CheckCircle className="w-3.5 h-3.5 text-success" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                    )}
                    <span className="text-sm font-medium text-foreground">
                      {configSummary.certType}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Ambiente</p>
                  <span className={`text-sm font-medium capitalize ${
                    configSummary.environment === "producao" ? "text-success" : "text-warning"
                  }`}>
                    {configSummary.environment === "producao" ? "Produção" : "Homologação"}
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Documentos Ativos</p>
                  <div className="flex gap-1.5">
                    {configSummary.hasNfce && (
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">NFC-e</span>
                    )}
                    {configSummary.hasNfe && (
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">NF-e</span>
                    )}
                    {configSummary.hasSat && (
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">SAT</span>
                    )}
                    {!configSummary.hasNfce && !configSummary.hasNfe && !configSummary.hasSat && (
                      <span className="text-sm text-muted-foreground">Nenhum</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-success" />
                    <span className="text-sm font-medium text-success">Configurado</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-t border-border px-5 py-4">
              <div className="flex items-center gap-2 text-warning text-sm">
                <AlertTriangle className="w-4 h-4" />
                Nenhuma configuração fiscal encontrada. Clique em "Editar Configuração" para configurar.
              </div>
            </div>
          )}
        </motion.div>
      ) : (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhuma empresa encontrada. Configure os dados da empresa primeiro.
        </div>
      )}
    </div>
  );
}
