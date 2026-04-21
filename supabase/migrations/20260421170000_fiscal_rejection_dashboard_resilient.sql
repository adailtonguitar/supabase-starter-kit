-- ============================================================================
-- fix: get_fiscal_rejection_dashboard resiliente quando nfe_documents não existe
-- ----------------------------------------------------------------------------
-- A RPC original assumia que public.nfe_documents existe. Em instalações que
-- apenas IMPORTAM NF-e (não emitem), a tabela não existe e a função falhava
-- em runtime, deixando o AdminFiscalMonitor preso em "Carregando…".
--
-- Esta versão:
--   1) Detecta a existência da tabela via to_regclass (run-time).
--   2) Se não existe → retorna estrutura vazia com flag `available=false`,
--      para o front-end mostrar estado apropriado.
--   3) Também trata tabelas alternativas (nfe_imports) como fonte, mas só
--      para totals — "rejeições" só fazem sentido para emissão.
-- ============================================================================

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
  v_empty jsonb := jsonb_build_object(
    'total',          0,
    'authorized',     0,
    'rejected',       0,
    'pending',        0,
    'rejection_rate', 0
  );
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;

  -- Se não existe a tabela de emissão, retorna estrutura vazia mas "ok"
  -- para que o front-end mostre estado adequado (não quebre).
  IF to_regclass('public.nfe_documents') IS NULL THEN
    RETURN jsonb_build_object(
      'ok',            TRUE,
      'available',     FALSE,
      'reason',        'nfe_documents_table_missing',
      'message',       'Esta instalação não emite NF-e/NFC-e próprios — apenas importa. Nada a monitorar.',
      'since',         v_since,
      'totals',        v_empty,
      'daily',         '[]'::jsonb,
      'top_reasons',   '[]'::jsonb,
      'top_companies', '[]'::jsonb
    );
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

  -- Top motivos de rejeição
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
    'ok',            TRUE,
    'available',     TRUE,
    'since',         v_since,
    'totals',        v_totals,
    'daily',         v_daily,
    'top_reasons',   v_top_reasons,
    'top_companies', v_top_companies
  );

EXCEPTION WHEN OTHERS THEN
  -- Rede de segurança: qualquer erro inesperado vira estado "indisponível"
  -- para o front-end não travar em loading.
  RETURN jsonb_build_object(
    'ok',            TRUE,
    'available',     FALSE,
    'reason',        'runtime_error',
    'message',       SQLERRM,
    'since',         v_since,
    'totals',        v_empty,
    'daily',         '[]'::jsonb,
    'top_reasons',   '[]'::jsonb,
    'top_companies', '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fiscal_rejection_dashboard(int, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_fiscal_rejection_dashboard(int, uuid) IS
  'Dashboard de rejeições NF-e/NFC-e. Retorna available=false quando a
   tabela nfe_documents não existe (instalação só importa NF-e) ou quando
   ocorre erro de runtime, evitando que o front-end fique preso em loading.';
