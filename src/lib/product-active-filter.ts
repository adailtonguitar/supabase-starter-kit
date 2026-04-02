/**
 * PostgREST `.or(...)` para listar produtos “visíveis” no app.
 * Linhas legadas com `is_active` NULL eram excluídas por `.eq("is_active", true)`,
 * deixando estoque/PDV/dashboard zerados mesmo com dados no banco.
 */
export const PRODUCTS_ACTIVE_OR_LEGACY_NULL = "is_active.eq.true,is_active.is.null";
