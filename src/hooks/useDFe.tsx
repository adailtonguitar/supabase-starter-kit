import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
}

export function useDFe() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [isDistributing, setIsDistributing] = useState(false);

  const documentsQuery = useQuery({
    queryKey: ["dfe-documents", companyId],
    queryFn: async () => {
      if (!companyId) return { documents: [], total: 0 };

      const { data, error } = await supabase.functions.invoke("fetch-dfe", {
        body: { action: "list", company_id: companyId },
      });

      if (error) {
        const errBody = typeof error === "object" && "message" in error ? error.message : String(error);
        throw new Error(errBody);
      }

      if (!data?.success) throw new Error(data?.error || "Erro ao buscar documentos");

      const docs = (data.data?.data || []).map((d: any) => ({
        id: d.id,
        chave: d.chave || d.chNFe || "",
        tipo_documento: d.tipo_documento || d.schema || "NF-e",
        numero: d.numero || 0,
        serie: d.serie || 0,
        data_emissao: d.data_emissao || d.dh_emissao || "",
        valor_total: d.valor_total || d.vNF || 0,
        cnpj_emitente: d.cnpj_emitente || "",
        nome_emitente: d.nome_emitente || "",
        situacao: d.situacao || "",
        nsu: d.nsu || 0,
        schema: d.schema || "",
        tipo_nfe: d.tipo_nfe,
      }));

      return {
        documents: docs as DFeDocument[],
        total: data.data?.["@count"] || docs.length,
      };
    },
    enabled: !!companyId,
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
      toast.success("Distribuição solicitada! Aguarde alguns segundos e atualize a lista.");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dfe-documents"] });
      }, 5000);
    } catch (e: any) {
      toast.error(e.message || "Erro ao solicitar distribuição");
    } finally {
      setIsDistributing(false);
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
    } catch (e: any) {
      toast.error(e.message || "Erro ao baixar XML");
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
    downloadXml,
  };
}
