-- ============================================================================
-- Rate limit server-side: última defesa contra abuso / tokens comprometidos
-- ============================================================================
-- O rate-limit client-side já existente (src/lib/rate-limiter.ts) evita que
-- um admin honesto inunde o backend por engano. Mas um token vazado, um bot
-- ou um cliente modificado pode simplesmente ignorar o limitador JS.
--
-- Esta camada é atômica e no PostgreSQL, via SECURITY DEFINER RPC. Cada Edge
-- Function crítica chama check_rate_limit() antes de processar e retorna 429
-- se estourar. Failures dessa RPC caem pro lado seguro (fail-open) pra não
-- derrubar o produto em caso de deadlock.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id         bigserial PRIMARY KEY,
  key        text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_key_created
  ON public.rate_limit_hits (key, created_at DESC);

-- Purge rápido do que já saiu da janela útil (housekeeping interno).
CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_created_at
  ON public.rate_limit_hits (created_at);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: só service role acessa (via RPC SECURITY DEFINER).

COMMENT ON TABLE public.rate_limit_hits IS
  'Hits de rate-limit server-side por chave (user:<id>:<scope>). Usado pela RPC check_rate_limit(). Retenção: 1h via purge_old_logs().';

-- ============================================================================
-- RPC: check_rate_limit(key, capacity, window_seconds) -> jsonb
-- ============================================================================
-- Implementa sliding window simples:
--   1. Conta hits na janela [now() - window, now()] pra key
--   2. Se >= capacity, retorna allowed=false + retry_after do hit mais antigo
--   3. Senão, insere o hit atual e retorna allowed=true
--
-- Retorno: { allowed, current, capacity, retry_after_seconds }
-- ============================================================================
-- Drop qualquer assinatura anterior (versões com return type diferente).
DO $$
DECLARE
  v_sig text;
BEGIN
  FOR v_sig IN
    SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'check_rate_limit'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', v_sig);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key             text,
  p_capacity        int,
  p_window_seconds  int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since        timestamptz;
  v_count        int;
  v_oldest       timestamptz;
  v_retry_after  int;
BEGIN
  IF p_key IS NULL OR p_key = '' THEN
    RETURN jsonb_build_object('allowed', true, 'current', 0, 'capacity', p_capacity, 'retry_after_seconds', 0);
  END IF;
  IF p_capacity <= 0 OR p_window_seconds <= 0 THEN
    RETURN jsonb_build_object('allowed', true, 'current', 0, 'capacity', p_capacity, 'retry_after_seconds', 0);
  END IF;

  v_since := NOW() - make_interval(secs => p_window_seconds);

  SELECT COUNT(*), MIN(created_at)
    INTO v_count, v_oldest
    FROM public.rate_limit_hits
   WHERE key = p_key
     AND created_at > v_since;

  IF v_count >= p_capacity THEN
    v_retry_after := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_oldest + make_interval(secs => p_window_seconds) - NOW())))::int
    );
    RETURN jsonb_build_object(
      'allowed',              false,
      'current',              v_count,
      'capacity',             p_capacity,
      'retry_after_seconds',  v_retry_after
    );
  END IF;

  INSERT INTO public.rate_limit_hits (key) VALUES (p_key);

  RETURN jsonb_build_object(
    'allowed',              true,
    'current',              v_count + 1,
    'capacity',             p_capacity,
    'retry_after_seconds',  0
  );
END;
$$;

COMMENT ON FUNCTION public.check_rate_limit(text, int, int) IS
  'Sliding-window rate limiter atômico. Retorna {allowed, current, capacity, retry_after_seconds}. Falhas tratadas como fail-open nas Edge Functions.';

REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;

-- ============================================================================
-- purge_old_logs(): adiciona limpeza de rate_limit_hits (> 1h)
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
  v_deleted_rate_hits        bigint := 0;
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

  -- rate_limit_hits: janela máxima é 1h, então 2h de colchão é suficiente.
  IF to_regclass('public.rate_limit_hits') IS NOT NULL THEN
    DELETE FROM public.rate_limit_hits WHERE created_at < NOW() - interval '2 hours';
    GET DIAGNOSTICS v_deleted_rate_hits = ROW_COUNT;
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
    'deleted_http_responses',    v_deleted_http_responses,
    'deleted_rate_hits',         v_deleted_rate_hits
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
   dunning_events (730d), net._http_response (7d), rate_limit_hits (2h).
   Preserva impersonation_logs, notas_recebidas, nfe_documents.';
