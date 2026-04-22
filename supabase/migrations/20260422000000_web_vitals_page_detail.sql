-- ============================================================================
-- Web Vitals: detalhe por rota
-- ============================================================================
-- O RPC get_web_vitals_summary já dá overview + top 20 páginas piores.
-- Este RPC adicional permite "drill-down" numa rota específica com:
--   - overall daquela página (p50/p75/p95 de LCP + p75 dos outros)
--   - timeline por dia da página
--   - breakdown por conexão (4g, 3g, etc)
--   - breakdown por viewport (mobile/tablet/desktop)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_web_vitals_page_detail(
  p_page    text,
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
  v_overall         jsonb;
  v_timeline        jsonb;
  v_by_connection   jsonb;
  v_by_device       jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;

  -- Overall da rota
  SELECT jsonb_build_object(
    'total_samples', COUNT(*),
    'lcp_p50',       percentile_cont(0.50) WITHIN GROUP (ORDER BY lcp)  FILTER (WHERE lcp IS NOT NULL),
    'lcp_p75',       percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp)  FILTER (WHERE lcp IS NOT NULL),
    'lcp_p95',       percentile_cont(0.95) WITHIN GROUP (ORDER BY lcp)  FILTER (WHERE lcp IS NOT NULL),
    'fcp_p75',       percentile_cont(0.75) WITHIN GROUP (ORDER BY fcp)  FILTER (WHERE fcp IS NOT NULL),
    'cls_p75',       percentile_cont(0.75) WITHIN GROUP (ORDER BY cls)  FILTER (WHERE cls IS NOT NULL),
    'inp_p75',       percentile_cont(0.75) WITHIN GROUP (ORDER BY inp)  FILTER (WHERE inp IS NOT NULL),
    'ttfb_p75',      percentile_cont(0.75) WITHIN GROUP (ORDER BY ttfb) FILTER (WHERE ttfb IS NOT NULL)
  )
  INTO v_overall
  FROM public.web_vitals_samples
  WHERE page = p_page
    AND created_at >= p_from_ts
    AND created_at <= p_to_ts;

  -- Timeline por dia (LCP/INP/CLS p75)
  WITH per_day AS (
    SELECT
      date_trunc('day', created_at) AS day,
      COUNT(*)::int AS samples,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp) FILTER (WHERE lcp IS NOT NULL) AS lcp_p75,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY cls) FILTER (WHERE cls IS NOT NULL) AS cls_p75,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY inp) FILTER (WHERE inp IS NOT NULL) AS inp_p75
    FROM public.web_vitals_samples
    WHERE page = p_page
      AND created_at >= p_from_ts
      AND created_at <= p_to_ts
    GROUP BY day
    ORDER BY day ASC
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(per_day.*)), '[]'::jsonb)
  INTO v_timeline
  FROM per_day;

  -- Breakdown por tipo de conexão (4g, 3g, slow-2g, etc)
  WITH per_conn AS (
    SELECT
      COALESCE(NULLIF(connection, ''), 'unknown') AS connection,
      COUNT(*)::int AS samples,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp) FILTER (WHERE lcp IS NOT NULL) AS lcp_p75,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY inp) FILTER (WHERE inp IS NOT NULL) AS inp_p75
    FROM public.web_vitals_samples
    WHERE page = p_page
      AND created_at >= p_from_ts
      AND created_at <= p_to_ts
    GROUP BY 1
    HAVING COUNT(*) >= 2
    ORDER BY samples DESC
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(per_conn.*)), '[]'::jsonb)
  INTO v_by_connection
  FROM per_conn;

  -- Breakdown por classe de device (baseado no viewport_w)
  -- mobile <=640px, tablet <=1024px, desktop >1024px
  WITH per_device AS (
    SELECT
      CASE
        WHEN viewport_w IS NULL        THEN 'unknown'
        WHEN viewport_w <= 640         THEN 'mobile'
        WHEN viewport_w <= 1024        THEN 'tablet'
        ELSE 'desktop'
      END AS device,
      COUNT(*)::int AS samples,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp) FILTER (WHERE lcp IS NOT NULL) AS lcp_p75,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY inp) FILTER (WHERE inp IS NOT NULL) AS inp_p75,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY cls) FILTER (WHERE cls IS NOT NULL) AS cls_p75
    FROM public.web_vitals_samples
    WHERE page = p_page
      AND created_at >= p_from_ts
      AND created_at <= p_to_ts
    GROUP BY 1
    ORDER BY samples DESC
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(per_device.*)), '[]'::jsonb)
  INTO v_by_device
  FROM per_device;

  RETURN jsonb_build_object(
    'page',          p_page,
    'from_ts',       p_from_ts,
    'to_ts',         p_to_ts,
    'overall',       COALESCE(v_overall, '{}'::jsonb),
    'timeline',      v_timeline,
    'by_connection', v_by_connection,
    'by_device',     v_by_device
  );
END;
$$;

COMMENT ON FUNCTION public.get_web_vitals_page_detail(text, timestamptz, timestamptz) IS
  'Detalhe de Web Vitals para uma rota específica. Retorna overall, timeline por dia, breakdown por conexão e por classe de device. Guard: super_admin.';

REVOKE ALL ON FUNCTION public.get_web_vitals_page_detail(text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_web_vitals_page_detail(text, timestamptz, timestamptz) TO authenticated;
