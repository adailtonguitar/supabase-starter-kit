-- ============================================================================
-- Visibilidade de crons + retenção de net._http_response
-- ----------------------------------------------------------------------------
-- Motivação:
--   1) Com vários pg_cron jobs agendados (retention, dunning, fiscal cert,
--      notify-critical-errors), precisamos de um jeito seguro de ver status
--      direto do admin UI, sem precisar entrar no dashboard do Supabase.
--
--   2) net._http_response cresce sem limite (cada pg_net http_post grava linha).
--      Em 57 dias acumulamos centenas de MB. Sem retenção, vira gargalo.
--      Política: 7 dias é suficiente para debug; falhas recentes ficam preservadas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Estende purge_old_logs() para também limpar net._http_response
-- ----------------------------------------------------------------------------
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

  IF to_regclass('public.fiscal_cert_alerts_sent') IS NOT NULL THEN
    DELETE FROM public.fiscal_cert_alerts_sent WHERE sent_at < NOW() - interval '60 days';
    GET DIAGNOSTICS v_deleted_cert_alerts = ROW_COUNT;
  END IF;

  IF to_regclass('public.dunning_events') IS NOT NULL THEN
    DELETE FROM public.dunning_events WHERE created_at < NOW() - interval '730 days';
    GET DIAGNOSTICS v_deleted_dunning_events = ROW_COUNT;
  END IF;

  -- NEW: net._http_response (7 dias)
  -- Exige o schema `net` instalado (pg_net). Idempotente via to_regclass.
  IF to_regclass('net._http_response') IS NOT NULL THEN
    BEGIN
      DELETE FROM net._http_response WHERE created < NOW() - interval '7 days';
      GET DIAGNOSTICS v_deleted_http_responses = ROW_COUNT;
    EXCEPTION WHEN undefined_column THEN
      -- Fallback: pg_net em versões antigas usa coluna `timestamp` ou não tem coluna de tempo
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
   fiscal_cert_alerts_sent (60d), dunning_events (730d), net._http_response (7d).
   Preserva impersonation_logs, notas_recebidas, nfe_documents.';

-- ----------------------------------------------------------------------------
-- 2) RPC público para admin: status dos cron jobs
-- ----------------------------------------------------------------------------
-- cron.job e cron.job_run_details vivem em schema restrito. Sem SECURITY DEFINER
-- o front não consegue ler. Garantimos acesso apenas a super_admin via is_super_admin().
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cron_jobs_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cron, extensions
AS $$
DECLARE
  v_jobs     jsonb;
  v_purges   jsonb;
  v_errors   jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Lista de jobs com último run
  IF to_regclass('cron.job') IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'jobname'), '[]'::jsonb)
    INTO v_jobs
    FROM (
      SELECT jsonb_build_object(
        'jobid',         j.jobid,
        'jobname',       j.jobname,
        'schedule',      j.schedule,
        'active',        j.active,
        'last_start',    r.last_start,
        'last_end',      r.last_end,
        'last_status',   r.last_status,
        'last_duration_ms',
          CASE WHEN r.last_start IS NOT NULL AND r.last_end IS NOT NULL
               THEN EXTRACT(MILLISECONDS FROM (r.last_end - r.last_start))::bigint
               ELSE NULL END,
        'runs_24h',      r.runs_24h,
        'failures_24h',  r.failures_24h
      ) AS x
      FROM cron.job j
      LEFT JOIN LATERAL (
        SELECT
          MAX(jrd.start_time) AS last_start,
          MAX(jrd.end_time)   AS last_end,
          (SELECT status FROM cron.job_run_details
            WHERE jobid = j.jobid
            ORDER BY start_time DESC NULLS LAST LIMIT 1) AS last_status,
          COUNT(*) FILTER (WHERE jrd.start_time >= NOW() - interval '24 hours') AS runs_24h,
          COUNT(*) FILTER (
            WHERE jrd.start_time >= NOW() - interval '24 hours'
              AND jrd.status IN ('failed', 'failure')
          ) AS failures_24h
        FROM cron.job_run_details jrd
        WHERE jrd.jobid = j.jobid
      ) r ON TRUE
    ) t;
  ELSE
    v_jobs := '[]'::jsonb;
  END IF;

  -- Últimos 10 purges de retenção (com quanto deletou)
  IF to_regclass('public.retention_log') IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'executed_at', executed_at,
      'result',      result
    ) ORDER BY executed_at DESC), '[]'::jsonb)
    INTO v_purges
    FROM (
      SELECT executed_at, result FROM public.retention_log
      ORDER BY executed_at DESC
      LIMIT 10
    ) sub;
  ELSE
    v_purges := '[]'::jsonb;
  END IF;

  -- Últimos 5 runs com erro (se houver)
  IF to_regclass('cron.job_run_details') IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'jobname',     j.jobname,
      'start_time',  r.start_time,
      'status',      r.status,
      'return_message', r.return_message
    ) ORDER BY r.start_time DESC), '[]'::jsonb)
    INTO v_errors
    FROM (
      SELECT * FROM cron.job_run_details
      WHERE status IN ('failed', 'failure')
        AND start_time >= NOW() - interval '7 days'
      ORDER BY start_time DESC
      LIMIT 5
    ) r
    JOIN cron.job j ON j.jobid = r.jobid;
  ELSE
    v_errors := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ok',         TRUE,
    'checked_at', NOW(),
    'jobs',       v_jobs,
    'purges',     v_purges,
    'errors',     v_errors
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',    FALSE,
    'error', SQLERRM
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_cron_jobs_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cron_jobs_status() TO authenticated;

COMMENT ON FUNCTION public.get_cron_jobs_status() IS
  'Status consolidado dos pg_cron jobs (último run, duração, falhas 24h) + últimos 10 purges de retenção + últimos 5 erros da última semana. Restrito a super_admin via is_super_admin().';
