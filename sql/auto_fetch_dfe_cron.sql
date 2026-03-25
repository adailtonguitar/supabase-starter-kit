-- Cron job para busca automática de NF-e da SEFAZ (a cada 1 hora)
-- Execute este SQL no Supabase SQL Editor

-- 1. Habilitar extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Criar cron job
SELECT cron.schedule(
  'auto-fetch-dfe-hourly',
  '0 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://fsvxpxziotklbxkivyug.supabase.co/functions/v1/auto-fetch-dfe',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdnhweHppb3RrbGJ4a2l2eXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODU5NTMsImV4cCI6MjA4NzM2MTk1M30.8I3ABsRZBZuE1IpK_g9z3PdRUd9Omt_F5qNx0Pgqvyo"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
