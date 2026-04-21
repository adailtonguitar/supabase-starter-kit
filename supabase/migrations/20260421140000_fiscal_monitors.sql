-- =====================================================================
-- Task #9 - Fiscal monitors
--   1. get_certificate_alerts(): lista certificados vencendo / vencidos
--   2. get_fiscal_rejection_dashboard(): agrega rejeições (nfe_documents)
--   3. tabela fiscal_cert_alerts_sent para evitar e-mails duplicados
-- =====================================================================

-- Garante que as colunas usadas existam (idempotente; ambas podem ter vindo
-- de migrations aplicadas pelo dashboard do Supabase).
ALTER TABLE public.fiscal_configs
  ADD COLUMN IF NOT EXISTS certificate_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS certificate_expiry timestamptz,
  ADD COLUMN IF NOT EXISTS certificate_file_name text;

-- nfe_documents é opcional: pode não existir em instalações que só importam NF-e.
DO $$
BEGIN
  IF to_regclass('public.nfe_documents') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.nfe_documents
             ADD COLUMN IF NOT EXISTS rejection_reason text';
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_fiscal_configs_cert_exp
  ON public.fiscal_configs (
    COALESCE(certificate_expires_at, certificate_expiry)
  );

-- ---------------------------------------------------------------------
-- 1. RPC get_certificate_alerts(p_days)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_certificate_alerts(p_days int DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := public.is_super_admin();
  v_user uuid := auth.uid();
  v_cutoff timestamptz := NOW() + (GREATEST(p_days, 0) || ' days')::interval;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'company_id',     fc.company_id,
      'company_name',   c.name,
      'doc_type',       fc.doc_type,
      'environment',    fc.environment,
      'file_name',      fc.certificate_file_name,
      'expires_at',     COALESCE(fc.certificate_expires_at, fc.certificate_expiry),
      'days_remaining', EXTRACT(DAY FROM (COALESCE(fc.certificate_expires_at, fc.certificate_expiry) - NOW()))::int,
      'status', CASE
        WHEN COALESCE(fc.certificate_expires_at, fc.certificate_expiry) IS NULL THEN 'missing'
        WHEN COALESCE(fc.certificate_expires_at, fc.certificate_expiry) < NOW() THEN 'expired'
        WHEN COALESCE(fc.certificate_expires_at, fc.certificate_expiry) < NOW() + interval '7 days' THEN 'critical'
        WHEN COALESCE(fc.certificate_expires_at, fc.certificate_expiry) < NOW() + interval '30 days' THEN 'warning'
        ELSE 'ok'
      END
    )
    ORDER BY COALESCE(fc.certificate_expires_at, fc.certificate_expiry) ASC NULLS LAST
  ), '[]'::jsonb)
  INTO v_result
  FROM public.fiscal_configs fc
  LEFT JOIN public.companies c ON c.id = fc.company_id
  WHERE fc.is_active
    AND (
      v_is_admin
      OR public.user_belongs_to_company(fc.company_id)
    )
    AND (
      COALESCE(fc.certificate_expires_at, fc.certificate_expiry) IS NULL
      OR COALESCE(fc.certificate_expires_at, fc.certificate_expiry) <= v_cutoff
    );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_certificate_alerts(int) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. RPC get_fiscal_rejection_dashboard(p_days, p_company_id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_fiscal_rejection_dashboard(
  p_days int DEFAULT 30,
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.is_super_admin();
  v_since timestamptz := NOW() - (GREATEST(p_days, 1) || ' days')::interval;
  v_totals jsonb;
  v_daily jsonb;
  v_top_reasons jsonb;
  v_top_companies jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;

  -- Empresas autorizadas (para filtro)
  CREATE TEMP TABLE IF NOT EXISTS tmp_allowed (cid uuid) ON COMMIT DROP;
  DELETE FROM tmp_allowed;
  IF v_is_admin THEN
    INSERT INTO tmp_allowed SELECT id FROM public.companies;
  ELSE
    INSERT INTO tmp_allowed
    SELECT company_id FROM public.company_users
     WHERE user_id = v_user AND is_active = TRUE;
  END IF;

  IF p_company_id IS NOT NULL THEN
    DELETE FROM tmp_allowed WHERE cid <> p_company_id;
  END IF;

  -- Totais
  WITH base AS (
    SELECT n.*, COALESCE(c.name, n.company_id::text) AS company_name
    FROM public.nfe_documents n
    LEFT JOIN public.companies c ON c.id = n.company_id
    WHERE n.company_id IN (SELECT cid FROM tmp_allowed)
      AND n.created_at >= v_since
  )
  SELECT jsonb_build_object(
    'total',       COUNT(*),
    'authorized',  COUNT(*) FILTER (WHERE status = 'autorizada'),
    'rejected',    COUNT(*) FILTER (WHERE status = 'rejeitada'),
    'pending',     COUNT(*) FILTER (WHERE status IN ('pendente', 'processando')),
    'rejection_rate',
      CASE WHEN COUNT(*) = 0 THEN 0
           ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'rejeitada') / COUNT(*), 2)
      END
  )
  INTO v_totals
  FROM base;

  -- Série diária
  WITH days AS (
    SELECT generate_series(
      date_trunc('day', v_since)::date,
      date_trunc('day', NOW())::date,
      '1 day'::interval
    )::date AS d
  ),
  agg AS (
    SELECT date_trunc('day', n.created_at)::date AS d,
           COUNT(*) FILTER (WHERE n.status = 'rejeitada') AS rejected,
           COUNT(*) FILTER (WHERE n.status = 'autorizada') AS authorized
    FROM public.nfe_documents n
    WHERE n.company_id IN (SELECT cid FROM tmp_allowed)
      AND n.created_at >= v_since
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date',       to_char(days.d, 'YYYY-MM-DD'),
    'rejected',   COALESCE(agg.rejected, 0),
    'authorized', COALESCE(agg.authorized, 0)
  ) ORDER BY days.d), '[]'::jsonb)
  INTO v_daily
  FROM days
  LEFT JOIN agg ON agg.d = days.d;

  -- Top motivos de rejeição (primeiros 60 chars)
  WITH base AS (
    SELECT LEFT(COALESCE(rejection_reason, 'Sem motivo registrado'), 120) AS reason
    FROM public.nfe_documents
    WHERE company_id IN (SELECT cid FROM tmp_allowed)
      AND created_at >= v_since
      AND status = 'rejeitada'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reason', reason,
    'count', cnt
  ) ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_top_reasons
  FROM (
    SELECT reason, COUNT(*) AS cnt
    FROM base
    GROUP BY reason
    ORDER BY cnt DESC
    LIMIT 10
  ) s;

  -- Top empresas (só para admin)
  IF v_is_admin THEN
    WITH base AS (
      SELECT n.company_id, COALESCE(c.name, n.company_id::text) AS company_name, n.status
      FROM public.nfe_documents n
      LEFT JOIN public.companies c ON c.id = n.company_id
      WHERE n.company_id IN (SELECT cid FROM tmp_allowed)
        AND n.created_at >= v_since
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'company_id',    company_id,
      'company_name',  company_name,
      'rejected',      rejected,
      'authorized',    authorized,
      'rejection_rate',
        CASE WHEN (rejected + authorized) = 0 THEN 0
             ELSE ROUND(100.0 * rejected / (rejected + authorized), 2)
        END
    ) ORDER BY rejected DESC), '[]'::jsonb)
    INTO v_top_companies
    FROM (
      SELECT company_id, company_name,
             COUNT(*) FILTER (WHERE status = 'rejeitada') AS rejected,
             COUNT(*) FILTER (WHERE status = 'autorizada') AS authorized
      FROM base
      GROUP BY company_id, company_name
      HAVING COUNT(*) FILTER (WHERE status = 'rejeitada') > 0
      ORDER BY rejected DESC
      LIMIT 15
    ) s;
  ELSE
    v_top_companies := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'since', v_since,
    'totals', v_totals,
    'daily', v_daily,
    'top_reasons', v_top_reasons,
    'top_companies', v_top_companies
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fiscal_rejection_dashboard(int, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. fiscal_cert_alerts_sent (antiduplicação de e-mails)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_cert_alerts_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bucket text NOT NULL CHECK (bucket IN ('30d','15d','7d','1d','expired')),
  expires_at timestamptz,
  notified_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, bucket, expires_at)
);

ALTER TABLE public.fiscal_cert_alerts_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_cert_alerts_sent_admin ON public.fiscal_cert_alerts_sent;
CREATE POLICY fiscal_cert_alerts_sent_admin ON public.fiscal_cert_alerts_sent
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON FUNCTION public.get_certificate_alerts(int) IS
  'Lista certificados digitais vencendo nos próximos N dias (ou já vencidos). Super_admin vê todas as empresas; usuários normais veem apenas as suas.';

COMMENT ON FUNCTION public.get_fiscal_rejection_dashboard(int, uuid) IS
  'Dashboard consolidado de emissões/rejeições de NF-e/NFC-e nos últimos N dias.';
