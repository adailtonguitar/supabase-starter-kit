import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";

export interface DFeDocument {
  id: string;
  chave: string;
  tipo_documento: string;
  numero: number;
  serie: number;
  data_emissao: string;
  valor_total: number;
  cnpj_emitente: string;
  nome_emitente: string;
  situacao: string;
  nsu: number;
  schema: string;
  tipo_nfe?: number;
  nuvem_fiscal_id?: string;
  status_manifestacao?: string;
  importado?: boolean;
}

export function useDFe() {
  const { companyId } = useCompany();
  const [isDistributing, setIsDistributing] = useState(false);

  const documentsQuery = useQuery({
    queryKey: ["dfe-documents", companyId],
    queryFn: async () => {
      if (!companyId) return { documents: [], total: 0 };

      try {
        const { data, error } = await supabase.functions.invoke("fetch-dfe", {
          body: { action: "list", company_id: companyId },
        });

        if (error) {
          let errMsg = "Erro ao buscar documentos";
          try {
            if (error?.context?.json) {
              const body = await error.context.json();
              errMsg = body?.error || body?.message || errMsg;
            } else if (typeof error === "object" && "message" in error) {
              errMsg = error.message;
            }
          } catch { /* fallback */ }
          toast.error(errMsg);
          return { documents: [], total: 0 };
        }

        const response = (data ?? {}) as { success?: boolean; error?: string; data?: { data?: Record<string, unknown>[]; "@count"?: number } };
        if (!response?.success) {
          toast.error(response?.error || "Erro ao buscar documentos");
          return { documents: [], total: 0 };
        }

        const docs = (response.data?.data || []).map((d: Record<string, unknown>) => ({
          id: d.id,
          chave: d.chave || d.chNFe || "",
          tipo_documento: d.tipo_documento || d.schema || "NF-e",
          numero: d.numero || d.numero_nfe || 0,
          serie: d.serie || 0,
          data_emissao: d.data_emissao || d.dh_emissao || "",
          valor_total: d.valor_total || d.vNF || 0,
          cnpj_emitente: d.cnpj_emitente || "",
          nome_emitente: d.nome_emitente || "",
          situacao: d.situacao || "",
          nsu: d.nsu || 0,
          schema: d.schema || d.schema_tipo || "",
          tipo_nfe: d.tipo_nfe,
          nuvem_fiscal_id: d.nuvem_fiscal_id,
          status_manifestacao: d.status_manifestacao,
          importado: d.importado,
        }));

        return {
          documents: docs as DFeDocument[],
          total: response.data?.["@count"] || docs.length,
        };
      } catch (e: unknown) {
        console.error("[useDFe] queryFn error:", e);
        const msg = e instanceof Error ? e.message : "Erro inesperado ao buscar documentos";
        toast.error(msg);
        return { documents: [], total: 0 };
      }
    },
    enabled: !!companyId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const distribute = async () => {
    if (!companyId) return;
    setIsDistributing(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-dfe", {
        body: { action: "distribute", company_id: companyId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro na distribuição");
      toast.success("Consulta SEFAZ realizada! Atualizando lista...");
      setTimeout(() => {
        documentsQuery.refetch();
      }, 5000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Erro ao solicitar distribuição");
    } finally {
      setIsDistributing(false);
    }
  };

  const manifest = async (documentId: string, chaveNfe: string, tipoEvento = "ciencia") => {
    if (!companyId) return false;
    try {
      const { data, error } = await supabase.functions.invoke("fetch-dfe", {
        body: {
          action: "manifest",
          company_id: companyId,
          document_id: documentId,
          chave_nfe: chaveNfe,
          tipo_evento: tipoEvento,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro na manifestação");
      toast.success("Manifestação realizada com sucesso!");
      documentsQuery.refetch();
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Erro ao manifestar");
      return false;
    }
  };

  const downloadXml = async (documentId: string): Promise<string | null> => {
    if (!companyId) return null;
    try {
      const { data, error } = await supabase.functions.invoke("fetch-dfe", {
        body: { action: "detail", company_id: companyId, document_id: documentId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao baixar XML");
      return data.xml as string;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Erro ao baixar XML");
      return null;
    }
  };

  return {
    documents: documentsQuery.data?.documents || [],
    total: documentsQuery.data?.total || 0,
    isLoading: documentsQuery.isLoading,
    error: documentsQuery.error,
    refetch: documentsQuery.refetch,
    distribute,
    isDistributing,
    manifest,
    downloadXml,
  };
}
