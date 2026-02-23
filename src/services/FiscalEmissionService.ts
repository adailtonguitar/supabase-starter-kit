export class FiscalEmissionService {
  static async downloadPdf(accessKey: string, docType: "nfce" | "nfe") {
    console.warn("[Fiscal] downloadPdf not implemented");
    return { error: "Serviço fiscal não configurado" };
  }
}
