-- ============================================================================
-- Hotfix: purge_old_logs() usava sent_at, mas fiscal_cert_alerts_sent
-- tem coluna notified_at. Torna o bloco resiliente a qualquer uma das duas
-- colunas (algumas instalações podem ter criado schemas diferentes).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.purge_old_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_ai_usage         bigint := 0;
  v_deleted_error_events     bigint := 0;
  v_deleted_system_errors    bigint := 0;
  v_deleted_cert_alerts      bigint := 0;
  v_deleted_dunning_events   bigint := 0;
  v_deleted_http_responses   bigint := 0;
  v_cert_time_col            text;
  v_started_at timestamptz := NOW();
BEGIN
  IF to_regclass('public.ai_usage') IS NOT NULL THEN
    BEGIN
      DELETE FROM public.ai_usage
       WHERE created_at < NOW() - interval '90 days'
         AND COALESCE(success, TRUE) = TRUE;
      GET DIAGNOSTICS v_deleted_ai_usage = ROW_COUNT;
    EXCEPTION WHEN undefined_column THEN
      DELETE FROM public.ai_usage WHERE created_at < NOW() - interval '90 days';
      GET DIAGNOSTICS v_deleted_ai_usage = ROW_COUNT;
    END;
  END IF;

  IF to_regclass('public.error_events') IS NOT NULL THEN
    DELETE FROM public.error_events WHERE created_at < NOW() - interval '180 days';
    GET DIAGNOSTICS v_deleted_error_events = ROW_COUNT;
  END IF;

  IF to_regclass('public.system_errors') IS NOT NULL THEN
    BEGIN
      DELETE FROM public.system_errors
       WHERE created_at < NOW() - interval '180 days'
         AND COALESCE(severity, '') <> 'critical';
      GET DIAGNOSTICS v_deleted_system_errors = ROW_COUNT;
    EXCEPTION WHEN undefined_column THEN
      DELETE FROM public.system_errors WHERE created_at < NOW() - interval '180 days';
      GET DIAGNOSTICS v_deleted_system_errors = ROW_COUNT;
    END;
  END IF;

  -- fiscal_cert_alerts_sent: detecta coluna de tempo dinamicamente
  -- (schema real usa notified_at; algumas variantes usam sent_at ou created_at).
  IF to_regclass('public.fiscal_cert_alerts_sent') IS NOT NULL THEN
    SELECT column_name INTO v_cert_time_col
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'fiscal_cert_alerts_sent'
        AND column_name IN ('notified_at', 'sent_at', 'created_at')
      ORDER BY array_position(ARRAY['notified_at','sent_at','created_at'], column_name)
      LIMIT 1;

    IF v_cert_time_col IS NOT NULL THEN
      EXECUTE format(
        'DELETE FROM public.fiscal_cert_alerts_sent WHERE %I < NOW() - interval ''60 days''',
        v_cert_time_col
      );
      GET DIAGNOSTICS v_deleted_cert_alerts = ROW_COUNT;
    END IF;
  END IF;

  IF to_regclass('public.dunning_events') IS NOT NULL THEN
    DELETE FROM public.dunning_events WHERE created_at < NOW() - interval '730 days';
    GET DIAGNOSTICS v_deleted_dunning_events = ROW_COUNT;
  END IF;

  -- net._http_response (7 dias). pg_net versões recentes têm coluna `created`.
  IF to_regclass('net._http_response') IS NOT NULL THEN
    BEGIN
      DELETE FROM net._http_response WHERE created < NOW() - interval '7 days';
      GET DIAGNOSTICS v_deleted_http_responses = ROW_COUNT;
    EXCEPTION WHEN undefined_column THEN
      BEGIN
        DELETE FROM net._http_response WHERE id < (
          SELECT COALESCE(MAX(id), 0) - 100000 FROM net._http_response
        );
        GET DIAGNOSTICS v_deleted_http_responses = ROW_COUNT;
      EXCEPTION WHEN OTHERS THEN
        v_deleted_http_responses := 0;
      END;
    WHEN insufficient_privilege THEN
      v_deleted_http_responses := 0;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok',                        TRUE,
    'started_at',                v_started_at,
    'finished_at',               NOW(),
    'duration_ms',               EXTRACT(MILLISECONDS FROM (NOW() - v_started_at)),
    'deleted_ai_usage',          v_deleted_ai_usage,
    'deleted_error_events',      v_deleted_error_events,
    'deleted_system_errors',     v_deleted_system_errors,
    'deleted_cert_alerts',       v_deleted_cert_alerts,
    'deleted_dunning_events',    v_deleted_dunning_events,
    'deleted_http_responses',    v_deleted_http_responses
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',         FALSE,
    'error',      SQLERRM,
    'started_at', v_started_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_logs() TO service_role;

COMMENT ON FUNCTION public.purge_old_logs() IS
  'Retenção automática: ai_usage (90d), error_events (180d), system_errors (180d non-critical),
   fiscal_cert_alerts_sent (60d — detecta coluna notified_at/sent_at/created_at dinamicamente),
   dunning_events (730d), net._http_response (7d).
   Preserva impersonation_logs, notas_recebidas, nfe_documents.';
