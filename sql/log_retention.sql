-- =====================================================
-- Retenção Automática de Logs (Cron)
-- Arquiva logs com mais de 90 dias
-- Execute no Supabase SQL Editor
-- =====================================================

-- 1. Tabela de arquivo de logs antigos
CREATE TABLE IF NOT EXISTS public.action_logs_archive (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,
  user_id UUID,
  action TEXT NOT NULL,
  module TEXT,
  details TEXT,
  user_name TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.action_logs_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "archive_admin_select" ON public.action_logs_archive
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_archive_company ON public.action_logs_archive(company_id);
CREATE INDEX IF NOT EXISTS idx_archive_created ON public.action_logs_archive(created_at DESC);

-- 2. Função de arquivamento
CREATE OR REPLACE FUNCTION public.archive_old_action_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff TIMESTAMPTZ := now() - INTERVAL '90 days';
  moved INT;
BEGIN
  -- Move logs antigos para archive
  INSERT INTO action_logs_archive (id, company_id, user_id, action, module, details, user_name, created_at)
  SELECT id, company_id, user_id, action, module, details, user_name, created_at
  FROM action_logs
  WHERE created_at < cutoff
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS moved = ROW_COUNT;

  -- Remove da tabela principal
  DELETE FROM action_logs WHERE created_at < cutoff;

  RAISE NOTICE 'Archived % action_logs older than 90 days', moved;
END;
$$;

-- 3. Cron job (requer pg_cron habilitado)
-- Executa todo domingo às 3h da manhã
SELECT cron.schedule(
  'archive-old-logs',
  '0 3 * * 0',
  $$SELECT public.archive_old_action_logs()$$
);

-- 4. Retenção de system_errors (180 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_system_errors()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM system_errors WHERE created_at < now() - INTERVAL '180 days';
END;
$$;

SELECT cron.schedule(
  'cleanup-old-errors',
  '0 4 * * 0',
  $$SELECT public.cleanup_old_system_errors()$$
);
