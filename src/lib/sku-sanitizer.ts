/**
 * SKU Sanitizer — blinda o frontend contra violação do constraint
 * `products_sku_format_chk` no banco.
 *
 * Regras (espelham o constraint do Postgres):
 *   - Apenas A-Z, 0-9 e hífen
 *   - Mínimo 4 caracteres
 *   - Sempre UPPERCASE, sem espaços
 *
 * Se vazio ao salvar → gera AUTO-{UUID-sem-hífens-uppercase} (37 chars).
 */

export const SKU_REGEX = /^[A-Z0-9-]{4,}$/;
export const SKU_ERROR_MESSAGE =
  "SKU deve conter apenas letras maiúsculas, números e hífen (mínimo 4 caracteres)";

/**
 * Normaliza em tempo real (onChange):
 *   - trim
 *   - UPPERCASE
 *   - remove qualquer caractere fora de [A-Z0-9-]
 *
 * NÃO força o mínimo aqui (deixa o usuário continuar digitando).
 */
export function sanitizeSkuInput(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

/**
 * Gera um SKU automático válido quando o campo está vazio no save.
 * Formato: AUTO-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (37 chars).
 */
export function generateAutoSku(): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `AUTO-${uuid.replace(/-/g, "").toUpperCase()}`;
}

/**
 * Pré-save: garante um SKU válido para enviar à API.
 *   - Sanitiza
 *   - Se vazio → gera AUTO-{UUID}
 *   - Se ainda inválido após sanitização → gera AUTO-{UUID} (fallback seguro)
 */
export function ensureValidSku(raw: string | null | undefined): string {
  const cleaned = sanitizeSkuInput(raw);
  if (!cleaned) return generateAutoSku();
  if (!SKU_REGEX.test(cleaned)) return generateAutoSku();
  return cleaned;
}

export function isValidSku(raw: string | null | undefined): boolean {
  return SKU_REGEX.test(sanitizeSkuInput(raw));
}
