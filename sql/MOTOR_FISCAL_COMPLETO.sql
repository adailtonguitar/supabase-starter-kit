-- =============================================================================
-- MOTOR FISCAL COMPLETO — Anthosystem
-- Cole este SQL inteiro no SQL Editor do Supabase e execute.
-- Seguro para rodar múltiplas vezes (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- =============================================================================

-- =====================================================
-- 1. CAMPO presence_type NA TABELA sales
-- =====================================================

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS presence_type SMALLINT DEFAULT 1;

COMMENT ON COLUMN public.sales.presence_type IS 'Tipo de presença do comprador (indPres SEFAZ): 1=Presencial, 2=Internet, 3=Telefone, 9=Outros';

CREATE INDEX IF NOT EXISTS idx_sales_presence_type ON public.sales(presence_type);

-- =====================================================
-- 2. COLUNA sale_id EM fiscal_documents
-- =====================================================

ALTER TABLE public.fiscal_documents
  ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_sale_company
  ON public.fiscal_documents (company_id, sale_id)
  WHERE sale_id IS NOT NULL;

COMMENT ON COLUMN public.fiscal_documents.sale_id IS 'Venda PDV/origem — usado pela fila fiscal e reconciliacao.';

-- =====================================================
-- 3. GRANT para invalidate_session
-- =====================================================

GRANT EXECUTE ON FUNCTION public.invalidate_session(TEXT) TO authenticated, anon;

-- =====================================================
-- 4. TABELA tax_rules — Alíquotas ICMS configuráveis
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tax_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uf_origem CHAR(2) NOT NULL,
  uf_destino CHAR(2) NOT NULL,
  aliq_interestadual NUMERIC(5,2) NOT NULL DEFAULT 12,
  aliq_interna_destino NUMERIC(5,2) NOT NULL DEFAULT 18,
  fcp_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(uf_origem, uf_destino)
);

ALTER TABLE public.tax_rules ENABLE ROW LEVEL SECURITY;

-- Todos autenticados podem consultar (tabela de referência)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tax_rules' AND policyname = 'Authenticated can read tax_rules'
  ) THEN
    CREATE POLICY "Authenticated can read tax_rules"
      ON public.tax_rules FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Apenas admin pode alterar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tax_rules' AND policyname = 'Admin can manage tax_rules'
  ) THEN
    CREATE POLICY "Admin can manage tax_rules"
      ON public.tax_rules FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

COMMENT ON TABLE public.tax_rules IS 'Tabela de alíquotas ICMS interestaduais configuráveis para cálculo de DIFAL';

-- =====================================================
-- 5. DADOS INICIAIS — Principais rotas interestaduais
-- =====================================================

INSERT INTO public.tax_rules (uf_origem, uf_destino, aliq_interestadual, aliq_interna_destino, fcp_percent)
VALUES
  -- MA (origem típica) → principais destinos
  ('MA', 'PI', 12, 21, 2),
  ('MA', 'CE', 12, 20, 2),
  ('MA', 'PA', 12, 19, 2),
  ('MA', 'TO', 12, 20, 2),
  ('MA', 'BA', 12, 20.5, 2),
  ('MA', 'SP', 12, 18, 0),
  ('MA', 'RJ', 12, 22, 2),
  ('MA', 'MG', 12, 18, 2),
  ('MA', 'GO', 12, 19, 2),
  ('MA', 'DF', 12, 20, 0),
  -- SP (Sul/Sudeste → Norte/Nordeste = 7%)
  ('SP', 'MA', 7, 22, 2),
  ('SP', 'PI', 7, 21, 2),
  ('SP', 'CE', 7, 20, 2),
  ('SP', 'BA', 7, 20.5, 2),
  ('SP', 'RJ', 12, 22, 2),
  ('SP', 'MG', 12, 18, 2),
  ('SP', 'PR', 12, 19.5, 0),
  ('SP', 'SC', 12, 17, 0),
  ('SP', 'RS', 12, 17, 0)
ON CONFLICT (uf_origem, uf_destino) DO NOTHING;

-- =====================================================
-- FIM — Motor Fiscal pronto para uso
-- =====================================================
