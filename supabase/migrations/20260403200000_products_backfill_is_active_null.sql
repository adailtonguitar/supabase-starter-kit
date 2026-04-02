-- Dados legados: is_active NULL passava a ser tratado como invisível pelo front (.eq true).
-- Normaliza para ativo explícito (idempotente).
UPDATE public.products
SET is_active = true
WHERE is_active IS NULL;
