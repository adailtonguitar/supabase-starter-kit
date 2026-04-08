/** Normaliza dígitos para checagem de CNPJ/IE. */
export function fiscalDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function strTrim(v: unknown): string {
  return String(v ?? "").trim();
}

/** Se o campo `cnpj` está vazio, tenta extrair máscara XX.XXX.XXX/XXXX-XX de name/trade_name. */
export function supplementCnpjFromRowTextFields(row: Record<string, unknown>): Record<string, unknown> {
  if (fiscalDigits(row.cnpj).length >= 14) return row;
  for (const field of [row.name, row.trade_name]) {
    const h = String(field ?? "");
    const re = /\b(\d{2})\D*(\d{3})\D*(\d{3})\D*(\d{4})\D*(\d{2})\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(h)) !== null) {
      const d = m[1] + m[2] + m[3] + m[4] + m[5];
      if (d.length === 14) return { ...row, cnpj: d };
    }
  }
  return row;
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

  const parentNorm = supplementCnpjFromRowTextFields({ ...parent });

  const childCnpj = fiscalDigits(row.cnpj);
  const parentCnpj = fiscalDigits(parentNorm.cnpj);
  if (childCnpj.length < 14 && parentCnpj.length >= 14) {
    row.cnpj = parentNorm.cnpj;
  }

  const childIeOk =
    fiscalDigits(row.ie).length >= 2 || fiscalDigits(row.state_registration).length >= 2;
  if (!childIeOk) {
    if (fiscalDigits(parentNorm.ie).length >= 2) {
      row.ie = parentNorm.ie;
    } else if (fiscalDigits(parentNorm.state_registration).length >= 2) {
      row.ie = parentNorm.state_registration;
    }
  }

  const childCrt = Number(row.crt ?? 0);
  const parentCrt = Number(parentNorm.crt ?? 0);
  if ((!childCrt || childCrt === 0) && parentCrt > 0) {
    row.crt = parentNorm.crt;
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
    if (strTrim(parentNorm[key])) row[key] = parentNorm[key];
  }

  return row;
}

/** CNPJ com 14 dígitos na linha (campo ou texto tipo razão social). */
export function peerRowHasCnpj14(row: Record<string, unknown>): boolean {
  if (fiscalDigits(row.cnpj).length >= 14) return true;
  const patched = supplementCnpjFromRowTextFields({ ...row });
  return fiscalDigits(patched.cnpj).length >= 14;
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

/**
 * Escolhe empresa "doadora" para merge matriz→filial: antes só entrava quem passava em
 * companyRowMeetsReadinessBasics (CNPJ+IE+CRT+end+IBGE), e a matriz muitas vezes tem só CNPJ.
 */
export function pickPeerDonorForFiscalMerge(
  currentCompanyId: string,
  activeIds: string[],
  peerRows: Record<string, unknown>[],
  map: Map<string, Record<string, unknown>>,
): Record<string, unknown> | null {
  const isDirectlyLinked = (a: string, b: string): boolean => {
    const ca = map.get(a);
    const cb = map.get(b);
    if (!ca || !cb) return false;
    return String(ca.parent_company_id || "") === b || String(cb.parent_company_id || "") === a;
  };

  const basicsOk = peerRows.filter((p) => companyRowMeetsReadinessBasics(p));
  const linkedBasics = basicsOk.find((p) => isDirectlyLinked(currentCompanyId, String(p.id ?? "")));
  if (linkedBasics) return linkedBasics;

  const cnpjOk = peerRows.filter((p) => peerRowHasCnpj14(p));
  const linkedCnpj = cnpjOk.find((p) => isDirectlyLinked(currentCompanyId, String(p.id ?? "")));
  if (linkedCnpj) return linkedCnpj;

  if (activeIds.length === 2 && basicsOk.length === 1) return basicsOk[0];
  if (activeIds.length === 2 && cnpjOk.length === 1) return cnpjOk[0];
  if (cnpjOk.length === 1) return cnpjOk[0];

  return null;
}
