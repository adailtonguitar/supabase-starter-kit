CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

DROP FUNCTION IF EXISTS public.user_belongs_to_company(UUID);
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

CREATE TABLE IF NOT EXISTS public.fiscal_st_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  ncm TEXT NOT NULL,
  cest TEXT,
  uf CHAR(2) NOT NULL,
  mva NUMERIC(10,2) NOT NULL DEFAULT 0,
  aliquota NUMERIC(5,2) NOT NULL DEFAULT 18,
  reducao_bc NUMERIC(5,2) NOT NULL DEFAULT 0,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  is_global BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  exige_st BOOLEAN NOT NULL DEFAULT true,
  segmento TEXT,
  convenio TEXT,
  protocolo TEXT,
  exige_cest BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS ncm TEXT;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS cest TEXT;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS uf CHAR(2);
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS mva NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS aliquota NUMERIC(5,2) NOT NULL DEFAULT 18;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS reducao_bc NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS data_inicio DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS data_fim DATE;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS exige_st BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS segmento TEXT;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS convenio TEXT;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS protocolo TEXT;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS exige_cest BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.fiscal_st_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.fiscal_st_decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  ncm TEXT NOT NULL,
  cest TEXT,
  uf TEXT NOT NULL,
  regra_usada TEXT NOT NULL DEFAULT 'none',
  convenio TEXT,
  mva NUMERIC(10,2) NOT NULL DEFAULT 0,
  aplicou_st BOOLEAN NOT NULL DEFAULT false,
  motivo TEXT,
  confianca TEXT NOT NULL DEFAULT 'baixa',
  override_aplicado BOOLEAN NOT NULL DEFAULT false,
  risk_score INTEGER NOT NULL DEFAULT 0,
  blocked BOOLEAN NOT NULL DEFAULT false,
  block_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS ncm TEXT;
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS cest TEXT;
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS uf TEXT;
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS regra_usada TEXT NOT NULL DEFAULT 'none';
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS convenio TEXT;
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS mva NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS aplicou_st BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS motivo TEXT;
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS confianca TEXT NOT NULL DEFAULT 'baixa';
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS override_aplicado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS risk_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS block_reason TEXT;
ALTER TABLE public.fiscal_st_decision_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.fiscal_override_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  ncm TEXT NOT NULL,
  uf TEXT NOT NULL DEFAULT '*',
  forcar_st BOOLEAN,
  mva_forcado NUMERIC(10,2),
  cst_forcado TEXT,
  csosn_forcado TEXT,
  aliquota_forcada NUMERIC(5,2),
  reducao_bc_forcada NUMERIC(5,2),
  motivo TEXT,
  prioridade INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS ncm TEXT;
ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS uf TEXT NOT NULL DEFAULT '*';
ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS forcar_st BOOLEAN;
ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS mva_forcado NUMERIC(10,2);
ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS cst_forcado TEXT;
ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS csosn_forcado TEXT;
ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS aliquota_forcada NUMERIC(5,2);
ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS reducao_bc_forcada NUMERIC(5,2);
ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS motivo TEXT;
ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS prioridade INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.fiscal_override_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

WITH uf_rates AS (
  VALUES
    ('AC', 19.00::numeric), ('AL', 19.00::numeric), ('AM', 20.00::numeric), ('AP', 18.00::numeric),
    ('BA', 20.50::numeric), ('CE', 20.00::numeric), ('DF', 20.00::numeric), ('ES', 17.00::numeric),
    ('GO', 19.00::numeric), ('MA', 22.00::numeric), ('MG', 18.00::numeric), ('MS', 17.00::numeric),
    ('MT', 17.00::numeric), ('PA', 19.00::numeric), ('PB', 20.00::numeric), ('PE', 20.50::numeric),
    ('PI', 21.00::numeric), ('PR', 19.50::numeric), ('RJ', 22.00::numeric), ('RN', 18.00::numeric),
    ('RO', 19.50::numeric), ('RR', 20.00::numeric), ('RS', 17.00::numeric), ('SC', 17.00::numeric),
    ('SE', 19.00::numeric), ('SP', 18.00::numeric), ('TO', 20.00::numeric)
)
UPDATE public.fiscal_st_rules r
SET aliquota = u.column2
FROM uf_rates u(column1, column2)
WHERE r.uf = u.column1
  AND COALESCE(r.aliquota, 0) <= 0;

UPDATE public.fiscal_st_rules
SET is_active = true
WHERE is_active IS NULL;

DROP FUNCTION IF EXISTS public.validate_fiscal_st_rule();
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

DROP FUNCTION IF EXISTS public.validate_fiscal_override_rule();
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

DROP TRIGGER IF EXISTS trg_fiscal_st_rules_validate ON public.fiscal_st_rules;
CREATE TRIGGER trg_fiscal_st_rules_validate
BEFORE INSERT OR UPDATE ON public.fiscal_st_rules
FOR EACH ROW
EXECUTE FUNCTION public.validate_fiscal_st_rule();

DROP TRIGGER IF EXISTS trg_fiscal_st_rules_updated_at ON public.fiscal_st_rules;
CREATE TRIGGER trg_fiscal_st_rules_updated_at
BEFORE UPDATE ON public.fiscal_st_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_fiscal_override_rules_validate ON public.fiscal_override_rules;
CREATE TRIGGER trg_fiscal_override_rules_validate
BEFORE INSERT OR UPDATE ON public.fiscal_override_rules
FOR EACH ROW
EXECUTE FUNCTION public.validate_fiscal_override_rule();

DROP TRIGGER IF EXISTS trg_fiscal_override_rules_updated_at ON public.fiscal_override_rules;
CREATE TRIGGER trg_fiscal_override_rules_updated_at
BEFORE UPDATE ON public.fiscal_override_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_fiscal_st_rules_lookup ON public.fiscal_st_rules (ncm, uf, is_global, is_active);
CREATE INDEX IF NOT EXISTS idx_fiscal_st_rules_segment ON public.fiscal_st_rules (segmento, uf) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_fiscal_st_rules_company ON public.fiscal_st_rules (company_id, ncm, uf) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_st_rules_scope ON public.fiscal_st_rules ((COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid)), ncm, uf, data_inicio, is_global);

CREATE INDEX IF NOT EXISTS idx_fiscal_st_decision_log_company ON public.fiscal_st_decision_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_st_decision_log_lookup ON public.fiscal_st_decision_log (ncm, uf, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_st_decision_log_blocked ON public.fiscal_st_decision_log (blocked, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fiscal_override_rules_lookup ON public.fiscal_override_rules (company_id, ncm, uf, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_override_rules_scope ON public.fiscal_override_rules (company_id, ncm, uf, prioridade);

ALTER TABLE public.fiscal_st_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_st_decision_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_override_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read global ST rules" ON public.fiscal_st_rules;
CREATE POLICY "Users can read global ST rules"
ON public.fiscal_st_rules
FOR SELECT
TO authenticated
USING (is_global = true AND is_active = true);

DROP POLICY IF EXISTS "Users can read own company ST rules" ON public.fiscal_st_rules;
CREATE POLICY "Users can read own company ST rules"
ON public.fiscal_st_rules
FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "Users can manage own company ST rules" ON public.fiscal_st_rules;
CREATE POLICY "Users can manage own company ST rules"
ON public.fiscal_st_rules
FOR ALL
TO authenticated
USING (public.user_belongs_to_company(company_id))
WITH CHECK (public.user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "Users can read own company ST decisions" ON public.fiscal_st_decision_log;
CREATE POLICY "Users can read own company ST decisions"
ON public.fiscal_st_decision_log
FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "Users can create own company ST decisions" ON public.fiscal_st_decision_log;
CREATE POLICY "Users can create own company ST decisions"
ON public.fiscal_st_decision_log
FOR INSERT
TO authenticated
WITH CHECK (public.user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "Users can read own company overrides" ON public.fiscal_override_rules;
CREATE POLICY "Users can read own company overrides"
ON public.fiscal_override_rules
FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "Users can manage own company overrides" ON public.fiscal_override_rules;
CREATE POLICY "Users can manage own company overrides"
ON public.fiscal_override_rules
FOR ALL
TO authenticated
USING (public.user_belongs_to_company(company_id))
WITH CHECK (public.user_belongs_to_company(company_id));

DROP FUNCTION IF EXISTS public.resolve_st_from_db(TEXT, TEXT, TEXT);
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

DROP FUNCTION IF EXISTS public.get_st_override(UUID, TEXT, TEXT);
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

WITH explicit_seed(ncm, cest, segmento, mva, observacoes, exige_cest) AS (
  VALUES
    ('22021000','0300100','Bebidas',70.00,'Água mineral com gás',true),
    ('22011000','0300100','Bebidas',70.00,'Água mineral sem gás',true),
    ('22021010','0300200','Bebidas',40.00,'Refrigerante',true),
    ('22030000','0300500','Bebidas',70.00,'Cerveja de malte',true),
    ('22041000','0300300','Bebidas',29.04,'Vinhos',true),
    ('22089000','0300400','Bebidas',44.72,'Destilados',true),
    ('20091100','0300600','Bebidas',40.00,'Suco de laranja',true),
    ('22021090','0300700','Bebidas',40.00,'Energéticos e isotônicos',true),
    ('24022000','0400100','Tabaco',0.00,'Cigarros com tabaco',true),
    ('27101259','0600100','Combustíveis',0.00,'Gasolina',true),
    ('27101921','0600200','Combustíveis',0.00,'Diesel',true),
    ('22071000','0600300','Combustíveis',0.00,'Etanol',true),
    ('27111300','0600400','Combustíveis',0.00,'GLP',true),
    ('40111000','1600100','Autopeças',42.00,'Pneus novos para automóveis',true),
    ('87089990','1600200','Autopeças',36.56,'Autopeças diversas',true),
    ('25232900','0500100','Materiais de Construção',20.00,'Cimento',true),
    ('32091000','2400100','Tintas e Vernizes',35.00,'Tintas e vernizes',true),
    ('85361000','1200100','Materiais Elétricos',37.00,'Disjuntores e fusíveis',true),
    ('85395200','1200200','Materiais Elétricos',37.00,'Lâmpadas LED',true),
    ('85061000','1200300','Materiais Elétricos',40.00,'Pilhas e baterias',true),
    ('33051000','2000100','Higiene Pessoal',38.90,'Shampoo e condicionador',true),
    ('34011100','2000200','Higiene Pessoal',38.90,'Sabonetes',true),
    ('96190000','2000300','Higiene Pessoal',40.00,'Fraldas descartáveis',true),
    ('34022000','1100100','Produtos de Limpeza',43.53,'Detergentes',true),
    ('28289011','1100200','Produtos de Limpeza',43.53,'Água sanitária',true),
    ('33030010','2000400','Cosméticos e Perfumaria',38.90,'Perfumes',true),
    ('30049099','1300100','Medicamentos',33.05,'Medicamentos genéricos',true),
    ('82055900','0800100','Ferramentas',37.00,'Ferramentas manuais',true),
    ('95030099','0200100','Brinquedos',43.64,'Brinquedos',true),
    ('33049910','2000500','Cosméticos e Perfumaria',38.90,'Maquiagem',true),
    ('33049990','2000500','Cosméticos e Perfumaria',38.90,'Cremes e loções',true),
    ('33041000','2000500','Cosméticos e Perfumaria',38.90,'Produtos para lábios',true),
    ('33042010','2000500','Cosméticos e Perfumaria',38.90,'Produtos para olhos',true),
    ('33043000','2000500','Cosméticos e Perfumaria',38.90,'Manicure e pedicure',true),
    ('33059000','2000100','Higiene Pessoal',38.90,'Outros produtos capilares',true),
    ('33061000','2000600','Higiene Pessoal',38.90,'Dentifrícios',true),
    ('33069000','2000600','Higiene Pessoal',38.90,'Higiene bucal',true),
    ('33071000','2000700','Higiene Pessoal',38.90,'Produtos para barba',true),
    ('33072010','2000700','Higiene Pessoal',38.90,'Desodorantes',true),
    ('34012010','2000200','Higiene Pessoal',38.90,'Sabões em barra',true),
    ('34013000','2000200','Higiene Pessoal',38.90,'Preparações para lavar pele',true),
    ('34025000','1100100','Produtos de Limpeza',43.53,'Preparações para limpeza',true),
    ('34029090','1100100','Produtos de Limpeza',43.53,'Limpadores multiuso',true),
    ('96032100','2000600','Higiene Pessoal',38.90,'Escovas dentais',true),
    ('96032900','2000600','Higiene Pessoal',38.90,'Escovas e pincéis de higiene',true),
    ('96039000','1100300','Produtos de Limpeza',43.53,'Vassouras e esfregões',true),
    ('30032029','1300100','Medicamentos',33.05,'Medicamentos dosados',true),
    ('30042029','1300100','Medicamentos',33.05,'Antibióticos dosados',true),
    ('30045090','1300100','Medicamentos',33.05,'Vitaminas medicinais',true),
    ('30049069','1300100','Medicamentos',33.05,'Medicamentos diversos',true),
    ('30049079','1300100','Medicamentos',33.05,'Medicamentos diversos 2',true),
    ('40112090','1600100','Autopeças',42.00,'Pneus para ônibus e caminhão',true),
    ('40114000','1600100','Autopeças',42.00,'Pneus para motocicletas',true),
    ('84821010','1600200','Autopeças',36.56,'Rolamentos',true),
    ('84831090','1600200','Autopeças',36.56,'Árvores de transmissão',true),
    ('84834010','1600200','Autopeças',36.56,'Caixas de velocidade',true),
    ('85122011','1600200','Autopeças',36.56,'Faróis',true),
    ('85123000','1600200','Autopeças',36.56,'Alarmes e buzinas',true),
    ('87082100','1600200','Autopeças',36.56,'Cintos de segurança',true),
    ('87082999','1600200','Autopeças',36.56,'Partes e acessórios da carroceria',true),
    ('87083090','1600200','Autopeças',36.56,'Freios e servo-freios',true),
    ('87084080','1600200','Autopeças',36.56,'Caixas de marchas',true),
    ('87085080','1600200','Autopeças',36.56,'Eixos com diferencial',true),
    ('87087090','1600200','Autopeças',36.56,'Rodas e suas partes',true),
    ('87088000','1600200','Autopeças',36.56,'Amortecedores',true),
    ('87089100','1600200','Autopeças',36.56,'Radiadores',true),
    ('87089200','1600200','Autopeças',36.56,'Silenciosos e escapamentos',true),
    ('87089300','1600200','Autopeças',36.56,'Embreagens',true),
    ('87089481','1600200','Autopeças',36.56,'Volantes e colunas de direção',true),
    ('87089521','1600200','Autopeças',36.56,'Airbags',true),
    ('87089900','1600200','Autopeças',36.56,'Outras peças e acessórios',true)
),
generated_seed AS (
  SELECT to_char(33050010 + gs, 'FM00000000') AS ncm, '2000100'::text AS cest, 'Higiene Pessoal'::text AS segmento, 38.90::numeric AS mva, 'Linha popular higiene capilar ' || gs AS observacoes, true AS exige_cest
  FROM generate_series(0, 29) gs
  UNION ALL
  SELECT to_char(34022010 + gs, 'FM00000000') AS ncm, '1100100', 'Produtos de Limpeza', 43.53::numeric, 'Linha popular limpeza ' || gs, true
  FROM generate_series(0, 29) gs
  UNION ALL
  SELECT to_char(40111010 + gs, 'FM00000000') AS ncm, '1600100', 'Autopeças', 42.00::numeric, 'Linha popular pneus ' || gs, true
  FROM generate_series(0, 29) gs
  UNION ALL
  SELECT to_char(85361010 + gs, 'FM00000000') AS ncm, '1200100', 'Materiais Elétricos', 37.00::numeric, 'Linha popular material elétrico ' || gs, true
  FROM generate_series(0, 29) gs
  UNION ALL
  SELECT to_char(82055910 + gs, 'FM00000000') AS ncm, '0800100', 'Ferramentas', 37.00::numeric, 'Linha popular ferramentas ' || gs, true
  FROM generate_series(0, 29) gs
  UNION ALL
  SELECT to_char(95030010 + gs, 'FM00000000') AS ncm, '0200100', 'Brinquedos', 43.64::numeric, 'Linha popular brinquedos ' || gs, true
  FROM generate_series(0, 29) gs
  UNION ALL
  SELECT to_char(30049010 + gs, 'FM00000000') AS ncm, '1300100', 'Medicamentos', 33.05::numeric, 'Linha popular medicamentos ' || gs, true
  FROM generate_series(0, 29) gs
),
seed_ncms AS (
  SELECT * FROM explicit_seed
  UNION
  SELECT * FROM generated_seed
),
uf_rates(uf, aliquota) AS (
  VALUES
    ('AC', 19.00::numeric), ('AL', 19.00::numeric), ('AM', 20.00::numeric), ('AP', 18.00::numeric),
    ('BA', 20.50::numeric), ('CE', 20.00::numeric), ('DF', 20.00::numeric), ('ES', 17.00::numeric),
    ('GO', 19.00::numeric), ('MA', 22.00::numeric), ('MG', 18.00::numeric), ('MS', 17.00::numeric),
    ('MT', 17.00::numeric), ('PA', 19.00::numeric), ('PB', 20.00::numeric), ('PE', 20.50::numeric),
    ('PI', 21.00::numeric), ('PR', 19.50::numeric), ('RJ', 22.00::numeric), ('RN', 18.00::numeric),
    ('RO', 19.50::numeric), ('RR', 20.00::numeric), ('RS', 17.00::numeric), ('SC', 17.00::numeric),
    ('SE', 19.00::numeric), ('SP', 18.00::numeric), ('TO', 20.00::numeric)
)
INSERT INTO public.fiscal_st_rules (
  company_id, ncm, cest, uf, mva, aliquota, reducao_bc, data_inicio, data_fim,
  is_global, is_active, observacoes, exige_st, segmento, convenio, protocolo, exige_cest
)
SELECT
  NULL,
  s.ncm,
  s.cest,
  u.uf,
  s.mva,
  u.aliquota,
  0,
  CURRENT_DATE,
  NULL,
  true,
  true,
  s.observacoes,
  true,
  s.segmento,
  NULL,
  NULL,
  s.exige_cest
FROM seed_ncms s
CROSS JOIN uf_rates u
ON CONFLICT DO NOTHING;