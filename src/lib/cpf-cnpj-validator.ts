export function validateDoc(doc: string): { valid: boolean; error?: string } {
  const cleaned = doc.replace(/\D/g, "");
  if (cleaned.length === 11) return validateCPF(cleaned);
  if (cleaned.length === 14) return validateCNPJ(cleaned);
  return { valid: false, error: "Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos" };
}

function validateCPF(cpf: string): { valid: boolean; error?: string } {
  if (/^(\d)\1{10}$/.test(cpf)) return { valid: false, error: "CPF inválido" };
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i)) * (10 - i);
  let remainder = 11 - (sum % 11);
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.charAt(9))) return { valid: false, error: "CPF inválido" };
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i)) * (11 - i);
  remainder = 11 - (sum % 11);
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.charAt(10))) return { valid: false, error: "CPF inválido" };
  return { valid: true };
}

function validateCNPJ(cnpj: string): { valid: boolean; error?: string } {
  if (/^(\d)\1{13}$/.test(cnpj)) return { valid: false, error: "CNPJ inválido" };
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(cnpj.charAt(i)) * weights1[i];
  let remainder = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (remainder !== parseInt(cnpj.charAt(12))) return { valid: false, error: "CNPJ inválido" };
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(cnpj.charAt(i)) * weights2[i];
  remainder = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (remainder !== parseInt(cnpj.charAt(13))) return { valid: false, error: "CNPJ inválido" };
  return { valid: true };
}
