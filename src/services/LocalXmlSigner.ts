/**
 * LocalXmlSigner — Formerly used for signing NFC-e XML locally.
 * DEPRECATED: Local signing and certificate caching disabled.
 */

export async function storeCertificateA1(
  pfxArrayBuffer: ArrayBuffer,
  password: string,
  companyId: string
): Promise<{ success: boolean; error?: string; subject?: string; expiresAt?: string }> {
  return { success: false, error: "Armazenamento local de certificados desativado." };
}

export async function getStoredCertificateA1(companyId: string): Promise<any | null> {
  return null;
}

export async function hasCertificateA1(companyId: string): Promise<boolean> {
  return false;
}

export async function signNfceXml(xml: string, companyId: string): Promise<string> {
  throw new Error("Assinatura local desativada. Use o processamento em nuvem.");
}

export function buildContingencyNfceXml(params: any): string {
  return "";
}
