-- =====================================================
-- Tax Rules — Tabela configurável de alíquotas ICMS
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
CREATE POLICY "Authenticated can read tax_rules"
  ON public.tax_rules FOR SELECT TO authenticated USING (true);

-- Apenas admin pode alterar (via has_role)
CREATE POLICY "Admin can manage tax_rules"
  ON public.tax_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.tax_rules IS 'Tabela de alíquotas ICMS interestaduais configuráveis para cálculo de DIFAL';

-- =====================================================
-- Dados iniciais — principais rotas interestaduais
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
