-- Cooldown entre e-mails de "pico de erros de app" (evita spam a cada execução do cron).
-- PostgREST com service_role ignora RLS; tabela fica inacessível a anon/authenticated sem policies.

CREATE TABLE IF NOT EXISTS public.health_monitor_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_app_error_email_at timestamptz
);

INSERT INTO public.health_monitor_state (id, last_app_error_email_at)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.health_monitor_state ENABLE ROW LEVEL SECURITY;
