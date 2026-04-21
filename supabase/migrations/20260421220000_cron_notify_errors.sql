-- ============================================================================
-- Cron: notify-critical-errors a cada 15 minutos
-- ----------------------------------------------------------------------------
-- Motivação:
--   A Edge Function notify-critical-errors varre public.system_errors,
--   classifica padrões críticos (payment, fiscal, auth, network, etc) e
--   envia alertas por e-mail (Resend) e/ou webhook externo (Discord/Slack/
--   Telegram).
--
--   Sem agendamento, a função nunca é chamada e os erros ficam parados na
--   tabela sem ninguém ser avisado. Agendar a cada 15 minutos dá um bom
--   equilíbrio entre:
--     - resposta rápida (worst case: 15 min para o admin ser notificado)
--     - evitar spam (agrupamento por fingerprint dentro da função)
--
-- Requisitos para a função funcionar (configurar no Supabase Dashboard →
-- Edge Functions → Secrets):
--   ALERT_DISCORD_WEBHOOK_URL  (opcional — URL do webhook do Discord)
--   ALERT_SLACK_WEBHOOK_URL    (opcional — URL do webhook do Slack)
--   ALERT_TELEGRAM_BOT_TOKEN   (opcional — junto com ALERT_TELEGRAM_CHAT_ID)
--   ALERT_TELEGRAM_CHAT_ID     (opcional)
--   RESEND_API_KEY             (opcional — se já configurado para outros fluxos)
--   ERROR_NOTIFICATION_EMAIL   (opcional — padrão: contato@anthosystem.com.br)
--
-- Se NENHUM canal estiver configurado, a função retorna 500 mas não quebra
-- nada (só os erros ficam acumulando em system_errors até alguém configurar).
-- ============================================================================

SELECT public._reschedule_cron(
  'notify_critical_errors_15min',
  '*/15 * * * *',                            -- a cada 15 minutos
  $net$
  SELECT net.http_post(
    url     := 'https://fsvxpxziotklbxkivyug.supabase.co/functions/v1/notify-critical-errors',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('source', 'pg_cron')
  );
  $net$
);

-- ============================================================================
-- Verificação:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'notify%';
--   SELECT jobname, status, start_time, return_message
--   FROM cron.job_run_details
--   WHERE jobname LIKE 'notify%'
--   ORDER BY start_time DESC LIMIT 10;
-- ============================================================================
