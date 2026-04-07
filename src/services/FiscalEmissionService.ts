import { supabase } from "@/integrations/supabase/client";

type DocType = "nfce" | "nfe";

type FiscalResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
};

function isValidAccessKey(key: string): boolean {
  return /^[0-9]{44}$/.test(key);
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Erro desconhecido";
}

function getFunctionName(docType: DocType): string {
  return "emit-nfce";
}

export class FiscalEmissionService {

  static async downloadPdf(accessKey: string, docType: DocType): Promise<FiscalResponse> {
    if (!isValidAccessKey(accessKey)) {
      return { error: "Chave de acesso inválida" };
    }

    try {
      const { data, error } = await supabase.functions.invoke(getFunctionName(docType), {
        body: { action: "download_pdf", access_key: accessKey, doc_type: docType },
      });

      if (error) return { error: error.message };
      // Keep backward compatibility with callers that expect `pdf_base64` at top-level
      if (data && typeof data === "object") return { success: true, ...(data as Record<string, unknown>) };
      return { success: true, data };
    } catch (err: unknown) {
      return { error: getErrorMessage(err) };
    }
  }

  static async downloadXml(accessKey: string, docType: DocType): Promise<FiscalResponse> {
    if (!isValidAccessKey(accessKey)) {
      return { error: "Chave de acesso inválida" };
    }

    try {
      const { data, error } = await supabase.functions.invoke(getFunctionName(docType), {
        body: { action: "download_xml", access_key: accessKey, doc_type: docType },
      });

      if (error) return { error: error.message };
      return { success: true, data };
    } catch (err: unknown) {
      return { error: getErrorMessage(err) };
    }
  }

  static async cancelDocument(params: {
    accessKey?: string;
    fiscalDocId?: string;
    saleId?: string;
    docType: DocType;
    justificativa: string;
    nuvemFiscalId?: string;
    companyId?: string;
  }): Promise<FiscalResponse> {

    if (!params.justificativa || params.justificativa.length < 15) {
      return { success: false, error: "Justificativa deve ter no mínimo 15 caracteres" };
    }

    if (params.accessKey && !isValidAccessKey(params.accessKey)) {
      return { success: false, error: "Chave de acesso inválida" };
    }

    try {
      const { data, error } = await supabase.functions.invoke(getFunctionName(params.docType), {
        body: {
          action: "cancel",
          access_key: params.accessKey,
          fiscal_doc_id: params.fiscalDocId,
          sale_id: params.saleId,
          doc_type: params.docType,
          doc_id: params.nuvemFiscalId,
          justificativa: params.justificativa,
          company_id: params.companyId,
        },
      });

      if (error) return { success: false, error: error.message };
      if (data && data.success === false) return { success: false, error: data.error || "Erro ao cancelar" };
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  }

  static isCancelDeadlineExpired(createdAt: string, docType: DocType) {
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    const hoursElapsed = (now - created) / (1000 * 60 * 60);

    const CANCEL_LIMITS = {
      nfce: 24,
      nfe: 168,
    };

    const maxHours = CANCEL_LIMITS[docType];

    return {
      expired: hoursElapsed > maxHours,
      hoursElapsed: Math.round(hoursElapsed),
      maxHours,
    };
  }

  static async inutilizeNumbers(params: {
    companyId: string;
    docType: DocType;
    serie: number;
    numeroInicial: number;
    numeroFinal: number;
    justificativa: string;
  }): Promise<FiscalResponse> {

    if (!params.justificativa || params.justificativa.length < 15) {
      return { success: false, error: "Justificativa inválida" };
    }

    try {
      const { data, error } = await supabase.functions.invoke(getFunctionName(params.docType), {
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
      if (data && typeof data === "object" && "success" in data && data.success === false) {
        const responseError = "error" in data && typeof data.error === "string"
          ? (data.error.trim() || "Falha na inutilização fiscal")
          : "Erro ao inutilizar numeração";
        return { success: false, error: responseError, data };
      }
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  }

  static async consultStatus(params: {
    accessKey: string;
    docType: DocType;
    companyId?: string;
  }): Promise<FiscalResponse> {

    if (!isValidAccessKey(params.accessKey)) {
      return { success: false, error: "Chave de acesso inválida" };
    }

    try {
      const { data, error } = await supabase.functions.invoke(getFunctionName(params.docType), {
        body: {
          action: "consult_status",
          access_key: params.accessKey,
          doc_type: params.docType,
          company_id: params.companyId,
        },
      });

      if (error) return { success: false, error: error.message };
      if (data && typeof data === "object") {
        return { success: true, ...(data as Record<string, unknown>) };
      }
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  }

  static async saveXmlToCloud(params: {
    companyId: string;
    accessKey: string;
    docType: DocType;
    number: number;
    xmlContent: string;
  }): Promise<FiscalResponse> {

    if (!params.xmlContent.includes("<NFe") && !params.xmlContent.includes("<nfeProc")) {
      return { success: false, error: "XML inválido" };
    }

    try {
      const safeKey = params.accessKey.replace(/\D/g, "").slice(-8);
      const fileName = `${params.docType}_${params.number}_${safeKey}.xml`;
      const path = `${params.companyId}/xmls/${params.docType}/${fileName}`;

      const blob = new Blob([params.xmlContent], { type: "application/xml" });

      const { error } = await supabase.storage
        .from("company-backups")
        .upload(path, blob, { upsert: true, contentType: "application/xml" });

      if (error) return { success: false, error: error.message };

      return { success: true, data: { path, fileName } };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  }

  static async backupXmls(companyId: string): Promise<FiscalResponse> {
    try {
      const { data, error } = await supabase.functions.invoke("emit-nfce", {
        body: { action: "backup_xmls", company_id: companyId },
      });

      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  }
}