-- =====================================================
-- Fiscal Learning Engine — Tabelas de aprendizado fiscal
-- =====================================================
-- EXECUTE NO SQL EDITOR DO SUPABASE

-- 1. Tabela de histórico de decisões fiscais
DROP TABLE IF EXISTS public.fiscal_decision_history CASCADE;
CREATE TABLE public.fiscal_decision_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nfe_id UUID,
  ncm TEXT NOT NULL,
  cest TEXT,
  cfop TEXT NOT NULL,
  uf_origem CHAR(2) NOT NULL,
  uf_destino CHAR(2),
  crt INTEGER NOT NULL DEFAULT 1,
  csosn TEXT,
  cst TEXT,
  pis_cst TEXT,
  cofins_cst TEXT,
  tem_st BOOLEAN NOT NULL DEFAULT false,
  tem_difal BOOLEAN NOT NULL DEFAULT false,
  origem INTEGER NOT NULL DEFAULT 0,
  valor_item NUMERIC(15,2),
  decisao_engine JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultado_sefaz TEXT NOT NULL DEFAULT 'pendente',
  codigo_rejeicao INTEGER,
  motivo_rejeicao TEXT,
  fonte_regra TEXT DEFAULT 'engine',
  override_aplicado BOOLEAN NOT NULL DEFAULT false,
  confianca_engine NUMERIC(3,2) DEFAULT 0,
  data_emissao TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fdh_company ON public.fiscal_decision_history(company_id);
CREATE INDEX idx_fdh_ncm ON public.fiscal_decision_history(ncm);
CREATE INDEX idx_fdh_lookup ON public.fiscal_decision_history(company_id, ncm, uf_origem, uf_destino);
CREATE INDEX idx_fdh_resultado ON public.fiscal_decision_history(resultado_sefaz);
CREATE INDEX idx_fdh_data ON public.fiscal_decision_history(data_emissao DESC);

ALTER TABLE public.fiscal_decision_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own company fiscal history" ON public.fiscal_decision_history;
CREATE POLICY "Users can read own company fiscal history"
  ON public.fiscal_decision_history FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own company fiscal history" ON public.fiscal_decision_history;
CREATE POLICY "Users can insert own company fiscal history"
  ON public.fiscal_decision_history FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Service can manage fiscal history" ON public.fiscal_decision_history;
CREATE POLICY "Service can manage fiscal history"
  ON public.fiscal_decision_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. Tabela de overrides manuais
DROP TABLE IF EXISTS public.fiscal_override_rules CASCADE;
CREATE TABLE public.fiscal_override_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ncm TEXT NOT NULL,
  uf CHAR(2) NOT NULL DEFAULT '*',
  cfop_forcado TEXT,
  csosn_forcado TEXT,
  cst_forcado TEXT,
  pis_cst_forcado TEXT,
  cofins_cst_forcado TEXT,
  st_forcado BOOLEAN,
  difal_forcado BOOLEAN,
  origem_forcada INTEGER,
  prioridade INTEGER NOT NULL DEFAULT 5 CHECK (prioridade BETWEEN 1 AND 10),
  motivo TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, ncm, uf)
);

CREATE INDEX idx_for_lookup ON public.fiscal_override_rules(company_id, ncm, uf) WHERE ativo = true;

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

DROP POLICY IF EXISTS "Service can manage overrides" ON public.fiscal_override_rules;
CREATE POLICY "Service can manage overrides"
  ON public.fiscal_override_rules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. Função para consultar padrão aprendido por NCM
DROP FUNCTION IF EXISTS public.get_fiscal_pattern(UUID, TEXT, CHAR(2), CHAR(2), INTEGER);
CREATE OR REPLACE FUNCTION public.get_fiscal_pattern(
  p_company_id UUID,
  p_ncm TEXT,
  p_uf_origem CHAR(2) DEFAULT NULL,
  p_uf_destino CHAR(2) DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  total_notas BIGINT,
  autorizadas BIGINT,
  rejeitadas BIGINT,
  taxa_sucesso NUMERIC,
  csosn_mais_usado TEXT,
  cst_mais_usado TEXT,
  cfop_mais_usado TEXT,
  pis_cst_mais_usado TEXT,
  st_frequente BOOLEAN,
  difal_frequente BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH historico AS (
    SELECT *
    FROM public.fiscal_decision_history
    WHERE company_id = p_company_id
      AND ncm = p_ncm
      AND (p_uf_origem IS NULL OR uf_origem = p_uf_origem)
      AND (p_uf_destino IS NULL OR uf_destino = p_uf_destino)
    ORDER BY data_emissao DESC
    LIMIT p_limit
  ),
  stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE resultado_sefaz = 'autorizada') as ok,
      COUNT(*) FILTER (WHERE resultado_sefaz = 'rejeitada') as rej,
      MODE() WITHIN GROUP (ORDER BY csosn) FILTER (WHERE resultado_sefaz = 'autorizada' AND csosn IS NOT NULL) as top_csosn,
      MODE() WITHIN GROUP (ORDER BY cst) FILTER (WHERE resultado_sefaz = 'autorizada' AND cst IS NOT NULL) as top_cst,
      MODE() WITHIN GROUP (ORDER BY cfop) FILTER (WHERE resultado_sefaz = 'autorizada') as top_cfop,
      MODE() WITHIN GROUP (ORDER BY pis_cst) FILTER (WHERE resultado_sefaz = 'autorizada' AND pis_cst IS NOT NULL) as top_pis,
      (COUNT(*) FILTER (WHERE tem_st = true))::float / GREATEST(COUNT(*), 1) > 0.5 as st_freq,
      (COUNT(*) FILTER (WHERE tem_difal = true))::float / GREATEST(COUNT(*), 1) > 0.5 as difal_freq
    FROM historico
  )
  SELECT
    s.total,
    s.ok,
    s.rej,
    CASE WHEN s.total > 0 THEN ROUND((s.ok::numeric / s.total) * 100, 2) ELSE 0 END,
    s.top_csosn,
    s.top_cst,
    s.top_cfop,
    s.top_pis,
    s.st_freq,
    s.difal_freq
  FROM stats s;
$$;

COMMENT ON FUNCTION public.get_fiscal_pattern IS 'Retorna padrão fiscal aprendido com base no histórico de decisões por NCM/UF.';
