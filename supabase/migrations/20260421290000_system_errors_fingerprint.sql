-- ============================================================================
-- system_errors.fingerprint: hash determinístico para agrupar erros iguais
-- ============================================================================
-- Problema resolvido:
--   Hoje o admin Registro de Erros lista 1.000 linhas "x is undefined" quando
--   o mesmo bug loop acontece. Triagem impossível.
--
-- Solução:
--   fingerprint(message, stack, page) -> hex short (8 chars) que colapsa:
--     - números, UUIDs, hex → %
--     - URLs e IDs em query/path → %
--     - whitespace extra → 1 espaço
--     - case-insensitive
--   Gera "AS-FP-X7F2" e semelhantes. Erros "mesma coisa" viram o mesmo bucket.
--
-- Coexiste com support_code:
--   - support_code = único por OCORRÊNCIA (link que o cliente passa)
--   - fingerprint  = único por TIPO DE ERRO (usado pra agrupar)
-- ============================================================================

ALTER TABLE public.system_errors
  ADD COLUMN IF NOT EXISTS fingerprint text NULL;

-- Índice para agrupamentos e joins rápidos por fingerprint em janelas de tempo
CREATE INDEX IF NOT EXISTS idx_system_errors_fingerprint_created
  ON public.system_errors (fingerprint, created_at DESC)
  WHERE fingerprint IS NOT NULL;

-- ============================================================================
-- Função pura: normaliza texto e devolve hash curto (8 hex chars = ~4B buckets)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.compute_error_fingerprint(
  p_message text,
  p_stack   text,
  p_page    text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH normalized AS (
    SELECT
      -- 1) Normaliza message: lower, remove números longos, UUIDs, hex hashes
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              lower(COALESCE(p_message, '')),
              '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '%uuid%', 'g'
            ),
            '[0-9a-f]{16,}', '%hex%', 'g'
          ),
          '\d{3,}', '%n%', 'g'
        ),
        '\s+', ' ', 'g'
      ) AS msg_norm,

      -- 2) Top frame do stack (primeira linha com "at " ou "function")
      -- Pega só o nome da função, descarta paths/linhas/cols
      regexp_replace(
        COALESCE(
          (regexp_match(
            COALESCE(p_stack, ''),
            'at\s+([^\s\(]+)'
          ))[1],
          ''
        ),
        '[0-9]+', '%n%', 'g'
      ) AS stack_frame,

      -- 3) Page normalizada: remove query string e substitui ids/slugs
      regexp_replace(
        regexp_replace(
          regexp_replace(
            COALESCE(p_page, '/'),
            '\?.*$', '', ''
          ),
          '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '/:uuid', 'g'
        ),
        '/\d+', '/:id', 'g'
      ) AS page_norm
  )
  SELECT 'AS-FP-' || upper(
    substring(
      md5(msg_norm || '|' || stack_frame || '|' || page_norm)
      FROM 1 FOR 8
    )
  )
  FROM normalized;
$$;

COMMENT ON FUNCTION public.compute_error_fingerprint(text, text, text) IS
  'Hash determinístico pra agrupar erros "do mesmo tipo". Normaliza IDs, UUIDs e números antes de hashear. Retorna "AS-FP-XXXXXXXX".';

-- ============================================================================
-- Trigger: preenche fingerprint no INSERT se NULL (ou UPDATE forçando)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_system_errors_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.fingerprint IS NULL OR NEW.fingerprint = '' THEN
    NEW.fingerprint := public.compute_error_fingerprint(
      NEW.error_message,
      NEW.error_stack,
      NEW.page
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_errors_fingerprint ON public.system_errors;
CREATE TRIGGER trg_system_errors_fingerprint
  BEFORE INSERT OR UPDATE OF error_message, error_stack, page
  ON public.system_errors
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_system_errors_fingerprint();

-- ============================================================================
-- Backfill dos registros existentes (rápido mesmo com 100k linhas)
-- ============================================================================
UPDATE public.system_errors
SET fingerprint = public.compute_error_fingerprint(error_message, error_stack, page)
WHERE fingerprint IS NULL;

-- ============================================================================
-- RPC: get_grouped_errors — consumido pela UI de Registro de Erros
-- ============================================================================
-- Retorna os buckets de erros agregados dentro da janela [from_ts, to_ts],
-- ordenados por contagem desc. Guard: super_admin only.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_grouped_errors(
  p_from_ts timestamptz DEFAULT (NOW() - INTERVAL '24 hours'),
  p_to_ts   timestamptz DEFAULT NOW(),
  p_limit   int         DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;

  WITH grouped AS (
    SELECT
      e.fingerprint,
      COUNT(*)::int                                  AS count,
      COUNT(DISTINCT e.user_id) FILTER (
        WHERE e.user_id IS NOT NULL
      )::int                                         AS affected_users,
      MIN(e.created_at)                              AS first_seen,
      MAX(e.created_at)                              AS last_seen,
      (array_agg(
        e.error_message ORDER BY e.created_at DESC
      ))[1]                                          AS sample_message,
      (array_agg(
        e.error_stack   ORDER BY e.created_at DESC
      ))[1]                                          AS sample_stack,
      (array_agg(
        e.support_code  ORDER BY e.created_at DESC
      ) FILTER (WHERE e.support_code IS NOT NULL))[1] AS latest_support_code,
      (array_agg(DISTINCT e.page))[1:5]              AS pages,
      (array_agg(DISTINCT e.browser))[1:3]           AS browsers
    FROM public.system_errors e
    WHERE e.created_at >= p_from_ts
      AND e.created_at <= p_to_ts
      AND e.fingerprint IS NOT NULL
    GROUP BY e.fingerprint
    ORDER BY count DESC, last_seen DESC
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'from_ts',       p_from_ts,
    'to_ts',         p_to_ts,
    'total_buckets', (SELECT COUNT(*) FROM grouped),
    'total_events',  (SELECT COALESCE(SUM(count), 0) FROM grouped),
    'buckets',       COALESCE(jsonb_agg(to_jsonb(grouped.*) ORDER BY count DESC), '[]'::jsonb)
  )
  INTO v_result
  FROM grouped;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_grouped_errors(timestamptz, timestamptz, int) IS
  'Retorna erros agrupados por fingerprint numa janela de tempo, com contagem, usuários afetados, primeiro/último evento e sample. Guard: super_admin.';

REVOKE ALL ON FUNCTION public.get_grouped_errors(timestamptz, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_grouped_errors(timestamptz, timestamptz, int) TO authenticated;

-- ============================================================================
-- RPC auxiliar: get_errors_by_fingerprint — detalhe de 1 bucket
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_errors_by_fingerprint(
  p_fingerprint text,
  p_from_ts     timestamptz DEFAULT (NOW() - INTERVAL '7 days'),
  p_limit       int         DEFAULT 50
)
RETURNS SETOF public.system_errors
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;

  RETURN QUERY
  SELECT e.*
  FROM public.system_errors e
  WHERE e.fingerprint = p_fingerprint
    AND e.created_at >= p_from_ts
  ORDER BY e.created_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_errors_by_fingerprint(text, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_errors_by_fingerprint(text, timestamptz, int) TO authenticated;

COMMENT ON FUNCTION public.get_errors_by_fingerprint(text, timestamptz, int) IS
  'Retorna os eventos individuais que compõem um bucket de fingerprint. Guard: super_admin.';
