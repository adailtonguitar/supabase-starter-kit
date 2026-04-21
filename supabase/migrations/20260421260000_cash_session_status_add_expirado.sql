-- ============================================================================
-- Adiciona valor 'expirado' ao enum cash_session_status
-- ----------------------------------------------------------------------------
-- Motivação:
--   O cron auto_expire_stale_cash_sessions() tenta marcar caixas abertos há
--   mais de 24h como 'expirado', mas o enum só tem 'aberto'/'fechado',
--   causando falha "invalid input value for enum" de hora em hora.
--
--   Adicionamos como valor distinto (em vez de reutilizar 'fechado') para
--   preservar a semântica de auditoria — uma sessão expirada é diferente de
--   uma fechada manualmente pelo operador, e isso aparecerá em relatórios.
--
--   O frontend hoje só compara com 'aberto' e 'fechado' (grep feito):
--     src/pages/{Caixa,PDV,Terminais,FluxoCaixaProjetado}.tsx
--     src/services/CashSessionService.ts, hooks/pdv/usePDVSession.tsx,
--     components/pos/CashRegister.tsx
--   Nenhum deles depende do valor 'expirado' ainda, então a adição é
--   retrocompatível. Em follow-up, o dashboard de Caixa pode exibir badge
--   específica para sessões auto-expiradas.
--
-- Observação técnica:
--   ALTER TYPE ... ADD VALUE precisa commitar antes de ser usado. Por isso
--   a atualização da função auto_expire_stale_cash_sessions() fica em
--   migration separada (20260421270000).
-- ============================================================================

DO $$
BEGIN
  -- Só age se o tipo realmente for enum (instalações antigas podem usar CHECK text)
  IF EXISTS (
    SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
       AND t.typname = 'cash_session_status'
       AND t.typtype = 'e'
  ) THEN
    ALTER TYPE public.cash_session_status ADD VALUE IF NOT EXISTS 'expirado';
  END IF;
END$$;
