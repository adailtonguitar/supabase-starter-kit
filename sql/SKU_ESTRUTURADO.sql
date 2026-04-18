-- =============================================================================
-- SKU ESTRUTURADO (CAT-MOD-VAR-SEQ) — coexiste com SKU legado
-- Executar no Supabase SQL Editor (projeto fsvxpxziotklbxkivyug)
-- Idempotente: pode rodar múltiplas vezes sem erro.
-- =============================================================================

-- 1) Coluna opcional sku_structured
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sku_structured TEXT;

-- 2) Validação de formato (uppercase, A-Z 0-9 e hífen, máx 30) — só quando preenchido
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_sku_structured_format_chk;

ALTER TABLE public.products
  ADD CONSTRAINT products_sku_structured_format_chk
  CHECK (
    sku_structured IS NULL
    OR (sku_structured ~ '^[A-Z0-9-]+$' AND char_length(sku_structured) <= 30)
  );

-- 3) Unicidade parcial por empresa (não conflita com NULLs nem com SKU legado)
DROP INDEX IF EXISTS public.products_company_sku_structured_uniq;
CREATE UNIQUE INDEX products_company_sku_structured_uniq
  ON public.products (company_id, sku_structured)
  WHERE sku_structured IS NOT NULL;

-- 4) Helper: tokenização (uppercase, sem acento, [A-Z0-9], cortado em N chars)
DROP FUNCTION IF EXISTS public.sku_token(TEXT, INT);
CREATE OR REPLACE FUNCTION public.sku_token(p_raw TEXT, p_max INT DEFAULT 4)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v TEXT;
BEGIN
  IF p_raw IS NULL OR btrim(p_raw) = '' THEN
    RETURN NULL;
  END IF;
  -- Remove diacríticos manualmente (sem depender da extensão unaccent)
  v := translate(
    p_raw,
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'
  );
  v := upper(v);
  v := regexp_replace(v, '[^A-Z0-9]', '', 'g');
  IF v = '' THEN
    RETURN NULL;
  END IF;
  RETURN substring(v FROM 1 FOR GREATEST(1, COALESCE(p_max, 4)));
END;
$$;

GRANT EXECUTE ON FUNCTION public.sku_token(TEXT, INT) TO authenticated, anon, service_role;

-- 5) Geração atômica do SKU estruturado completo CAT-MOD-VAR-SEQ
--    Recebe a base já tokenizada (CAT-MOD-VAR) e devolve com sufixo -NNN único por (company_id, base).
DROP FUNCTION IF EXISTS public.generate_sku_structured(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.generate_sku_structured(
  p_company_id UUID,
  p_base TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base TEXT;
  v_next INT;
  v_candidate TEXT;
  v_attempts INT := 0;
BEGIN
  IF p_company_id IS NULL OR p_base IS NULL OR btrim(p_base) = '' THEN
    RETURN NULL;
  END IF;

  v_base := upper(btrim(p_base));
  IF v_base !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' THEN
    RETURN NULL;
  END IF;
  IF char_length(v_base) > 26 THEN
    -- precisa caber "-NNN" (4 chars) em 30 totais
    RETURN NULL;
  END IF;

  -- Busca o maior SEQ existente para essa base nessa empresa
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(substring(sku_structured FROM '-([0-9]{3,})$'), '\D', '', 'g'), '')::INT
  ), 0) + 1
    INTO v_next
    FROM public.products
   WHERE company_id = p_company_id
     AND sku_structured LIKE v_base || '-%';

  -- Loop defensivo contra race conditions (até 50 tentativas)
  WHILE v_attempts < 50 LOOP
    v_candidate := v_base || '-' || lpad(v_next::TEXT, 3, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.products
       WHERE company_id = p_company_id
         AND sku_structured = v_candidate
    );
    v_next := v_next + 1;
    v_attempts := v_attempts + 1;
  END LOOP;

  IF v_attempts >= 50 THEN
    RETURN NULL;
  END IF;

  RETURN v_candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_sku_structured(UUID, TEXT) TO authenticated, service_role;

-- 6) Comentários (documentação no banco)
COMMENT ON COLUMN public.products.sku_structured IS
  'SKU estruturado CAT-MOD-VAR-SEQ (opcional, coexiste com sku legado). Único por company_id quando preenchido.';
COMMENT ON FUNCTION public.generate_sku_structured(UUID, TEXT) IS
  'Gera SKU estruturado atômico no formato BASE-NNN (3 dígitos), único por (company_id, base).';
