-- ============================================================================
-- Web Vitals: amostragem contínua (não só em erros)
-- ============================================================================
-- Hoje os web_vitals são gravados só em system_errors.metadata quando um erro
-- acontece. Isso é viesado: só vemos performance de sessões problemáticas.
-- 
-- Esta migration cria uma tabela dedicada para sampling contínuo. O cliente
-- envia um snapshot no visibilitychange=hidden (final de sessão) via
-- navigator.sendBeacon-equivalent. Retenção 30 dias + agregação rápida via RPC.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.web_vitals_samples (
  id             bigserial PRIMARY KEY,
  user_id        uuid NULL,
  session_id     text NULL,           -- id efêmero pra dedup por sessão
  page           text NOT NULL DEFAULT '/',
  lcp            double precision NULL, -- Largest Contentful Paint (ms)
  fcp            double precision NULL, -- First Contentful Paint  (ms)
  cls            double precision NULL, -- Cumulative Layout Shift (score)
  inp            double precision NULL, -- Interaction to Next Paint (ms)
  ttfb           double precision NULL, -- Time to First Byte       (ms)
  viewport_w     int NULL,
  viewport_h     int NULL,
  dpr            double precision NULL,
  connection     text NULL,             -- effectiveType (4g, 3g, slow-2g, etc)
  url            text NULL,
  user_agent     text NULL,
  created_at     timestamptz NOT NULL DEFAULT NOW()
);

-- Queries típicas: período + página. O índice BRIN seria perfeito pra
-- created_at mas tabela pequena (30d) e queries leves → btree composto basta.
CREATE INDEX IF NOT EXISTS idx_web_vitals_created_page
  ON public.web_vitals_samples (created_at DESC, page);

CREATE INDEX IF NOT EXISTS idx_web_vitals_page_created
  ON public.web_vitals_samples (page, created_at DESC);

ALTER TABLE public.web_vitals_samples ENABLE ROW LEVEL SECURITY;

-- Qualquer sessão (anônima ou autenticada) pode inserir sua própria amostra.
-- user_id pode ser null pra landing pages.
DROP POLICY IF EXISTS wv_samples_insert_anyone ON public.web_vitals_samples;
CREATE POLICY wv_samples_insert_anyone
  ON public.web_vitals_samples FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Se user_id está preenchido, tem que ser o próprio usuário autenticado
    user_id IS NULL OR user_id = auth.uid()
  );

-- Leitura restrita a super_admin (via RPC SECURITY DEFINER, na prática).
DROP POLICY IF EXISTS wv_samples_select_super ON public.web_vitals_samples;
CREATE POLICY wv_samples_select_super
  ON public.web_vitals_samples FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

COMMENT ON TABLE public.web_vitals_samples IS
  'Amostras contínuas de Web Vitals (LCP, FCP, CLS, INP, TTFB). Retenção 30d (via purge_old_logs).';

-- ============================================================================
-- RPC: get_web_vitals_summary — agregação p50/p75/p95 + breakdown por página
-- ============================================================================
-- Retorna:
--   overall:  { total_samples, lcp_p50/p75/p95, ... }
--   by_page:  [{ page, samples, lcp_p75, ... }, ...] ordenado por LCP p75 desc
--   timeline: [{ day, lcp_p75, ... }, ...] nos últimos N dias
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_web_vitals_summary(
  p_from_ts timestamptz DEFAULT (NOW() - INTERVAL '7 days'),
  p_to_ts   timestamptz DEFAULT NOW()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_overall  jsonb;
  v_by_page  jsonb;
  v_timeline jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;

  -- Agregado geral
  SELECT jsonb_build_object(
    'total_samples',      COUNT(*),
    'lcp_p50',            percentile_cont(0.50) WITHIN GROUP (ORDER BY lcp) FILTER (WHERE lcp IS NOT NULL),
    'lcp_p75',            percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp) FILTER (WHERE lcp IS NOT NULL),
    'lcp_p95',            percentile_cont(0.95) WITHIN GROUP (ORDER BY lcp) FILTER (WHERE lcp IS NOT NULL),
    'fcp_p75',            percentile_cont(0.75) WITHIN GROUP (ORDER BY fcp) FILTER (WHERE fcp IS NOT NULL),
    'cls_p75',            percentile_cont(0.75) WITHIN GROUP (ORDER BY cls) FILTER (WHERE cls IS NOT NULL),
    'inp_p75',            percentile_cont(0.75) WITHIN GROUP (ORDER BY inp) FILTER (WHERE inp IS NOT NULL),
    'ttfb_p75',           percentile_cont(0.75) WITHIN GROUP (ORDER BY ttfb) FILTER (WHERE ttfb IS NOT NULL)
  )
  INTO v_overall
  FROM public.web_vitals_samples
  WHERE created_at >= p_from_ts AND created_at <= p_to_ts;

  -- Por página (top 20 piores por LCP p75)
  WITH per_page AS (
    SELECT
      page,
      COUNT(*)::int AS samples,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp)  FILTER (WHERE lcp IS NOT NULL)  AS lcp_p75,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY fcp)  FILTER (WHERE fcp IS NOT NULL)  AS fcp_p75,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY cls)  FILTER (WHERE cls IS NOT NULL)  AS cls_p75,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY inp)  FILTER (WHERE inp IS NOT NULL)  AS inp_p75,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY ttfb) FILTER (WHERE ttfb IS NOT NULL) AS ttfb_p75
    FROM public.web_vitals_samples
    WHERE created_at >= p_from_ts AND created_at <= p_to_ts
    GROUP BY page
    HAVING COUNT(*) >= 3  -- evita ruído de páginas com 1-2 amostras
    ORDER BY lcp_p75 DESC NULLS LAST
    LIMIT 20
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(per_page.*)), '[]'::jsonb)
  INTO v_by_page
  FROM per_page;

  -- Timeline por dia
  WITH per_day AS (
    SELECT
      date_trunc('day', created_at) AS day,
      COUNT(*)::int AS samples,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp)  FILTER (WHERE lcp IS NOT NULL)  AS lcp_p75,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY cls)  FILTER (WHERE cls IS NOT NULL)  AS cls_p75,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY inp)  FILTER (WHERE inp IS NOT NULL)  AS inp_p75
    FROM public.web_vitals_samples
    WHERE created_at >= p_from_ts AND created_at <= p_to_ts
    GROUP BY day
    ORDER BY day ASC
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(per_day.*)), '[]'::jsonb)
  INTO v_timeline
  FROM per_day;

  RETURN jsonb_build_object(
    'from_ts',  p_from_ts,
    'to_ts',    p_to_ts,
    'overall',  COALESCE(v_overall, '{}'::jsonb),
    'by_page',  v_by_page,
    'timeline', v_timeline
  );
END;
$$;

COMMENT ON FUNCTION public.get_web_vitals_summary(timestamptz, timestamptz) IS
  'Agrega web_vitals_samples em p50/p75/p95 + breakdown por página + timeline. Guard: super_admin.';

REVOKE ALL ON FUNCTION public.get_web_vitals_summary(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_web_vitals_summary(timestamptz, timestamptz) TO authenticated;

-- ============================================================================
-- purge_old_logs(): adiciona limpeza de web_vitals_samples (> 30 dias)
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
  v_deleted_web_vitals       bigint := 0;
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

  IF to_regclass('public.rate_limit_hits') IS NOT NULL THEN
    DELETE FROM public.rate_limit_hits WHERE created_at < NOW() - interval '2 hours';
    GET DIAGNOSTICS v_deleted_rate_hits = ROW_COUNT;
  END IF;

  IF to_regclass('public.web_vitals_samples') IS NOT NULL THEN
    DELETE FROM public.web_vitals_samples WHERE created_at < NOW() - interval '30 days';
    GET DIAGNOSTICS v_deleted_web_vitals = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok',                     TRUE,
    'started_at',             v_started_at,
    'finished_at',            NOW(),
    'duration_ms',            EXTRACT(MILLISECONDS FROM (NOW() - v_started_at)),
    'deleted_ai_usage',       v_deleted_ai_usage,
    'deleted_error_events',   v_deleted_error_events,
    'deleted_system_errors',  v_deleted_system_errors,
    'deleted_cert_alerts',    v_deleted_cert_alerts,
    'deleted_dunning_events', v_deleted_dunning_events,
    'deleted_http_responses', v_deleted_http_responses,
    'deleted_rate_hits',      v_deleted_rate_hits,
    'deleted_web_vitals',     v_deleted_web_vitals
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
   fiscal_cert_alerts_sent (60d), dunning_events (730d), net._http_response (7d),
   rate_limit_hits (2h), web_vitals_samples (30d).
   Preserva impersonation_logs, notas_recebidas, nfe_documents, admin_role_audit.';
