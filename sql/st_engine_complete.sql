-- =====================================================
-- Motor ICMS-ST Completo — EXECUTE NO SUPABASE DASHBOARD > SQL EDITOR
-- =====================================================

-- 1. Tabela de log de decisões ST (anti-fraude / auditoria)
CREATE TABLE IF NOT EXISTS public.fiscal_st_decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  ncm TEXT NOT NULL,
  cest TEXT,
  uf TEXT NOT NULL,
  regra_usada TEXT NOT NULL DEFAULT 'none',
  convenio TEXT,
  mva NUMERIC(10,2) NOT NULL DEFAULT 0,
  aplicou_st BOOLEAN NOT NULL DEFAULT false,
  motivo TEXT,
  confianca TEXT NOT NULL DEFAULT 'baixa' CHECK (confianca IN ('alta', 'media', 'baixa')),
  override_aplicado BOOLEAN NOT NULL DEFAULT false,
  risk_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_st_decision_log_company ON public.fiscal_st_decision_log(company_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_st_decision_log_ncm ON public.fiscal_st_decision_log(ncm, uf);
CREATE INDEX IF NOT EXISTS idx_fiscal_st_decision_log_date ON public.fiscal_st_decision_log(created_at DESC);

ALTER TABLE public.fiscal_st_decision_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own company ST decisions" ON public.fiscal_st_decision_log;
CREATE POLICY "Users can read own company ST decisions"
  ON public.fiscal_st_decision_log FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Service can insert ST decisions" ON public.fiscal_st_decision_log;
CREATE POLICY "Service can insert ST decisions"
  ON public.fiscal_st_decision_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2. Tabela de overrides manuais de ST por empresa
CREATE TABLE IF NOT EXISTS public.fiscal_override_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_override_rules_lookup ON public.fiscal_override_rules(company_id, ncm, uf, is_active);

ALTER TABLE public.fiscal_override_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own company overrides" ON public.fiscal_override_rules;
CREATE POLICY "Users can read own company overrides"
  ON public.fiscal_override_rules FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own company overrides" ON public.fiscal_override_rules;
CREATE POLICY "Users can manage own company overrides"
  ON public.fiscal_override_rules FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

-- 3. Garantir colunas extras na fiscal_st_rules
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fiscal_st_rules' AND column_name='exige_st') THEN
    ALTER TABLE public.fiscal_st_rules ADD COLUMN exige_st BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fiscal_st_rules' AND column_name='segmento') THEN
    ALTER TABLE public.fiscal_st_rules ADD COLUMN segmento TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fiscal_st_rules' AND column_name='convenio') THEN
    ALTER TABLE public.fiscal_st_rules ADD COLUMN convenio TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fiscal_st_rules' AND column_name='protocolo') THEN
    ALTER TABLE public.fiscal_st_rules ADD COLUMN protocolo TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fiscal_st_rules' AND column_name='exige_cest') THEN
    ALTER TABLE public.fiscal_st_rules ADD COLUMN exige_cest BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- 4. RPC: resolve_st_from_db
DROP FUNCTION IF EXISTS public.resolve_st_from_db(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.resolve_st_from_db(
  p_ncm TEXT,
  p_uf TEXT,
  p_tipo_operacao TEXT DEFAULT 'todos'
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'found', true, 'ncm', r.ncm, 'cest', r.cest, 'uf', r.uf,
    'segmento', r.segmento, 'mva', r.mva, 'aliquota_interna', r.aliquota,
    'reducao_bc', r.reducao_bc, 'convenio', r.convenio, 'protocolo', r.protocolo,
    'exige_st', COALESCE(r.exige_st, true), 'exige_cest', COALESCE(r.exige_cest, false)
  ) INTO v_result
  FROM public.fiscal_st_rules r
  WHERE r.ncm = p_ncm AND r.uf = p_uf
    AND r.data_inicio <= CURRENT_DATE AND (r.data_fim IS NULL OR r.data_fim >= CURRENT_DATE)
  ORDER BY CASE WHEN r.company_id IS NOT NULL THEN 0 ELSE 1 END, r.is_global ASC, r.data_inicio DESC
  LIMIT 1;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  -- Prefix 4-digit match
  SELECT jsonb_build_object(
    'found', true, 'ncm', r.ncm, 'cest', r.cest, 'uf', r.uf,
    'segmento', r.segmento, 'mva', r.mva, 'aliquota_interna', r.aliquota,
    'reducao_bc', r.reducao_bc, 'convenio', r.convenio, 'protocolo', r.protocolo,
    'exige_st', COALESCE(r.exige_st, true), 'exige_cest', COALESCE(r.exige_cest, false)
  ) INTO v_result
  FROM public.fiscal_st_rules r
  WHERE LEFT(r.ncm, 4) = LEFT(p_ncm, 4) AND r.uf = p_uf
    AND r.data_inicio <= CURRENT_DATE AND (r.data_fim IS NULL OR r.data_fim >= CURRENT_DATE)
  ORDER BY CASE WHEN r.company_id IS NOT NULL THEN 0 ELSE 1 END, LENGTH(r.ncm) DESC, r.data_inicio DESC
  LIMIT 1;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  RETURN jsonb_build_object('found', false);
END;
$$;

-- 5. RPC: get_st_override
DROP FUNCTION IF EXISTS public.get_st_override(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.get_st_override(
  p_company_id UUID,
  p_ncm TEXT,
  p_uf TEXT
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'found', true, 'forcar_st', o.forcar_st, 'mva_forcado', o.mva_forcado,
    'cst_forcado', o.cst_forcado, 'csosn_forcado', o.csosn_forcado,
    'aliquota_forcada', o.aliquota_forcada, 'reducao_bc_forcada', o.reducao_bc_forcada,
    'motivo', o.motivo, 'prioridade', o.prioridade
  ) INTO v_result
  FROM public.fiscal_override_rules o
  WHERE o.company_id = p_company_id AND o.ncm = p_ncm
    AND (o.uf = p_uf OR o.uf = '*') AND o.is_active = true
  ORDER BY CASE WHEN o.uf = p_uf THEN 0 ELSE 1 END, o.prioridade DESC
  LIMIT 1;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  RETURN jsonb_build_object('found', false);
END;
$$;
