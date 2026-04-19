/**
 * Hard validation de dados de empresa antes de emissão fiscal.
 *
 * REGRA: NUNCA permitir emissão com dados incompletos.
 * NÃO altera XML, assinatura, cálculos ou regras fiscais.
 * Apenas bloqueia (throw) quando faltam dados críticos do cadastro real.
 */

const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const isNonEmpty = (v: unknown) => String(v ?? "").trim().length > 0;

/**
 * Resolve o melhor valor não vazio entre múltiplas colunas equivalentes
 * (legacy + novo schema). NÃO usa fallback fictício ("MA", "00000000", etc.).
 */
function pickReal(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

export interface CompanyHardValidationResult {
  cnpj: string;
  state: string;
  city: string;
  zip: string;
  street: string;
  number: string;
  neighborhood: string;
  ie: string;
  crt: number;
}

export function validateCompanyData(
  company: Record<string, any> | null | undefined,
  context: { company_id?: string; flow?: string } = {},
): CompanyHardValidationResult {
  const flow = context.flow || "emit";
  const company_id = context.company_id || (company as any)?.id;

  if (!company || typeof company !== "object") {
    console.log({ type: "COMPANY_VALIDATION_ERROR", flow, company_id, error: "company_not_loaded" });
    throw new Error("Cadastro da empresa não localizado. Atualize os dados em Configurações > Empresa.");
  }

  const cnpj = onlyDigits(company.cnpj);
  const ie = onlyDigits(company.ie ?? company.state_registration);
  const state = pickReal(company.state, company.address_state).toUpperCase();
  const city = pickReal(company.city, company.address_city);
  const zip = onlyDigits(pickReal(company.zip_code, company.address_zip, company.cep));
  const street = pickReal(company.street, company.address_street, company.address);
  const number = pickReal(company.number, company.address_number);
  const neighborhood = pickReal(company.neighborhood, company.address_neighborhood);
  const crtRaw = company.crt;
  const crt = Number(crtRaw);

  const missing: string[] = [];
  if (cnpj.length !== 14) missing.push("CNPJ");
  if (!isNonEmpty(company.name)) missing.push("Razão Social");
  if (ie.length < 2) missing.push("Inscrição Estadual (IE)");
  if (!Number.isFinite(crt) || crt < 1 || crt > 3) missing.push("Regime Tributário (CRT)");
  if (state.length !== 2) missing.push("UF");
  if (!city) missing.push("Cidade");
  if (zip.length !== 8) missing.push("CEP");
  if (!street) missing.push("Endereço (rua)");
  if (!number) missing.push("Número");
  if (!neighborhood) missing.push("Bairro");

  if (missing.length > 0) {
    const error = `Cadastro da empresa incompleto. Campos obrigatórios faltando: ${missing.join(", ")}. Acesse Configurações > Empresa e complete o cadastro antes de emitir.`;
    console.log({ type: "COMPANY_VALIDATION_ERROR", flow, company_id, missing, error });
    throw new Error(error);
  }

  console.log({ type: "COMPANY_VALIDATION_OK", flow, company_id, cnpj, state, crt });

  return { cnpj, state, city, zip, street, number, neighborhood, ie, crt };
}

export function validateCertificatePresent(
  cert: { base64?: string | null; password?: string | null } | null | undefined,
  context: { company_id?: string; flow?: string } = {},
): { base64: string; password: string } {
  const flow = context.flow || "emit";
  const company_id = context.company_id;
  if (!cert || !cert.base64 || !cert.password) {
    console.log({ type: "CERTIFICATE_VALIDATION_ERROR", flow, company_id, error: "certificate_missing" });
    throw new Error(
      "Certificado digital A1 não configurado para esta empresa. Acesse Fiscal > Configuração e faça o upload do certificado (.pfx) com a senha.",
    );
  }
  console.log({ type: "CERTIFICATE_VALIDATION_OK", flow, company_id });
  return { base64: cert.base64, password: cert.password };
}
