-- ============================================================
-- Cron job para reprocessar automaticamente itens pendentes
-- na fila fiscal (fiscal_queue) a cada 1 minuto.
-- Isso garante que vendas cujo polling do PDV foi interrompido
-- (ex: aba fechada, queda de internet) não fiquem travadas.
-- Execute este SQL no Supabase SQL Editor.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remover job antigo (2 min) se existir
SELECT cron.unschedule('fiscal-queue-retry');

-- Reprocessar itens pending a cada 1 minuto
SELECT cron.schedule(
  'fiscal-queue-retry',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-fiscal-queue',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
