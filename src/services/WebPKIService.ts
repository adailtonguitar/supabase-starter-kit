// WebPKI / Local Signer Service stub for A3 certificate support

export interface CertificateInfo {
  thumbprint: string;
  subjectName: string;
  issuerName: string;
  validFrom: string;
  validTo: string;
  pkiBrazil?: {
    cnpj?: string;
    cpf?: string;
  };
}

class LocalSignerService {
  error: string | null = null;

  async checkConnection(): Promise<boolean> {
    this.error = "Assinador local não configurado";
    return false;
  }

  async listCertificates(): Promise<CertificateInfo[]> {
    return [];
  }

  async signData(_thumbprint: string, _data: string): Promise<string> {
    throw new Error("Assinador local não configurado");
  }
}

export const localSignerService = new LocalSignerService();
