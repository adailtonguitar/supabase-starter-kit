CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_fiscal_st_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.ncm := regexp_replace(COALESCE(NEW.ncm, ''), '\\D', '', 'g');
  NEW.cest := NULLIF(regexp_replace(COALESCE(NEW.cest, ''), '\\D', '', 'g'), '');
  NEW.uf := UPPER(TRIM(COALESCE(NEW.uf, '')));
  NEW.segmento := NULLIF(TRIM(COALESCE(NEW.segmento, '')), '');
  NEW.aliquota := COALESCE(NEW.aliquota, 0);
  NEW.mva := COALESCE(NEW.mva, 0);
  NEW.reducao_bc := COALESCE(NEW.reducao_bc, 0);
  NEW.is_active := COALESCE(NEW.is_active, true);
  NEW.exige_st := COALESCE(NEW.exige_st, true);
  NEW.exige_cest := COALESCE(NEW.exige_cest, false);
  NEW.data_inicio := COALESCE(NEW.data_inicio, CURRENT_DATE);

  IF length(NEW.ncm) <> 8 THEN
    RAISE EXCEPTION 'NCM inválido em fiscal_st_rules: %', NEW.ncm;
  END IF;
  IF NEW.uf !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'UF inválida em fiscal_st_rules: %', NEW.uf;
  END IF;
  IF NEW.aliquota <= 0 THEN
    RAISE EXCEPTION 'aliquota_interna inválida em fiscal_st_rules para NCM % / UF %', NEW.ncm, NEW.uf;
  END IF;
  IF NEW.mva < 0 THEN
    RAISE EXCEPTION 'MVA inválida em fiscal_st_rules para NCM % / UF %', NEW.ncm, NEW.uf;
  END IF;
  IF NEW.reducao_bc < 0 OR NEW.reducao_bc > 100 THEN
    RAISE EXCEPTION 'redução BC inválida em fiscal_st_rules para NCM % / UF %', NEW.ncm, NEW.uf;
  END IF;
  IF NEW.data_fim IS NOT NULL AND NEW.data_fim < NEW.data_inicio THEN
    RAISE EXCEPTION 'Intervalo de vigência inválido em fiscal_st_rules para NCM % / UF %', NEW.ncm, NEW.uf;
  END IF;
  IF COALESCE(NEW.is_global, false) = false AND NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Regras não globais exigem company_id';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_fiscal_override_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.ncm := regexp_replace(COALESCE(NEW.ncm, ''), '\\D', '', 'g');
  NEW.uf := UPPER(TRIM(COALESCE(NEW.uf, '*')));
  NEW.is_active := COALESCE(NEW.is_active, true);

  IF length(NEW.ncm) <> 8 THEN
    RAISE EXCEPTION 'NCM inválido em fiscal_override_rules: %', NEW.ncm;
  END IF;
  IF NEW.uf <> '*' AND NEW.uf !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'UF inválida em fiscal_override_rules: %', NEW.uf;
  END IF;
  IF NEW.aliquota_forcada IS NOT NULL AND NEW.aliquota_forcada <= 0 THEN
    RAISE EXCEPTION 'aliquota_forcada inválida em fiscal_override_rules para NCM % / UF %', NEW.ncm, NEW.uf;
  END IF;
  IF NEW.mva_forcado IS NOT NULL AND NEW.mva_forcado < 0 THEN
    RAISE EXCEPTION 'mva_forcado inválido em fiscal_override_rules para NCM % / UF %', NEW.ncm, NEW.uf;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_company(p_company_id UUID)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_has_company_users boolean;
  v_match boolean := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR p_company_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'company_users'
  ) INTO v_has_company_users;

  IF v_has_company_users THEN
    EXECUTE 'SELECT EXISTS (
      SELECT 1
      FROM public.company_users
      WHERE user_id = $1
        AND company_id = $2
        AND COALESCE(is_active, true) = true
    )'
    INTO v_match
    USING v_uid, p_company_id;
  END IF;

  RETURN COALESCE(v_match, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_st_from_db(
  p_ncm TEXT,
  p_uf TEXT,
  p_tipo_operacao TEXT DEFAULT 'todos'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ncm TEXT := regexp_replace(COALESCE(p_ncm, ''), '\\D', '', 'g');
  v_uf TEXT := UPPER(TRIM(COALESCE(p_uf, '')));
  v_result JSONB;
BEGIN
  IF length(v_ncm) <> 8 OR v_uf !~ '^[A-Z]{2}$' THEN
    RETURN jsonb_build_object('found', false, 'reason', 'invalid_input');
  END IF;

  SELECT jsonb_build_object(
    'found', true,
    'ncm', r.ncm,
    'cest', r.cest,
    'uf', r.uf,
    'segmento', r.segmento,
    'mva', r.mva,
    'aliquota_interna', r.aliquota,
    'reducao_bc', r.reducao_bc,
    'convenio', r.convenio,
    'protocolo', r.protocolo,
    'exige_st', r.exige_st,
    'exige_cest', r.exige_cest,
    'tipo_operacao', COALESCE(p_tipo_operacao, 'todos'),
    'source_match', 'exact'
  )
  INTO v_result
  FROM public.fiscal_st_rules r
  WHERE r.is_active = true
    AND r.is_global = true
    AND r.ncm = v_ncm
    AND r.uf = v_uf
    AND r.data_inicio <= CURRENT_DATE
    AND (r.data_fim IS NULL OR r.data_fim >= CURRENT_DATE)
  ORDER BY r.data_inicio DESC, r.updated_at DESC
  LIMIT 1;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  SELECT jsonb_build_object(
    'found', true,
    'ncm', r.ncm,
    'cest', r.cest,
    'uf', r.uf,
    'segmento', r.segmento,
    'mva', r.mva,
    'aliquota_interna', r.aliquota,
    'reducao_bc', r.reducao_bc,
    'convenio', r.convenio,
    'protocolo', r.protocolo,
    'exige_st', r.exige_st,
    'exige_cest', r.exige_cest,
    'tipo_operacao', COALESCE(p_tipo_operacao, 'todos'),
    'source_match', 'prefix6'
  )
  INTO v_result
  FROM public.fiscal_st_rules r
  WHERE r.is_active = true
    AND r.is_global = true
    AND left(r.ncm, 6) = left(v_ncm, 6)
    AND r.uf = v_uf
    AND r.data_inicio <= CURRENT_DATE
    AND (r.data_fim IS NULL OR r.data_fim >= CURRENT_DATE)
  ORDER BY length(r.ncm) DESC, r.data_inicio DESC, r.updated_at DESC
  LIMIT 1;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  SELECT jsonb_build_object(
    'found', true,
    'ncm', r.ncm,
    'cest', r.cest,
    'uf', r.uf,
    'segmento', r.segmento,
    'mva', r.mva,
    'aliquota_interna', r.aliquota,
    'reducao_bc', r.reducao_bc,
    'convenio', r.convenio,
    'protocolo', r.protocolo,
    'exige_st', r.exige_st,
    'exige_cest', r.exige_cest,
    'tipo_operacao', COALESCE(p_tipo_operacao, 'todos'),
    'source_match', 'prefix4'
  )
  INTO v_result
  FROM public.fiscal_st_rules r
  WHERE r.is_active = true
    AND r.is_global = true
    AND left(r.ncm, 4) = left(v_ncm, 4)
    AND r.uf = v_uf
    AND r.data_inicio <= CURRENT_DATE
    AND (r.data_fim IS NULL OR r.data_fim >= CURRENT_DATE)
  ORDER BY length(r.ncm) DESC, r.data_inicio DESC, r.updated_at DESC
  LIMIT 1;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  RETURN jsonb_build_object('found', false, 'reason', 'none');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_st_override(
  p_company_id UUID,
  p_ncm TEXT,
  p_uf TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ncm TEXT := regexp_replace(COALESCE(p_ncm, ''), '\\D', '', 'g');
  v_uf TEXT := UPPER(TRIM(COALESCE(p_uf, '')));
  v_result JSONB;
BEGIN
  IF p_company_id IS NULL OR length(v_ncm) <> 8 OR v_uf !~ '^[A-Z]{2}$' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT jsonb_build_object(
    'found', true,
    'forcar_st', o.forcar_st,
    'mva_forcado', o.mva_forcado,
    'cst_forcado', o.cst_forcado,
    'csosn_forcado', o.csosn_forcado,
    'aliquota_forcada', o.aliquota_forcada,
    'reducao_bc_forcada', o.reducao_bc_forcada,
    'motivo', o.motivo,
    'prioridade', o.prioridade
  )
  INTO v_result
  FROM public.fiscal_override_rules o
  WHERE o.company_id = p_company_id
    AND o.ncm = v_ncm
    AND o.is_active = true
    AND (o.uf = v_uf OR o.uf = '*')
  ORDER BY CASE WHEN o.uf = v_uf THEN 0 ELSE 1 END, o.prioridade DESC, o.updated_at DESC
  LIMIT 1;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  RETURN jsonb_build_object('found', false);
END;
$$;