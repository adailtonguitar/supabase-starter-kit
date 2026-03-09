-- Agendar relatório diário para rodar às 22h (horário de Brasília = 01:00 UTC do dia seguinte)
-- IMPORTANTE: Execute este SQL manualmente no Supabase SQL Editor
-- Substitua YOUR_ANON_KEY pela anon key do projeto e project-ref pelo ID do projeto

-- 1. Habilitar extensões necessárias
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Criar o cron job
select cron.schedule(
  'daily-report-22h',
  '0 1 * * *',  -- 01:00 UTC = 22:00 BRT
  $$
  select
    net.http_post(
      url := 'https://fsvxpxziotklbxkivyug.supabase.co/functions/v1/daily-report',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);
