-- =====================================================
-- Fiscal ST Rules & Audit Log — PENDENTE DE APLICAÇÃO
-- Execute esta migração no Supabase Dashboard > SQL Editor
-- =====================================================

-- Tabela de regras dinâmicas de ST
CREATE TABLE IF NOT EXISTS public.fiscal_st_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  ncm TEXT NOT NULL,
  cest TEXT,
  uf CHAR(2) NOT NULL,
  mva NUMERIC(7,2) NOT NULL DEFAULT 0,
  aliquota NUMERIC(5,2) NOT NULL DEFAULT 0,
  reducao_bc NUMERIC(5,2) NOT NULL DEFAULT 0,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  is_global BOOLEAN NOT NULL DEFAULT false,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_st_rules_lookup ON public.fiscal_st_rules(ncm, uf, is_global);
CREATE INDEX IF NOT EXISTS idx_fiscal_st_rules_company ON public.fiscal_st_rules(company_id) WHERE company_id IS NOT NULL;

ALTER TABLE public.fiscal_st_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read global ST rules" ON public.fiscal_st_rules;
CREATE POLICY "Users can read global ST rules"
  ON public.fiscal_st_rules FOR SELECT TO authenticated
  USING (is_global = true);

DROP POLICY IF EXISTS "Users can read own company ST rules" ON public.fiscal_st_rules;
CREATE POLICY "Users can read own company ST rules"
  ON public.fiscal_st_rules FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own company ST rules" ON public.fiscal_st_rules;
CREATE POLICY "Users can manage own company ST rules"
  ON public.fiscal_st_rules FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

-- Tabela de audit log fiscal
CREATE TABLE IF NOT EXISTS public.fiscal_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nfe_id UUID,
  note_type TEXT NOT NULL DEFAULT 'nfce' CHECK (note_type IN ('nfce', 'nfe')),
  fiscal_mode TEXT NOT NULL DEFAULT 'AUTO' CHECK (fiscal_mode IN ('STRICT', 'AUTO')),
  crt INTEGER NOT NULL,
  regras_aplicadas JSONB NOT NULL DEFAULT '[]'::jsonb,
  st_aplicado BOOLEAN NOT NULL DEFAULT false,
  difal_aplicado BOOLEAN NOT NULL DEFAULT false,
  pis_cofins_mode TEXT,
  risk_score INTEGER DEFAULT 0,
  risk_level TEXT DEFAULT 'low',
  inconsistencias JSONB DEFAULT '[]'::jsonb,
  decisao_engine JSONB DEFAULT '{}'::jsonb,
  blocked BOOLEAN NOT NULL DEFAULT false,
  block_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_audit_log_company ON public.fiscal_audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_audit_log_date ON public.fiscal_audit_log(created_at DESC);

ALTER TABLE public.fiscal_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own company fiscal audit" ON public.fiscal_audit_log;
CREATE POLICY "Users can read own company fiscal audit"
  ON public.fiscal_audit_log FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Service can insert fiscal audit" ON public.fiscal_audit_log;
CREATE POLICY "Service can insert fiscal audit"
  ON public.fiscal_audit_log FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

-- Função para buscar regra ST dinâmica
CREATE OR REPLACE FUNCTION public.get_st_rule(
  p_ncm TEXT, p_uf CHAR(2), p_company_id UUID DEFAULT NULL, p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (ncm TEXT, cest TEXT, uf CHAR(2), mva NUMERIC, aliquota NUMERIC, reducao_bc NUMERIC, is_global BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.ncm, r.cest, r.uf, r.mva, r.aliquota, r.reducao_bc, r.is_global
  FROM public.fiscal_st_rules r
  WHERE r.ncm = p_ncm AND r.uf = p_uf
    AND r.data_inicio <= p_date AND (r.data_fim IS NULL OR r.data_fim >= p_date)
    AND (r.is_global = true OR r.company_id = p_company_id)
  ORDER BY r.is_global ASC, r.data_inicio DESC
  LIMIT 1;
$$;

-- Seed de regras ST globais
INSERT INTO public.fiscal_st_rules (ncm, cest, uf, mva, aliquota, reducao_bc, is_global, observacoes)
VALUES
  ('22021000', '0300100', 'MA', 70, 22, 0, true, 'Água mineral com gás — MA'),
  ('22021000', '0300100', 'SP', 70, 18, 0, true, 'Água mineral com gás — SP'),
  ('22011000', '0300100', 'MA', 70, 22, 0, true, 'Água mineral sem gás — MA'),
  ('22021010', '0300200', 'MA', 40, 22, 0, true, 'Refrigerante — MA'),
  ('22021010', '0300200', 'SP', 40, 18, 0, true, 'Refrigerante — SP'),
  ('22030000', '0300500', 'MA', 70, 22, 0, true, 'Cerveja — MA'),
  ('24022000', '0400100', 'MA', 0, 25, 0, true, 'Cigarros'),
  ('40111000', '1600100', 'MA', 42, 22, 0, true, 'Pneus — MA'),
  ('25232900', '0500100', 'MA', 20, 22, 0, true, 'Cimento — MA'),
  ('32091000', '2400100', 'MA', 35, 22, 0, true, 'Tintas — MA'),
  ('85361000', '1200100', 'MA', 37, 22, 0, true, 'Materiais elétricos — MA')
ON CONFLICT DO NOTHING;
