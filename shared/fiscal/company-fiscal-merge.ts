/** Normaliza dígitos para checagem de CNPJ/IE. */
export function fiscalDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function strTrim(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Filial: completa CNPJ, IE, CRT e endereço fiscal a partir da matriz quando vazios na filial.
 */
export function mergeChildCompanyWithParentFiscal(
  child: Record<string, unknown>,
  parent: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const row = { ...child };
  if (!parent) return row;

  const childCnpj = fiscalDigits(row.cnpj);
  const parentCnpj = fiscalDigits(parent.cnpj);
  if (childCnpj.length < 14 && parentCnpj.length >= 14) {
    row.cnpj = parent.cnpj;
  }

  const childIeOk =
    fiscalDigits(row.ie).length >= 2 || fiscalDigits(row.state_registration).length >= 2;
  if (!childIeOk && fiscalDigits(parent.ie).length >= 2) {
    row.ie = parent.ie;
  }

  const childCrt = Number(row.crt ?? 0);
  const parentCrt = Number(parent.crt ?? 0);
  if ((!childCrt || childCrt === 0) && parentCrt > 0) {
    row.crt = parent.crt;
  }

  const addrKeys = [
    "address_street",
    "address_number",
    "address_neighborhood",
    "address_city",
    "address_state",
    "address_zip",
    "address_ibge_code",
  ] as const;

  for (const key of addrKeys) {
    if (strTrim(row[key])) continue;
    if (strTrim(parent[key])) row[key] = parent[key];
  }

  return row;
}

/** Mínimo para checagens de prontidão da empresa (após merges matriz→filial). */
export function companyRowMeetsReadinessBasics(row: Record<string, unknown>): boolean {
  if (fiscalDigits(row.cnpj).length < 14) return false;
  const ieOk =
    fiscalDigits(row.ie).length >= 2 || fiscalDigits(row.state_registration).length >= 2;
  if (!ieOk) return false;
  if (!Number(row.crt || 0)) return false;
  const street = strTrim(row.address_street || row.street);
  const city = strTrim(row.address_city || row.city);
  const state = strTrim(row.address_state || row.state);
  if (!street || !city || !state) return false;
  const ibge = fiscalDigits(row.address_ibge_code ?? row.ibge_code ?? row.city_code);
  if (ibge.length < 7) return false;
  return true;
}
