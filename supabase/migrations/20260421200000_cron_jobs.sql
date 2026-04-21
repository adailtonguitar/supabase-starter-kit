-- ============================================================================
-- Agendamento de tarefas recorrentes (pg_cron)
-- ----------------------------------------------------------------------------
-- Motivação:
--   As Edge Functions notify-fiscal-certificate, process-dunning e
--   purge_old_logs precisam rodar em horário fixo sem intervenção manual.
--
-- Horários escolhidos (BRT = UTC-3):
--   03:00 UTC → 00:00 BRT  → cleanup_demo_daily (já existia, mantido)
--   04:00 UTC → 01:00 BRT  → retention_purge_weekly (domingo) - low traffic
--   12:00 UTC → 09:00 BRT  → notify_fiscal_certificate_daily
--   13:00 UTC → 10:00 BRT  → process_dunning_daily
--
-- Extensões necessárias: pg_cron (scheduler), pg_net (HTTP async).
-- Ambas já disponíveis em projetos Supabase.
--
-- Funções Edge são chamadas via pg_net (HTTP POST, verify_jwt = false).
-- Não passamos corpo/autenticação: cada função deve ser idempotente.
-- ============================================================================

-- Garante que extensões necessárias estão habilitadas
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- Helper para re-agendar de forma idempotente
CREATE OR REPLACE FUNCTION public._reschedule_cron(
  p_jobname text,
  p_schedule text,
  p_command text
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id bigint;
  v_new_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = p_jobname;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
  SELECT cron.schedule(p_jobname, p_schedule, p_command) INTO v_new_id;
  RETURN v_new_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1) Retenção semanal (domingo 04:00 UTC / 01:00 BRT)
-- ----------------------------------------------------------------------------
SELECT public._reschedule_cron(
  'retention_purge_weekly',
  '0 4 * * 0',                              -- domingo
  'SELECT public.purge_old_logs_and_record();'
);

-- ----------------------------------------------------------------------------
-- 2) Notificação de certificados (diário 12:00 UTC / 09:00 BRT)
-- ----------------------------------------------------------------------------
SELECT public._reschedule_cron(
  'notify_fiscal_certificate_daily',
  '0 12 * * *',
  $net$
  SELECT net.http_post(
    url     := 'https://fsvxpxziotklbxkivyug.supabase.co/functions/v1/notify-fiscal-certificate',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('source', 'pg_cron')
  );
  $net$
);

-- ----------------------------------------------------------------------------
-- 3) Processamento de dunning (diário 13:00 UTC / 10:00 BRT)
-- ----------------------------------------------------------------------------
SELECT public._reschedule_cron(
  'process_dunning_daily',
  '0 13 * * *',
  $net$
  SELECT net.http_post(
    url     := 'https://fsvxpxziotklbxkivyug.supabase.co/functions/v1/process-dunning',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('source', 'pg_cron')
  );
  $net$
);

-- ============================================================================
-- Verificação (rodar manualmente se quiser):
--   SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- ============================================================================
