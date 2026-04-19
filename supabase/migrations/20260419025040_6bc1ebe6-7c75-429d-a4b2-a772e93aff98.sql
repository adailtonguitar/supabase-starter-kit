-- ============================================================
-- Motor tributário desacoplado v2
-- Tabela fiscal_tax_rules_v2 + RPC resolve_tax_rule
-- ============================================================

DROP FUNCTION IF EXISTS public.resolve_tax_rule(uuid, text, text, text, text, text);

CREATE TABLE IF NOT EXISTS public.fiscal_tax_rules_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NULL,
  regime text NOT NULL DEFAULT '*',
  uf_origem text NOT NULL DEFAULT '*',
  uf_destino text NOT NULL DEFAULT '*',
  ncm text NOT NULL,
  categoria_fiscal_tipo text NULL,
  csosn text NULL,
  cst_icms text NULL,
  cfop text NOT NULL DEFAULT '5102',
  origem int NOT NULL DEFAULT 0,
  cst_pis text NOT NULL DEFAULT '49',
  aliq_pis numeric NOT NULL DEFAULT 0,
  cst_cofins text NOT NULL DEFAULT '49',
  aliq_cofins numeric NOT NULL DEFAULT 0,
  prioridade int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ftr2_lookup
  ON public.fiscal_tax_rules_v2 (ativo, regime, uf_destino, ncm, prioridade DESC);
CREATE INDEX IF NOT EXISTS idx_ftr2_company
  ON public.fiscal_tax_rules_v2 (company_id) WHERE company_id IS NOT NULL;

ALTER TABLE public.fiscal_tax_rules_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ftr2 read global" ON public.fiscal_tax_rules_v2;
DROP POLICY IF EXISTS "ftr2 read own company" ON public.fiscal_tax_rules_v2;
DROP POLICY IF EXISTS "ftr2 manage own company" ON public.fiscal_tax_rules_v2;
DROP POLICY IF EXISTS "ftr2 service role" ON public.fiscal_tax_rules_v2;

CREATE POLICY "ftr2 read global" ON public.fiscal_tax_rules_v2
  FOR SELECT TO authenticated
  USING (company_id IS NULL AND ativo = true);

CREATE POLICY "ftr2 read own company" ON public.fiscal_tax_rules_v2
  FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.user_belongs_to_company(company_id));

CREATE POLICY "ftr2 manage own company" ON public.fiscal_tax_rules_v2
  FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND public.user_belongs_to_company(company_id))
  WITH CHECK (company_id IS NOT NULL AND public.user_belongs_to_company(company_id));

CREATE POLICY "ftr2 service role" ON public.fiscal_tax_rules_v2
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- RPC: resolve_tax_rule
-- Ordem de match: company exato > company prefixo > global exato > global prefixo > fallback
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_tax_rule(
  p_company_id uuid,
  p_regime text,
  p_uf_origem text,
  p_uf_destino text,
  p_ncm text,
  p_categoria_fiscal_tipo text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ncm text := regexp_replace(COALESCE(p_ncm,''), '\D','','g');
  v_uf_dest text := UPPER(COALESCE(NULLIF(p_uf_destino,''),'*'));
  v_uf_orig text := UPPER(COALESCE(NULLIF(p_uf_origem,''),'*'));
  v_regime text := LOWER(COALESCE(NULLIF(p_regime,''),'*'));
  v_row public.fiscal_tax_rules_v2%ROWTYPE;
  v_match text;
BEGIN
  -- 1) company-specific exato
  IF p_company_id IS NOT NULL AND length(v_ncm) >= 2 THEN
    SELECT * INTO v_row FROM public.fiscal_tax_rules_v2 r
    WHERE r.ativo
      AND r.company_id = p_company_id
      AND (r.regime = v_regime OR r.regime = '*')
      AND (r.uf_destino = v_uf_dest OR r.uf_destino = '*')
      AND (r.uf_origem  = v_uf_orig OR r.uf_origem  = '*')
      AND r.ncm = v_ncm
    ORDER BY r.prioridade DESC, r.updated_at DESC LIMIT 1;
    IF FOUND THEN v_match := 'company_ncm'; END IF;
  END IF;

  -- 2) company-specific prefixo (>=4 dígitos)
  IF NOT FOUND AND p_company_id IS NOT NULL AND length(v_ncm) >= 4 THEN
    SELECT * INTO v_row FROM public.fiscal_tax_rules_v2 r
    WHERE r.ativo
      AND r.company_id = p_company_id
      AND (r.regime = v_regime OR r.regime = '*')
      AND (r.uf_destino = v_uf_dest OR r.uf_destino = '*')
      AND (r.uf_origem  = v_uf_orig OR r.uf_origem  = '*')
      AND length(r.ncm) BETWEEN 2 AND 7
      AND v_ncm LIKE r.ncm || '%'
    ORDER BY length(r.ncm) DESC, r.prioridade DESC, r.updated_at DESC LIMIT 1;
    IF FOUND THEN v_match := 'company_prefix'; END IF;
  END IF;

  -- 3) global exato
  IF NOT FOUND AND length(v_ncm) >= 2 THEN
    SELECT * INTO v_row FROM public.fiscal_tax_rules_v2 r
    WHERE r.ativo
      AND r.company_id IS NULL
      AND (r.regime = v_regime OR r.regime = '*')
      AND (r.uf_destino = v_uf_dest OR r.uf_destino = '*')
      AND (r.uf_origem  = v_uf_orig OR r.uf_origem  = '*')
      AND r.ncm = v_ncm
    ORDER BY r.prioridade DESC, r.updated_at DESC LIMIT 1;
    IF FOUND THEN v_match := 'global_ncm'; END IF;
  END IF;

  -- 4) global prefixo
  IF NOT FOUND AND length(v_ncm) >= 4 THEN
    SELECT * INTO v_row FROM public.fiscal_tax_rules_v2 r
    WHERE r.ativo
      AND r.company_id IS NULL
      AND (r.regime = v_regime OR r.regime = '*')
      AND (r.uf_destino = v_uf_dest OR r.uf_destino = '*')
      AND (r.uf_origem  = v_uf_orig OR r.uf_origem  = '*')
      AND length(r.ncm) BETWEEN 2 AND 7
      AND v_ncm LIKE r.ncm || '%'
    ORDER BY length(r.ncm) DESC, r.prioridade DESC, r.updated_at DESC LIMIT 1;
    IF FOUND THEN v_match := 'global_prefix'; END IF;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'match','fallback','csosn','102','cst_icms',NULL,'cfop','5102','origem',0,
      'cst_pis','49','aliq_pis',0,'cst_cofins','49','aliq_cofins',0
    );
  END IF;

  RETURN jsonb_build_object(
    'match', v_match,
    'rule_id', v_row.id,
    'csosn', v_row.csosn,
    'cst_icms', v_row.cst_icms,
    'cfop', v_row.cfop,
    'origem', v_row.origem,
    'cst_pis', v_row.cst_pis,
    'aliq_pis', v_row.aliq_pis,
    'cst_cofins', v_row.cst_cofins,
    'aliq_cofins', v_row.aliq_cofins
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_tax_rule(uuid,text,text,text,text,text) TO authenticated, anon, service_role;