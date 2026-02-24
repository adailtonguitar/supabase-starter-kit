import { supabase } from "@/integrations/supabase/client";

export class FiscalEmissionService {
  static async downloadPdf(accessKey: string, docType: "nfce" | "nfe") {
    try {
      const { data, error } = await supabase.functions.invoke("emit-nfce", {
        body: { action: "download_pdf", access_key: accessKey, doc_type: docType },
      });
      if (error) return { error: error.message };
      return data;
    } catch (err: any) {
      return { error: err?.message || "Erro ao baixar PDF" };
    }
  }

  static async cancelDocument(params: {
    accessKey?: string;
    fiscalDocId?: string;
    saleId?: string;
    docType: "nfce" | "nfe";
    justificativa: string;
    nuvemFiscalId?: string;
  }) {
    try {
      const { data, error } = await supabase.functions.invoke("emit-nfce", {
        body: {
          action: "cancel",
          access_key: params.accessKey,
          fiscal_doc_id: params.fiscalDocId,
          sale_id: params.saleId,
          doc_type: params.docType,
          doc_id: params.nuvemFiscalId,
          justificativa: params.justificativa,
        },
      });
      if (error) return { success: false, error: error.message };
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || "Erro ao cancelar documento" };
    }
  }
}
