/** Normaliza dígitos para checagem de CNPJ/IE. */
export function fiscalDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Filial sem CNPJ/IE no cadastro: preenche a partir da matriz.
 * Endereço e demais campos permanecem da filial (PDV/caixa por loja).
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
  if (!childIeOk) {
    if (fiscalDigits(parent.ie).length >= 2) row.ie = parent.ie;
    if (fiscalDigits(parent.state_registration).length >= 2) {
      row.state_registration = parent.state_registration;
    }
  }

  return row;
}
