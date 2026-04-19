-- Tabela
CREATE TABLE IF NOT EXISTS public.fiscal_ncm_mapping (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID,
  is_global          BOOLEAN NOT NULL DEFAULT false,
  categoria          TEXT NOT NULL,
  variacao           TEXT,
  descricao_pattern  TEXT,
  ncm                TEXT NOT NULL,
  cest               TEXT,
  confianca          INT  NOT NULL DEFAULT 80 CHECK (confianca BETWEEN 0 AND 100),
  is_active          BOOLEAN NOT NULL DEFAULT true,
  observacoes        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger de saneamento
DROP FUNCTION IF EXISTS public.validate_fiscal_ncm_mapping() CASCADE;
CREATE OR REPLACE FUNCTION public.validate_fiscal_ncm_mapping()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $func$
BEGIN
  NEW.ncm  := regexp_replace(COALESCE(NEW.ncm, ''), '\D', '', 'g');
  NEW.cest := NULLIF(regexp_replace(COALESCE(NEW.cest, ''), '\D', '', 'g'), '');
  NEW.categoria := upper(btrim(COALESCE(NEW.categoria, '')));
  NEW.variacao  := NULLIF(upper(btrim(COALESCE(NEW.variacao, ''))), '');
  NEW.descricao_pattern := NULLIF(btrim(COALESCE(NEW.descricao_pattern, '')), '');

  IF length(NEW.ncm) <> 8 THEN
    RAISE EXCEPTION 'NCM inválido em fiscal_ncm_mapping: %', NEW.ncm;
  END IF;
  IF NEW.cest IS NOT NULL AND length(NEW.cest) <> 7 THEN
    RAISE EXCEPTION 'CEST inválido em fiscal_ncm_mapping: %', NEW.cest;
  END IF;
  IF NEW.categoria = '' THEN
    RAISE EXCEPTION 'categoria obrigatória em fiscal_ncm_mapping';
  END IF;
  IF COALESCE(NEW.is_global, false) = false AND NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Mappings não globais exigem company_id';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_validate_fiscal_ncm_mapping ON public.fiscal_ncm_mapping;
CREATE TRIGGER trg_validate_fiscal_ncm_mapping
  BEFORE INSERT OR UPDATE ON public.fiscal_ncm_mapping
  FOR EACH ROW EXECUTE FUNCTION public.validate_fiscal_ncm_mapping();

-- Índices
CREATE INDEX IF NOT EXISTS idx_fiscal_ncm_mapping_lookup
  ON public.fiscal_ncm_mapping (company_id, categoria, variacao)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_fiscal_ncm_mapping_global
  ON public.fiscal_ncm_mapping (categoria, variacao)
  WHERE is_active = true AND is_global = true;
CREATE INDEX IF NOT EXISTS idx_fiscal_ncm_mapping_pattern
  ON public.fiscal_ncm_mapping (company_id)
  WHERE is_active = true AND descricao_pattern IS NOT NULL;

-- RLS
ALTER TABLE public.fiscal_ncm_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access fiscal_ncm_mapping" ON public.fiscal_ncm_mapping;
CREATE POLICY "Service role full access fiscal_ncm_mapping"
  ON public.fiscal_ncm_mapping FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can read global fiscal_ncm_mapping" ON public.fiscal_ncm_mapping;
CREATE POLICY "Users can read global fiscal_ncm_mapping"
  ON public.fiscal_ncm_mapping FOR SELECT TO authenticated
  USING (is_global = true AND is_active = true);

DROP POLICY IF EXISTS "Users can read own company fiscal_ncm_mapping" ON public.fiscal_ncm_mapping;
CREATE POLICY "Users can read own company fiscal_ncm_mapping"
  ON public.fiscal_ncm_mapping FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "Users can manage own company fiscal_ncm_mapping" ON public.fiscal_ncm_mapping;
CREATE POLICY "Users can manage own company fiscal_ncm_mapping"
  ON public.fiscal_ncm_mapping FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND public.user_belongs_to_company(company_id))
  WITH CHECK (company_id IS NOT NULL AND public.user_belongs_to_company(company_id));

-- RPC (atribuição direta evita o parser interpretar como SELECT INTO tabela)
DROP FUNCTION IF EXISTS public.resolve_ncm_mapping(UUID, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.resolve_ncm_mapping(
  p_company_id UUID,
  p_categoria  TEXT,
  p_variacao   TEXT,
  p_descricao  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_cat  TEXT := upper(btrim(COALESCE(p_categoria, '')));
  v_var  TEXT := upper(btrim(COALESCE(p_variacao,  '')));
  v_desc TEXT := btrim(COALESCE(p_descricao, ''));
  v_out  JSONB;
BEGIN
  IF v_cat = '' AND v_desc = '' THEN
    RETURN NULL;
  END IF;

  -- Nível 1: CAT + VAR
  IF v_cat <> '' AND v_var <> '' THEN
    v_out := (
      SELECT jsonb_build_object(
               'ncm', m.ncm,
               'cest', m.cest,
               'confianca', m.confianca,
               'regra', 'cat_var',
               'source', CASE WHEN m.company_id = p_company_id THEN 'company' ELSE 'global' END
             )
        FROM public.fiscal_ncm_mapping m
       WHERE m.is_active = true
         AND m.categoria = v_cat
         AND m.variacao  = v_var
         AND ((m.company_id = p_company_id) OR (m.is_global = true AND m.company_id IS NULL))
       ORDER BY (m.company_id = p_company_id) DESC,
                m.confianca DESC,
                m.updated_at DESC
       LIMIT 1
    );
    IF v_out IS NOT NULL THEN
      RETURN v_out;
    END IF;
  END IF;

  -- Nível 2: CAT puro
  IF v_cat <> '' THEN
    v_out := (
      SELECT jsonb_build_object(
               'ncm', m.ncm,
               'cest', m.cest,
               'confianca', m.confianca,
               'regra', 'cat',
               'source', CASE WHEN m.company_id = p_company_id THEN 'company' ELSE 'global' END
             )
        FROM public.fiscal_ncm_mapping m
       WHERE m.is_active = true
         AND m.categoria = v_cat
         AND m.variacao IS NULL
         AND m.descricao_pattern IS NULL
         AND ((m.company_id = p_company_id) OR (m.is_global = true AND m.company_id IS NULL))
       ORDER BY (m.company_id = p_company_id) DESC,
                m.confianca DESC,
                m.updated_at DESC
       LIMIT 1
    );
    IF v_out IS NOT NULL THEN
      RETURN v_out;
    END IF;
  END IF;

  -- Nível 3: descricao_pattern ILIKE
  IF v_desc <> '' THEN
    v_out := (
      SELECT jsonb_build_object(
               'ncm', m.ncm,
               'cest', m.cest,
               'confianca', m.confianca,
               'regra', 'pattern',
               'source', CASE WHEN m.company_id = p_company_id THEN 'company' ELSE 'global' END
             )
        FROM public.fiscal_ncm_mapping m
       WHERE m.is_active = true
         AND m.descricao_pattern IS NOT NULL
         AND v_desc ILIKE m.descricao_pattern
         AND ((m.company_id = p_company_id) OR (m.is_global = true AND m.company_id IS NULL))
       ORDER BY (m.company_id = p_company_id) DESC,
                m.confianca DESC,
                char_length(m.descricao_pattern) DESC,
                m.updated_at DESC
       LIMIT 1
    );
    IF v_out IS NOT NULL THEN
      RETURN v_out;
    END IF;
  END IF;

  RETURN NULL;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.resolve_ncm_mapping(UUID, TEXT, TEXT, TEXT)
  TO authenticated, service_role;