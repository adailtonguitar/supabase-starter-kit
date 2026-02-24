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
}
