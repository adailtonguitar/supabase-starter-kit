-- Cron job para busca automática de NF-e da SEFAZ (a cada 1 hora)
-- Execute este SQL no Supabase SQL Editor

-- 1. Habilitar extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Criar cron job
SELECT cron.schedule(
  'auto-fetch-dfe-hourly',
  '0 * * * *',  -- a cada hora
  $$
  SELECT
    net.http_post(
      url := 'https://fsvxpxziotklbxkivyug.supabase.co/functions/v1/auto-fetch-dfe',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
