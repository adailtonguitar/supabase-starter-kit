-- =====================================================
-- Tax Rules by NCM — Regras tributárias por NCM/UF/Regime
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tax_rules_by_ncm (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ncm TEXT NOT NULL,
  uf_origem CHAR(2) NOT NULL DEFAULT '*',
  uf_destino CHAR(2) NOT NULL DEFAULT '*',
  regime TEXT NOT NULL CHECK (regime IN ('simples', 'normal')),
  tipo_cliente TEXT NOT NULL DEFAULT '*' CHECK (tipo_cliente IN ('cpf', 'cnpj_contribuinte', 'cnpj_nao_contribuinte', '*')),
  cst TEXT,                          -- para regime normal
  csosn TEXT,                        -- para simples
  icms_aliquota NUMERIC(5,2) NOT NULL DEFAULT 0,
  icms_reducao_base NUMERIC(5,2) NOT NULL DEFAULT 0,
  icms_st BOOLEAN NOT NULL DEFAULT false,
  mva NUMERIC(7,2) NOT NULL DEFAULT 0,
  fcp NUMERIC(5,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_rules_by_ncm_company ON public.tax_rules_by_ncm(company_id);
CREATE INDEX IF NOT EXISTS idx_tax_rules_by_ncm_ncm ON public.tax_rules_by_ncm(ncm);
CREATE INDEX IF NOT EXISTS idx_tax_rules_by_ncm_lookup ON public.tax_rules_by_ncm(company_id, ncm, regime, is_active);

ALTER TABLE public.tax_rules_by_ncm ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own company tax_rules_by_ncm" ON public.tax_rules_by_ncm;
CREATE POLICY "Users can read own company tax_rules_by_ncm"
  ON public.tax_rules_by_ncm FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own company tax_rules_by_ncm" ON public.tax_rules_by_ncm;
CREATE POLICY "Users can manage own company tax_rules_by_ncm"
  ON public.tax_rules_by_ncm FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

COMMENT ON TABLE public.tax_rules_by_ncm IS 'Regras tributárias configuráveis por NCM, UF, regime e tipo de cliente para classificação automática de ICMS/ST';
