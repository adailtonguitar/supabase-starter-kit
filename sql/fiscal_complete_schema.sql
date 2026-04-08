-- =====================================================
-- Fiscal NCM Rules — Base de dados tributária por NCM/UF
-- Alimentada pelo IBPT e atualizada automaticamente
-- =====================================================
-- EXECUTE NO SQL EDITOR DO SUPABASE

-- 1. Tabela principal
CREATE TABLE IF NOT EXISTS public.fiscal_ncm_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ncm TEXT NOT NULL,
  uf CHAR(2) NOT NULL DEFAULT '*',
  descricao TEXT,
  categoria TEXT,
  monofasico BOOLEAN NOT NULL DEFAULT false,
  st_susceptivel BOOLEAN NOT NULL DEFAULT false,
  cest_obrigatorio BOOLEAN NOT NULL DEFAULT false,
  aliq_nacional NUMERIC(7,2) NOT NULL DEFAULT 0,
  aliq_importado NUMERIC(7,2) NOT NULL DEFAULT 0,
  aliq_estadual NUMERIC(7,2) NOT NULL DEFAULT 0,
  aliq_municipal NUMERIC(7,2) NOT NULL DEFAULT 0,
  fonte TEXT NOT NULL DEFAULT 'LOCAL',
  versao_ibpt TEXT,
  vigencia_inicio TEXT,
  vigencia_fim TEXT,
  atualizado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ncm, uf)
);

COMMENT ON TABLE public.fiscal_ncm_rules IS 'Base tributária por NCM/UF alimentada pelo IBPT. Atualizada automaticamente via job diário.';

CREATE INDEX IF NOT EXISTS idx_fiscal_ncm_rules_ncm ON public.fiscal_ncm_rules(ncm);
CREATE INDEX IF NOT EXISTS idx_fiscal_ncm_rules_uf ON public.fiscal_ncm_rules(uf);
CREATE INDEX IF NOT EXISTS idx_fiscal_ncm_rules_lookup ON public.fiscal_ncm_rules(ncm, uf);
CREATE INDEX IF NOT EXISTS idx_fiscal_ncm_rules_mono ON public.fiscal_ncm_rules(monofasico) WHERE monofasico = true;
CREATE INDEX IF NOT EXISTS idx_fiscal_ncm_rules_st ON public.fiscal_ncm_rules(st_susceptivel) WHERE st_susceptivel = true;

ALTER TABLE public.fiscal_ncm_rules ENABLE ROW LEVEL SECURITY;

-- Todos os usuários autenticados podem ler (dados públicos IBPT)
DROP POLICY IF EXISTS "Authenticated users can read fiscal_ncm_rules" ON public.fiscal_ncm_rules;
CREATE POLICY "Authenticated users can read fiscal_ncm_rules"
  ON public.fiscal_ncm_rules FOR SELECT TO authenticated
  USING (true);

-- Apenas service_role pode inserir/atualizar (via edge function)
DROP POLICY IF EXISTS "Service can manage fiscal_ncm_rules" ON public.fiscal_ncm_rules;
CREATE POLICY "Service can manage fiscal_ncm_rules"
  ON public.fiscal_ncm_rules FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Função para consulta rápida de NCM
CREATE OR REPLACE FUNCTION public.get_ncm_info(p_ncm TEXT, p_uf CHAR(2) DEFAULT '*')
RETURNS TABLE (
  ncm TEXT, descricao TEXT, categoria TEXT,
  monofasico BOOLEAN, st_susceptivel BOOLEAN, cest_obrigatorio BOOLEAN,
  aliq_nacional NUMERIC, aliq_importado NUMERIC, aliq_estadual NUMERIC, aliq_municipal NUMERIC,
  fonte TEXT, versao_ibpt TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.ncm, r.descricao, r.categoria,
         r.monofasico, r.st_susceptivel, r.cest_obrigatorio,
         r.aliq_nacional, r.aliq_importado, r.aliq_estadual, r.aliq_municipal,
         r.fonte, r.versao_ibpt
  FROM public.fiscal_ncm_rules r
  WHERE r.ncm = p_ncm AND (r.uf = p_uf OR r.uf = '*')
  ORDER BY CASE WHEN r.uf = p_uf THEN 0 ELSE 1 END
  LIMIT 1;
$$;

-- 3. Job pg_cron para atualização diária (03:00)
-- NOTA: Requer pg_net habilitado no Supabase
-- SELECT cron.schedule(
--   'update-fiscal-rules-daily',
--   '0 3 * * *',
--   $$
--   SELECT net.http_post(
--     url := current_setting('app.settings.supabase_url') || '/functions/v1/update-fiscal-rules',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- 4. Tabela fiscal_st_rules (se ainda não existir)
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
ALTER TABLE public.fiscal_st_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read global ST rules" ON public.fiscal_st_rules;
CREATE POLICY "Users can read global ST rules"
  ON public.fiscal_st_rules FOR SELECT TO authenticated USING (is_global = true);

DROP POLICY IF EXISTS "Users can read own company ST rules" ON public.fiscal_st_rules;
CREATE POLICY "Users can read own company ST rules"
  ON public.fiscal_st_rules FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own company ST rules" ON public.fiscal_st_rules;
CREATE POLICY "Users can manage own company ST rules"
  ON public.fiscal_st_rules FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

-- 5. Tabela fiscal_audit_log (se ainda não existir)
CREATE TABLE IF NOT EXISTS public.fiscal_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nfe_id UUID,
  note_type TEXT NOT NULL DEFAULT 'nfce',
  fiscal_mode TEXT NOT NULL DEFAULT 'AUTO',
  crt INTEGER NOT NULL DEFAULT 1,
  regras_aplicadas JSONB NOT NULL DEFAULT '[]'::jsonb,
  st_aplicado BOOLEAN NOT NULL DEFAULT false,
  difal_aplicado BOOLEAN NOT NULL DEFAULT false,
  pis_cofins_mode TEXT,
  risk_score INTEGER DEFAULT 0,
  risk_level TEXT DEFAULT 'low',
  inconsistencias JSONB DEFAULT '[]'::jsonb,
  decisao_engine JSONB DEFAULT '{}'::jsonb,
  fonte_dados TEXT DEFAULT 'LOCAL',
  confianca TEXT DEFAULT 'media',
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
