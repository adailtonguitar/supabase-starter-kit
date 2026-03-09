-- Monitoramento de Uptime — Health Check a cada 5 minutos
-- Execute no Supabase SQL Editor

-- 1. Criar tabela de logs
create table if not exists public.uptime_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  status text not null check (status in ('ok', 'degraded', 'critical')),
  checks jsonb,
  total_latency_ms integer,
  failed_services text[] default '{}'
);

-- RLS: apenas service_role e super_admin leem
alter table public.uptime_logs enable row level security;

create policy "Super admin reads uptime_logs"
  on public.uptime_logs for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin')
  );

-- 2. Habilitar extensões
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3. Cron job a cada 5 minutos
select cron.schedule(
  'health-check-5min',
  '*/5 * * * *',
  $$
  select
    net.http_post(
      url := 'https://fsvxpxziotklbxkivyug.supabase.co/functions/v1/health-check',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- 4. Limpeza automática: manter apenas 30 dias de logs
select cron.schedule(
  'cleanup-uptime-logs',
  '0 3 * * 0',  -- Todo domingo às 3h UTC
  $$
  delete from public.uptime_logs where created_at < now() - interval '30 days';
  $$
);
