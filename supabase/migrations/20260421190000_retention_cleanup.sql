-- ============================================================================
-- Retenção automática de logs e eventos
-- ----------------------------------------------------------------------------
-- Motivação:
--   Tabelas de log/evento crescem linearmente sem compensação de valor.
--   Sem retenção, índices incham, vacuum fica lento e queries degradam.
--
-- Política adotada (conservadora — mantém muito mais do que LGPD exige):
--   ai_usage               → 90 dias (mantém falhas para debug; apaga sucessos)
--   error_events           → 180 dias (7x "meu último problema" típico)
--   system_errors          → 180 dias (mantém severity='critical' para sempre)
--   fiscal_cert_alerts_sent→  60 dias (só dedup de envio de e-mail; não é legal)
--   dunning_events         → 730 dias (2 anos — obrigação fiscal indireta)
--   impersonation_logs     → SEM RETENÇÃO (audit trail permanente)
--   notas_recebidas        → SEM RETENÇÃO (documento fiscal — 5 anos por lei)
--   nfe_documents          → SEM RETENÇÃO (idem, se existir)
--
-- Execução:
--   Função purge_old_logs() é idempotente e segura (usa to_regclass).
--   Pode ser chamada manualmente ou via pg_cron (ver migration 20260421200000).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.purge_old_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_ai_usage        bigint := 0;
  v_deleted_error_events    bigint := 0;
  v_deleted_system_errors   bigint := 0;
  v_deleted_cert_alerts     bigint := 0;
  v_deleted_dunning_events  bigint := 0;
  v_started_at timestamptz := NOW();
BEGIN
  -- ai_usage: 90d, mantém apenas registros com success=false e casos agregados
  -- Apaga success=TRUE mais antigos que 90d; mantém falhas para análise.
  IF to_regclass('public.ai_usage') IS NOT NULL THEN
    BEGIN
      DELETE FROM public.ai_usage
       WHERE created_at < NOW() - interval '90 days'
         AND COALESCE(success, TRUE) = TRUE;
      GET DIAGNOSTICS v_deleted_ai_usage = ROW_COUNT;
    EXCEPTION WHEN undefined_column THEN
      -- tabela existe mas schema é diferente; apaga só por tempo
      DELETE FROM public.ai_usage
       WHERE created_at < NOW() - interval '90 days';
      GET DIAGNOSTICS v_deleted_ai_usage = ROW_COUNT;
    END;
  END IF;

  -- error_events: 180d
  IF to_regclass('public.error_events') IS NOT NULL THEN
    DELETE FROM public.error_events
     WHERE created_at < NOW() - interval '180 days';
    GET DIAGNOSTICS v_deleted_error_events = ROW_COUNT;
  END IF;

  -- system_errors: 180d, preserva severity='critical'
  IF to_regclass('public.system_errors') IS NOT NULL THEN
    BEGIN
      DELETE FROM public.system_errors
       WHERE created_at < NOW() - interval '180 days'
         AND COALESCE(severity, '') <> 'critical';
      GET DIAGNOSTICS v_deleted_system_errors = ROW_COUNT;
    EXCEPTION WHEN undefined_column THEN
      DELETE FROM public.system_errors
       WHERE created_at < NOW() - interval '180 days';
      GET DIAGNOSTICS v_deleted_system_errors = ROW_COUNT;
    END;
  END IF;

  -- fiscal_cert_alerts_sent: 60d (é dedup de e-mail, não tem valor histórico)
  IF to_regclass('public.fiscal_cert_alerts_sent') IS NOT NULL THEN
    DELETE FROM public.fiscal_cert_alerts_sent
     WHERE sent_at < NOW() - interval '60 days';
    GET DIAGNOSTICS v_deleted_cert_alerts = ROW_COUNT;
  END IF;

  -- dunning_events: 2 anos
  IF to_regclass('public.dunning_events') IS NOT NULL THEN
    DELETE FROM public.dunning_events
     WHERE created_at < NOW() - interval '730 days';
    GET DIAGNOSTICS v_deleted_dunning_events = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok',                      TRUE,
    'started_at',              v_started_at,
    'finished_at',             NOW(),
    'duration_ms',             EXTRACT(MILLISECONDS FROM (NOW() - v_started_at)),
    'deleted_ai_usage',        v_deleted_ai_usage,
    'deleted_error_events',    v_deleted_error_events,
    'deleted_system_errors',   v_deleted_system_errors,
    'deleted_cert_alerts',     v_deleted_cert_alerts,
    'deleted_dunning_events',  v_deleted_dunning_events
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',        FALSE,
    'error',     SQLERRM,
    'started_at',v_started_at
  );
END;
$$;

-- Só super_admin executa (não queremos que usuários comuns chamem)
REVOKE ALL ON FUNCTION public.purge_old_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_logs() TO service_role;

COMMENT ON FUNCTION public.purge_old_logs() IS
  'Retenção automática de logs. Apaga linhas antigas das tabelas ai_usage (90d),
   error_events (180d), system_errors (180d non-critical), fiscal_cert_alerts_sent (60d),
   dunning_events (730d). Retorna jsonb com contagem de linhas deletadas por tabela.
   Preserva impersonation_logs, notas_recebidas, nfe_documents (documentos fiscais/legais).';

-- ============================================================================
-- Tabela de auditoria da própria limpeza (útil para monitorar crescimento)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.retention_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at timestamptz NOT NULL DEFAULT NOW(),
  result jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_retention_log_executed
  ON public.retention_log(executed_at DESC);

ALTER TABLE public.retention_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retention_log_admin_read ON public.retention_log;
CREATE POLICY retention_log_admin_read ON public.retention_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Wrapper que loga o resultado
CREATE OR REPLACE FUNCTION public.purge_old_logs_and_record()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.purge_old_logs();
  INSERT INTO public.retention_log (result) VALUES (v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_logs_and_record() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_logs_and_record() TO service_role;

COMMENT ON FUNCTION public.purge_old_logs_and_record() IS
  'Executa purge_old_logs() e registra o resultado em retention_log.
   Use esta função no cron; assim fica fácil auditar quanto foi apagado ao longo do tempo.';
