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

  /**
   * Check if a document is within the legal cancellation deadline.
   * NFC-e: 24 hours | NF-e: 720 hours (30 days)
   */
  static isCancelDeadlineExpired(createdAt: string, docType: "nfce" | "nfe"): { expired: boolean; hoursElapsed: number; maxHours: number } {
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    const hoursElapsed = (now - created) / (1000 * 60 * 60);
    const maxHours = docType === "nfce" ? 24 : 720;
    return { expired: hoursElapsed > maxHours, hoursElapsed: Math.round(hoursElapsed), maxHours };
  }

  /**
   * Inutilizar faixa de numeração na SEFAZ.
   */
  static async inutilizeNumbers(params: {
    companyId: string;
    docType: "nfce" | "nfe";
    serie: number;
    numeroInicial: number;
    numeroFinal: number;
    justificativa: string;
  }) {
    try {
      const { data, error } = await supabase.functions.invoke("emit-nfce", {
        body: {
          action: "inutilize",
          company_id: params.companyId,
          doc_type: params.docType,
          serie: params.serie,
          numero_inicial: params.numeroInicial,
          numero_final: params.numeroFinal,
          justificativa: params.justificativa,
        },
      });
      if (error) return { success: false, error: error.message };
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || "Erro ao inutilizar numeração" };
    }
  }

  /**
   * Download XML of a specific document from Nuvem Fiscal.
   */
  static async downloadXml(accessKey: string, docType: "nfce" | "nfe") {
    try {
      const { data, error } = await supabase.functions.invoke("emit-nfce", {
        body: { action: "download_xml", access_key: accessKey, doc_type: docType },
      });
      if (error) return { error: error.message };
      return data;
    } catch (err: any) {
      return { error: err?.message || "Erro ao baixar XML" };
    }
  }

  static async consultStatus(params: {
    accessKey: string;
    docType: "nfce" | "nfe";
    companyId?: string;
  }) {
    try {
      const { data, error } = await supabase.functions.invoke("emit-nfce", {
        body: {
          action: "consult_status",
          access_key: params.accessKey,
          doc_type: params.docType,
          company_id: params.companyId,
        },
      });
      if (error) return { success: false, error: error.message };
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || "Erro ao consultar status na Nuvem Fiscal" };
    }
  }

  /**
   * Save XML to Supabase Storage bucket for the company.
   */
  static async saveXmlToCloud(params: {
    companyId: string;
    accessKey: string;
    docType: "nfce" | "nfe";
    number: number;
    xmlContent: string;
  }) {
    try {
      const fileName = `${params.docType}_${params.number}_${params.accessKey.slice(-8)}.xml`;
      const path = `${params.companyId}/xmls/${params.docType}/${fileName}`;
      const blob = new Blob([params.xmlContent], { type: "application/xml" });
      const { error } = await supabase.storage
        .from("company-backups")
        .upload(path, blob, { upsert: true, contentType: "application/xml" });
      if (error) return { success: false, error: error.message };
      return { success: true, path, fileName };
    } catch (err: any) {
      return { success: false, error: err?.message || "Erro ao salvar XML na nuvem" };
    }
  }

  /**
   * Backup all existing XMLs to Storage bucket.
   */
  static async backupXmls(companyId: string) {
    try {
      const { data, error } = await supabase.functions.invoke("emit-nfce", {
        body: { action: "backup_xmls", company_id: companyId },
      });
      if (error) return { success: false, error: error.message };
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || "Erro ao fazer backup de XMLs" };
    }
  }
}
