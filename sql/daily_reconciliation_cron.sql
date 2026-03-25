-- ============================================================
-- Agenda reconciliação diária automática via pg_cron
-- Roda todo dia às 06:00 (após fechamentos noturnos)
-- ============================================================

SELECT cron.schedule(
  'daily-reconciliation',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/daily-reconciliation',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('date', (CURRENT_DATE - INTERVAL '1 day')::date::text)
  );
  $$
);
