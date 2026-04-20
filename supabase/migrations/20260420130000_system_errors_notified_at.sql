-- ============================================================
-- Coluna para rastrear quais erros já foram notificados por e-mail.
-- Evita enviar o mesmo erro 2x em ciclos consecutivos do cron.
-- ============================================================

ALTER TABLE public.system_errors
  ADD COLUMN IF NOT EXISTS notified_at timestamptz NULL;

-- Índice parcial: só indexa erros pendentes de notificação.
-- Mantém o índice pequeno e a query do cron muito rápida.
CREATE INDEX IF NOT EXISTS idx_system_errors_pending_notification
  ON public.system_errors (created_at)
  WHERE notified_at IS NULL;

COMMENT ON COLUMN public.system_errors.notified_at IS
  'Momento em que este erro foi enviado no resumo por e-mail pela function notify-critical-errors. NULL = ainda não notificado.';
